'use strict';

const DAY_NAMES = {
  1: '周一', 2: '周二', 3: '周三', 4: '周四',
  5: '周五', 6: '周六', 7: '周日',
};

const sumBy = (list, key) => {
  const grouped = (list ?? [])
    .filter((item) => item?.[key] !== undefined && item?.[key] !== null)
    .map((item) => [item[key], Number(item?.v ?? 0)])
    .reduce((acc, [k, v]) => ({ ...acc, [k]: (acc[k] ?? 0) + v }), {});
  // 键按数字升序：显式排序，不依赖对象整数键的隐式顺序
  return Object.entries(grouped)
    .sort(([ka], [kb]) => Number(ka) - Number(kb))
    .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});
};

const pick = (obj, path) =>
  String(path ?? '')
    .split('.')
    .reduce((node, seg) => node?.[seg] ?? null, obj);

const fmt = (list) =>
  [...(list ?? [])]
    .sort((a, b) => (a.day ?? 0) - (b.day ?? 0) || (a.pf ?? 0) - (b.pf ?? 0))
    .map(({ day, name, pf, pt }) => `${DAY_NAMES[day] ?? `周${day}`} ${pf}-${pt} ${name}`)
    .join('；');

module.exports = { sumBy, pick, fmt };
