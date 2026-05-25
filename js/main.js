import { initCareerModule } from "./charts/overview.js";
import { initWaitTimeModule } from "./charts/waitTime.js";
import { initSpecialAuthorsModule } from "./charts/specialAuthors.js";

document.addEventListener("DOMContentLoaded", () => {
  console.log("页面框架已加载：career / waittime / special authors 模块初始化。");

  // 初始化各模块的占位框架，后续可在对应文件里填充真实图表
  initCareerModule();
  initWaitTimeModule();
  initSpecialAuthorsModule();
});
