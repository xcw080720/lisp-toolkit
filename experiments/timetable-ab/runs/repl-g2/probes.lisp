;; probes.lisp — 活体会话里连发的一批 form（不是探针脚本，是直接问会话）
(load "impl.lisp")
;; 1) 我依赖的 push 语义：push 到 (cdr c) 是否真的改到原对象的 cdr，而不是副本
(macroexpand-1 '(push (cons "tag" :null) (cdr c)))
;; 2) 既然要强制 UTF-8 输出，先问会话：更省事的那个 setf 到底存不存在
(list :setf-fd-ef (fboundp '(setf sb-impl::fd-stream-external-format))
      :make-fd-stream (fboundp 'sb-sys:make-fd-stream))
;; 3) 直接在会话里跑 impl 的函数，看它把 JSON 读成什么
(jget (jparse "{\"a\":\"\\u4e2d\\u6587\",\"b\":[1,2.5,null,true]}") "a")
(jget (jparse "{\"a\":\"\\u4e2d\\u6587\",\"b\":[1,2.5,null,true]}") "b")
;; 4) 边界：空 ops
(run-file "e1.json")
;; 5) 边界：swap 两侧各要恰好 1 门，这里 match=高数 命中 2 门
(run-file "e2.json")
