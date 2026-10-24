// impl.js —— 正规形式（plain）：for 循环 + 显式 if 判空 + '+' 拼接 + Object.keys 显式排序 + 下标访问
'use strict';

var DAY_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function sumBy(list, key) {
  var acc = {};
  var i = 0;
  if (!list) { return acc; }
  for (i = 0; i < list.length; i = i + 1) {
    var item = list[i];
    if (!item) { continue; }
    var groupKey = item[key];
    if (groupKey === undefined || groupKey === null) { continue; }
    var bucket = String(groupKey);
    if (acc[bucket] === undefined) { acc[bucket] = 0; }
    var num = item.v;
    if (num === undefined || num === null) { num = 0; }
    acc[bucket] = acc[bucket] + num;
  }
  var order = Object.keys(acc).sort(function (a, b) { return Number(a) - Number(b); });
  var out = {};
  for (i = 0; i < order.length; i = i + 1) {
    out[order[i]] = acc[order[i]];
  }
  return out;
}

function pick(obj, path) {
  if (obj === undefined || obj === null) { return null; }
  if (typeof path !== 'string' || path === '') { return null; }
  var segs = path.split('.');
  var cur = obj;
  var i = 0;
  for (i = 0; i < segs.length; i = i + 1) {
    if (cur === undefined || cur === null) { return null; }
    cur = cur[segs[i]];
  }
  if (cur === undefined) { return null; }
  return cur;
}

function fmt(list) {
  if (!list) { return ''; }
  if (list.length === 0) { return ''; }
  var idx = [];
  var i = 0;
  for (i = 0; i < list.length; i = i + 1) { idx[i] = i; }
  idx.sort(function (a, b) {
    var x = list[a];
    var y = list[b];
    if (x.day !== y.day) { return x.day - y.day; }
    return x.pf - y.pf;
  });
  var s = '';
  for (i = 0; i < idx.length; i = i + 1) {
    var it = list[idx[i]];
    if (i > 0) { s = s + '；'; }
    s = s + DAY_NAMES[it.day] + ' ' + it.pf + '-' + it.pt + ' ' + it.name;
  }
  return s;
}

module.exports = { sumBy: sumBy, pick: pick, fmt: fmt };
