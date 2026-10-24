// client.js — fanout.GenProc 编译期生成，别手改；函数参数名来自声明里的 params
'use strict';

function guard(op, args, required) {
  for (const path of required) {
    let v = args;
    for (const k of path.split('.')) v = (v == null) ? undefined : v[k];
    if (v === undefined || v === null) throw new Error(op + ': missing required ' + path);
  }
}

function call(op, params) { return { op, params }; }

/** add — 加「{course.name}」 */
function add(course) {
  guard('add', { course: course }, ["course.name"]);
  return call('add', { course: course });
}

/** del — 删掉「{match}」 */
function del(match) {
  guard('del', { match: match }, ["match"]);
  return call('del', { match: match });
}

/** edit — 把「{match}」改成别的 */
function edit(match, set) {
  guard('edit', { match: match, set: set }, ["match", "set"]);
  return call('edit', { match: match, set: set });
}

/** move — 挪「{match}」 */
function move(match, day, periodFrom, periodTo) {
  guard('move', { match: match, day: day, periodFrom: periodFrom, periodTo: periodTo }, ["match"]);
  return call('move', { match: match, day: day, periodFrom: periodFrom, periodTo: periodTo });
}

/** swap — 换「{match}」和「{with}」 */
function swap(match, with_) {
  guard('swap', { match: match, with: with_ }, ["match", "with"]);
  return call('swap', { match: match, with: with_ });
}

const api = { add, del, edit, move, swap };
if (typeof module !== 'undefined') module.exports = api;
