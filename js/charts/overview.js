export function initCareerModule() {
  // 该模块负责职业阶段联动视图的占位框架。
  // TODO: 后续填充宏观总览图、学科筛选逻辑以及职业轨迹细节。
  const overviewTarget = d3.select("#career-overview");
  overviewTarget.selectAll("*").remove();
  overviewTarget
    .append("div")
    .attr("class", "placeholder")
    .text("宏观总览图位置在此修改：学科筛选控制右侧细节。");

  const detailTarget = d3.select("#career-detail");
  detailTarget.selectAll("*").remove();
  detailTarget
    .append("div")
    .attr("class", "placeholder")
    .text("生涯轨迹图位置在此修改：支持科学家个体切换。\n右侧图表由该模块负责渲染。");
}
