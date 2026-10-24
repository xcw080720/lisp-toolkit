// generated from decls.json; do not edit

// 加「<course.name>」
function add(course) {
  return { op: "add", args: { course } };
}

// 删掉「<match>」
function del(match) {
  return { op: "del", args: { match } };
}

// 把「<match>」改成别的
function edit(match, set) {
  return { op: "edit", args: { match, set } };
}

// 挪「<match>」
function move(match, day, periodFrom, periodTo) {
  return { op: "move", args: { match, day, periodFrom, periodTo } };
}

// 换「<match>」和「<with>」
function swap(match, with) {
  return { op: "swap", args: { match, with } };
}

module.exports = { add, del, edit, move, swap };
