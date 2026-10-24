// client.js — 由 emit.cjs 从 decls.json 生成，勿手改。
'use strict';

function add(course) {
  return { op: "add", args: { "course": course } };
}

function del(match) {
  return { op: "del", args: { "match": match } };
}

function edit(match, set) {
  return { op: "edit", args: { "match": match, "set": set } };
}

function move(match, day, periodFrom, periodTo) {
  return { op: "move", args: { "match": match, "day": day, "periodFrom": periodFrom, "periodTo": periodTo } };
}

// swap(match, with)  ← 声明原名；with 是保留字
function swap(match, with$) {
  return { op: "swap", args: { "match": match, "with": with$ } };
}

module.exports = { add, del, edit, move, swap };
