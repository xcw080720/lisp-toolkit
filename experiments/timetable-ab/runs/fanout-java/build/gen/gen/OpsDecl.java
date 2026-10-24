package gen;

import fanout.Op;

// Emit 从 decls.json 生成的中间形态；注解只是 @Op，产物由 GenProc 长出来
@Op(name="add", params={"course"}, required={"course.name"}, text="加「{course.name}」", clamp={"course.day:1..7"})
final class Op0 {}

@Op(name="del", params={"match"}, required={"match"}, text="删掉「{match}」", clamp={})
final class Op1 {}

@Op(name="edit", params={"match", "set"}, required={"match", "set"}, text="把「{match}」改成别的", clamp={})
final class Op2 {}

@Op(name="move", params={"match", "day", "periodFrom", "periodTo"}, required={"match"}, text="挪「{match}」", clamp={})
final class Op3 {}

@Op(name="swap", params={"match", "with"}, required={"match", "with"}, text="换「{match}」和「{with}」", clamp={})
final class Op4 {}

