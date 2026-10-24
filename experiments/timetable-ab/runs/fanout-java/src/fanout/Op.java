package fanout;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 一条 op 声明的中间形态。真源是 decls.json，Emit 把它翻成这种注解源，
 * 再由 fanout.GenProc 在编译期把 5 样产物生成出来。
 * SOURCE 保留：产物在编译期落地，运行期不需要这些元信息。
 */
@Retention(RetentionPolicy.SOURCE)
@Target(ElementType.TYPE)
public @interface Op {
    String name();

    String[] params() default {};

    String[] required() default {};

    String text();

    String[] clamp() default {};
}
