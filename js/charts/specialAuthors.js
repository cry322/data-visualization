export function initSpecialAuthorsModule() {
  // 该模块负责特殊作者模块的占位框架。
  // TODO: 后续补充作者分类图、特殊作者路径及相关注释。
  const placeholders = [
    "特殊作者图 1 在此修改：用于展示特殊作者或作者群体的分析。",
    "特殊作者图 2 在此修改：用于补充另一个特殊作者视角。"
  ];

  d3.selectAll("#section-special .special-layout .placeholder").each(function (d, i) {
    d3.select(this).text(placeholders[i]);
  });
}
