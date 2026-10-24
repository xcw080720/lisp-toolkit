;;;; impl.lisp — 课表 ops 执行器（规模臂，建时 5 op：add/del/edit/move/swap）
;;;; 权威顺序：experiments/timetable-ab/tasks/scale.spec.md > 本文件注释
;;;;
;;;; 边界契约（lisp-boundary）：
;;;;   标签 :null :true :false / (:obj . alist) 只活在 jparse 与 jwrite 之间；
;;;;   业务层只看 course 结构体与裸 alist。:obj 只出现在 3 处：
;;;;   j-obj 造它、course->json 造它、unwrap-obj/jwrite 认它。
;;;;   空对象 (:obj) → "{}"，空数组 '() → "[]"，缺失 → "null"，三者不压扁。

;;; ══ 1. 读入层：递归下降 JSON reader（标签在这里生成）═══════════════════

(defun skip-ws (s i)
  (let ((n (length s)))
    (loop while (and (< i n) (member (char s i) '(#\Space #\Tab #\Newline #\Return)))
          do (incf i))
    i))

(defun hex4 (s i)
  "读 4 位十六进制，返回 (values 值 下一位置)。"
  (let ((v 0))
    (dotimes (k 4)
      (setf v (+ (* v 16) (or (digit-char-p (char s (+ i k)) 16) 0))))
    (values v (+ i 4))))

(defun j-str (s i)
  "i 指向开引号；返回 (values 字符串 下一位置)。处理转义与代理对。"
  (let ((out (make-string-output-stream))
        (n (length s))
        (i (1+ i)))
    (loop
      (when (>= i n) (error "JSON 字符串未闭合"))
      (let ((c (char s i)))
        (cond
          ((char= c #\") (return (values (get-output-stream-string out) (1+ i))))
          ((char= c #\\)
           (let ((e (char s (1+ i))))
             (case e
               (#\" (write-char #\" out) (incf i 2))
               (#\\ (write-char #\\ out) (incf i 2))
               (#\/ (write-char #\/ out) (incf i 2))
               (#\b (write-char #\Backspace out) (incf i 2))
               (#\f (write-char #\Page out) (incf i 2))
               (#\n (write-char #\Newline out) (incf i 2))
               (#\r (write-char #\Return out) (incf i 2))
               (#\t (write-char #\Tab out) (incf i 2))
               (#\u (multiple-value-bind (cp j) (hex4 s (+ i 2))
                      ;; 增补平面：\uD83D\uDC0B 必须拼成一个码位，否则输出非法
                      (if (and (<= #xd800 cp #xdbff)
                               (< (+ j 1) n)
                               (char= (char s j) #\\)
                               (char= (char s (1+ j)) #\u))
                          (multiple-value-bind (lo j2) (hex4 s (+ j 2))
                            (write-char (code-char (+ #x10000
                                                      (* (- cp #xd800) #x400)
                                                      (- lo #xdc00)))
                                        out)
                            (setf i j2))
                          (progn (write-char (code-char cp) out)
                                 (setf i j)))))
               (t (write-char e out) (incf i 2)))))
          (t (write-char c out) (incf i)))))))

(defun j-num (s i)
  "整数走 parse-integer，带小数/指数走 double-float —— 输出端才不会再出现 2.5d0。"
  (let ((j i) (n (length s)))
    (loop while (and (< j n) (find (char s j) "+-0123456789.eE"))
          do (incf j))
    (let ((tok (subseq s i j)))
      (if (find-if (lambda (c) (member c '(#\. #\e #\E))) tok)
          (values (let ((*read-default-float-format* 'double-float))
                    (read-from-string tok))
                  j)
          (values (parse-integer tok) j)))))

(defun j-arr (s i)
  (let ((items '()) (i (skip-ws s (1+ i))))
    (if (char= (char s i) #\])
        (values '() (1+ i))                       ; 空数组 = nil
        (loop
          (multiple-value-bind (v i2) (j-val s i)
            (push v items)
            (let ((i3 (skip-ws s i2)))
              (if (char= (char s i3) #\,)
                  (setf i (skip-ws s (1+ i3)))
                  (return (values (nreverse items) (1+ i3))))))))))

(defun j-obj (s i)
  (let ((al '()) (i (skip-ws s (1+ i))))
    (if (char= (char s i) #\})
        (values (cons :obj nil) (1+ i))           ; 空对象 = (:obj)，不是 nil
        (loop
          (setf i (skip-ws s i))
          (multiple-value-bind (k i2) (j-str s i)
            (let ((i3 (skip-ws s i2)))            ; i3 指向 ':'
              (multiple-value-bind (v i4) (j-val s (1+ i3))
                (push (cons k v) al)
                (let ((i5 (skip-ws s i4)))
                  (if (char= (char s i5) #\,)
                      (setf i (skip-ws s (1+ i5)))
                      (return (values (cons :obj (nreverse al)) (1+ i5))))))))))))

(defun j-val (s i)
  (let ((i (skip-ws s i)))
    (case (char s i)
      (#\{ (j-obj s i))
      (#\[ (j-arr s i))
      (#\" (j-str s i))
      (#\t (values :true (+ i 4)))
      (#\f (values :false (+ i 5)))
      (#\n (values :null (+ i 4)))
      (t (j-num s i)))))

(defun jparse (s)
  (let ((i (skip-ws s 0)))
    (multiple-value-bind (v i2) (j-val s i)
      (declare (ignore i2))
      v)))

;;; ══ 2. 写出层：标签 → 文本（数字分类型，不一个 ~a 打通）════════════════

(defun jwrite-str (str out)
  (write-char #\" out)
  (loop for c across str
        do (case c
             (#\" (write-string "\\\"" out))
             (#\\ (write-string "\\\\" out))
             (#\Newline (write-string "\\n" out))
             (#\Return (write-string "\\r" out))
             (#\Tab (write-string "\\t" out))
             (t (if (< (char-code c) 32)
                    (format out "\\u~4,'0x" (char-code c))
                    (write-char c out)))))     ; 非 ASCII 直出原文：stdout 已是 UTF-8
  (write-char #\" out))

;; 注意：`loop for (k . v) ON al` 会把 k 绑成整个尾部；对 alist 必须用 IN 或 dolist。
(defun jwrite-obj (al out)
  (write-char #\{ out)
  (let ((first t))
    (dolist (pair al)
      (unless first (write-char #\, out))
      (setf first nil)
      (jwrite-str (car pair) out)
      (write-char #\: out)
      (jwrite (cdr pair) out)))
  (write-char #\} out))

(defun jwrite-arr (items out)
  (write-char #\[ out)
  (let ((first t))
    (dolist (v items)
      (unless first (write-char #\, out))
      (setf first nil)
      (jwrite v out)))
  (write-char #\] out))

(defun jwrite (v out)
  (cond
    ((eq v :null) (write-string "null" out))
    ((eq v :true) (write-string "true" out))
    ((eq v :false) (write-string "false" out))
    ((stringp v) (jwrite-str v out))
    ((integerp v) (format out "~d" v))          ; 整数不得写成 2.0
    ((floatp v) (format out "~f" v))
    ((and (consp v) (eq (car v) :obj)) (jwrite-obj (cdr v) out))
    ((listp v) (jwrite-arr v out))              ; 无 :obj 头的列表 = 数组
    (t (error "无法写出：~s" v))))

;;; ══ 3. 边界转换：进门摘标签、出门戴标签（各一处）═══════════════════════

(defun unwrap-obj (v)
  "(:obj . alist) → 裸 alist。业务层永不看见 :obj。"
  (if (and (consp v) (eq (car v) :obj))
      (copy-tree (cdr v))
      nil))

(defun al-get (al key &optional default)
  (let ((p (assoc key al :test #'equal)))
    (if p (cdr p) default)))

(defun json-array (v)
  (if (listp v) v '()))

;;; ══ 4. 业务层：只认裸值 ═══════════════════════════════════════════════

(defstruct (course (:constructor mk-course))
  name teacher location day periodFrom periodTo weeks tag)
;; weeks 槽：:null 或裸 alist（对象）；tag 槽：字符串或 :null

(defstruct (state (:constructor mk-state)) courses)

(defun ->int (v dflt)
  "JSON 数字 → 整数。2.5 → 2（判据 #21 要求 day 落成整数）。"
  (cond ((integerp v) v)
        ((floatp v) (round v))
        ((stringp v) (or (ignore-errors (parse-integer v :junk-allowed t)) dflt))
        (t dflt)))

(defun clamp-day (v)
  (max 1 (min 7 (->int v 1))))

(defun clamp-period (v)
  (max 1 (->int v 1)))

(defun default-weeks ()
  (list (cons "type" "range") (cons "from" 1) (cons "to" 16)))

(defun weeks-value (al)
  "取 weeks。缺失 / null / 空对象 {} / 无 type → 回落默认 range 1..16。
   空对象与缺失在 CL 里都会退化成 nil，这里用『至少要有 type』把两者一并收编。"
  (let ((w (al-get al "weeks")))
    (cond
      ((not (consp w)) (default-weeks))
      (t (let ((bare (unwrap-obj w)))
           (if (and (consp bare) (al-get bare "type"))
               bare
               (default-weeks)))))))

(defun course-from-json (v)
  (let* ((al (unwrap-obj v))
         (pf (clamp-period (al-get al "periodFrom")))
         (pt (max 1 (->int (al-get al "periodTo") (1+ pf))))
         (tag (al-get al "tag")))
    (mk-course :name (let ((x (al-get al "name"))) (if (stringp x) x ""))
               :teacher (let ((x (al-get al "teacher"))) (if (stringp x) x ""))
               :location (let ((x (al-get al "location"))) (if (stringp x) x ""))
               :day (clamp-day (al-get al "day"))
               :periodFrom pf
               :periodTo (max pt pf)
               :weeks (weeks-value al)
               :tag (if (stringp tag) tag :null))))

(defun course->json (c)
  (cons :obj
        (list (cons "name" (course-name c))
              (cons "teacher" (course-teacher c))
              (cons "location" (course-location c))
              (cons "day" (course-day c))
              (cons "periodFrom" (course-periodFrom c))
              (cons "periodTo" (course-periodTo c))
              (cons "weeks" (let ((w (course-weeks c)))
                              (if (eq w :null) :null (cons :obj w))))
              (cons "tag" (course-tag c)))))

(defun match-courses (courses pat)
  "名字含 pat 的全部课程。pat 非字符串或空串 → 不命中（空串语义未定义，不猜）。"
  (if (and (stringp pat) (plusp (length pat)))
      (remove-if-not (lambda (c) (search pat (course-name c))) courses)
      '()))

(defun apply-set (c al)
  "只改 set 里出现的键；日/节次夹紧，末尾修倒挂。"
  (dolist (key '("name" "teacher" "location"))
    (let ((v (al-get al key :none)))
      (when (stringp v)
        (ecase (intern (string-upcase key) :keyword)
          (:NAME (setf (course-name c) v))
          (:TEACHER (setf (course-teacher c) v))
          (:LOCATION (setf (course-location c) v))))))
  (let ((v (al-get al "day" :none)))
    (unless (eq v :none) (setf (course-day c) (clamp-day v))))
  (let ((v (al-get al "periodFrom" :none)))
    (unless (eq v :none) (setf (course-periodFrom c) (clamp-period v))))
  (let ((v (al-get al "periodTo" :none)))
    (unless (eq v :none) (setf (course-periodTo c) (max 1 (->int v 1)))))
  (let ((v (al-get al "weeks" :none)))
    (unless (eq v :none)
      (setf (course-weeks c) (weeks-value (list (cons "weeks" v))))))
  (let ((v (al-get al "tag" :none)))
    (unless (eq v :none)
      (setf (course-tag c) (if (stringp v) v :null))))
  (when (> (course-periodFrom c) (course-periodTo c))
    (setf (course-periodTo c) (course-periodFrom c))))

;;; ══ 5. 五个 op：每个只写自己的语义 ═══════════════════════════════════

(defun op-add (state op)
  (let ((c (course-from-json (al-get op "course"))))
    (setf (state-courses state) (append (state-courses state) (list c)))
    (values 1 (format nil "加「~a」周~d ~d–~d 节"
                      (course-name c) (course-day c)
                      (course-periodFrom c) (course-periodTo c)))))

(defun op-del (state op)
  (let* ((pat (al-get op "match"))
         (hit (match-courses (state-courses state) pat)))
    (if (null hit)
        (values 0 (format nil "没找到「~a」" (if (stringp pat) pat "")))
        (progn
          (setf (state-courses state)
                (remove-if (lambda (c) (member c hit :test #'eq)) (state-courses state)))
          (values (length hit) (format nil "删「~a」~d 门"
                                       (if (stringp pat) pat "") (length hit)))))))

(defun op-edit (state op)
  (let* ((pat (al-get op "match"))
         (set (al-get op "set"))
         (set-al (unwrap-obj set))
         (hit (match-courses (state-courses state) pat)))
    (dolist (c hit) (apply-set c set-al))
    (values (length hit)
            (format nil "改「~a」~d 门，键：~{~a~^/~}"
                    (if (stringp pat) pat "") (length hit)
                    (mapcar #'car set-al)))))

(defun op-move (state op)
  (let ((pat (al-get op "match" :none))
        (d (al-get op "day" :none))
        (pf (al-get op "periodFrom" :none))
        (pt (al-get op "periodTo" :none)))
    (if (or (eq pat :none) (eq d :none) (eq pf :none) (eq pt :none))
        (values 0 "缺字段（match/day/periodFrom/periodTo），未执行")
        (let ((hit (match-courses (state-courses state) pat))
              (day (clamp-day d))
              (from (clamp-period pf))
              (to (max (clamp-period pf) (max 1 (->int pt 1)))))
          (dolist (c hit)
            (setf (course-day c) day
                  (course-periodFrom c) from
                  (course-periodTo c) to))
          (values (length hit) (format nil "移动 ~d 门到周~d ~d–~d 节"
                                       (length hit) day from to))))))

(defun op-swap (state op)
  (let* ((pat (al-get op "match"))
         (wth (al-get op "with"))
         (a (match-courses (state-courses state) pat))
         (b (match-courses (state-courses state) wth)))
    (if (or (/= (length a) 1) (/= (length b) 1))
        (values 0 (format nil "swap 需两侧各命中恰好 1 门（左 ~d / 右 ~d），未执行"
                          (length a) (length b)))
        (let ((x (first a)) (y (first b)))
          (rotatef (course-day x) (course-day y))
          (rotatef (course-periodFrom x) (course-periodFrom y))
          (rotatef (course-periodTo x) (course-periodTo y))
          (values 2 (format nil "交换「~a」与「~a」"
                            (course-name x) (course-name y)))))))

;;; ══ 6. 分发：一张表 + 一个漏斗（不写 known-op 名单，登记即生效）════════

(defvar *ops* (make-hash-table :test #'equal))

(defun reg-op (name fn)
  (setf (gethash name *ops*) fn)
  name)

(reg-op "add" #'op-add)
(reg-op "del" #'op-del)
(reg-op "edit" #'op-edit)
(reg-op "move" #'op-move)
(reg-op "swap" #'op-swap)

(defun op-name (op)
  (let ((n (al-get op "op")))
    (if (stringp n) n "")))

(defun execute (state ops)
  "先整批校验再执行：任一未知 op → 整包拒绝，一条都不跑（结构性事实，见 handoff）。"
  (let* ((bare (mapcar #'unwrap-obj ops))
         (bad (find-if (lambda (o) (not (gethash (op-name o) *ops*))) bare)))
    (if bad
        (values "" 0 (list (format nil "1) 拒绝：未知 op ~a" (op-name bad))))
        (let ((n 0) (logs '()) (i 0))
          (dolist (o bare)
            (let ((fn (gethash (op-name o) *ops*)))
              (multiple-value-bind (cnt msg) (funcall fn state o)
                (incf n cnt)
                (push (format nil "~d) ~a" (incf i) msg) logs))))
          (values (format nil "~{~a~^ ~}" (mapcar #'op-name bare))
                  n
                  (nreverse logs))))))

;;; ══ 7. 入口 ═══════════════════════════════════════════════════════════

(defun slurp (path)
  (with-open-file (in path :external-format :utf-8)
    (with-output-to-string (out)
      (loop for ch = (read-char in nil nil) while ch do (write-char ch out)))))

(defun main ()
  (let* ((path (car (last sb-ext:*posix-argv*)))
         (input (jparse (slurp path)))
         (in-al (unwrap-obj input))
         (courses (mapcar #'course-from-json (json-array (al-get in-al "courses"))))
         (ops (json-array (al-get in-al "ops")))
         (state (mk-state :courses courses)))
    (multiple-value-bind (ops-text n logs) (execute state ops)
      (jwrite (cons :obj
                    (list (cons "opsText" ops-text)
                          (cons "courses" (mapcar #'course->json (state-courses state)))
                          (cons "log" logs)
                          (cons "n" n)))
              *standard-output*)
      (terpri)
      (finish-output))))

(main)
