import { initCareerModule } from "./charts/overview.js";
import { initWaitTimeModule } from "./charts/waitTime.js";
import { initSpecialAuthorsModule } from "./charts/specialAuthors.js";
import { initCountryMap } from "./charts/countryMap.js";
import { initInstitutionDetail } from "./charts/institutionDetail.js";
import { initInstitutionNetwork } from "./charts/institutionNetwork.js";
import { initInstitutionOverview } from "./charts/institutionOverview.js";
import { initInstitutionSankey } from "./charts/institutionSankey.js";
import { initTopicMigration } from "./charts/topicMigration.js";

const modules = [
  ["career", initCareerModule],
  ["waittime", initWaitTimeModule],
  ["special-authors", initSpecialAuthorsModule],
  ["institution-overview", initInstitutionOverview],
  ["country-map", initCountryMap],
  ["institution-detail", initInstitutionDetail],
  ["institution-network", initInstitutionNetwork],
  ["institution-sankey", initInstitutionSankey],
  ["topic-migration", initTopicMigration]
];
import { initInstitutionOverview } from "./charts/institutionOverview.js";
import { initCountryMap } from "./charts/countryMap.js";
import { initInstitutionNetwork } from "./charts/institutionNetwork.js";
import { initInstitutionSankey } from "./charts/institutionSankey.js";
import { initTopicMigration } from "./charts/topicMigration.js";
import { initInstitutionDetail } from "./charts/institutionDetail.js";

document.addEventListener("DOMContentLoaded", () => {
  console.log("页面框架已加载，开始初始化 D3 图表模块。");

  modules.forEach(([name, init]) => {
    try {
      init();
    } catch (error) {
      console.error(`初始化模块失败：${name}`, error);
    }
  });
  // 初始化各模块的占位框架，后续可在对应文件里填充真实图表
  initCareerModule();
  initWaitTimeModule();
  initSpecialAuthorsModule();
  initInstitutionDetail();
  initInstitutionOverview();
  initCountryMap();
  initInstitutionNetwork();
  initInstitutionSankey();
  initTopicMigration();
});
