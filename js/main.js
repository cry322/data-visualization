import { initCareerModule } from "./charts/overview.js";
import { initWaitTimeModule } from "./charts/waitTime.js";
import { initCountryMap } from "./charts/countryMap.js";
import { initInstitutionDetail } from "./charts/institutionDetail.js";
import { initInstitutionNetwork } from "./charts/institutionNetwork.js";
import { initInstitutionOverview } from "./charts/institutionOverview.js";
import { initInstitutionSankey } from "./charts/institutionSankey.js";
import { initTopicMigration } from "./charts/topicMigration.js";

const modules = [
  ["career", initCareerModule],
  ["waittime", initWaitTimeModule],
  ["institution-overview", initInstitutionOverview],
  ["country-map", initCountryMap],
  ["institution-detail", initInstitutionDetail],
  ["institution-network", initInstitutionNetwork],
  ["institution-sankey", initInstitutionSankey],
  ["topic-migration", initTopicMigration]
];

document.addEventListener("DOMContentLoaded", () => {
  console.log("初始化所有模块");

  modules.forEach(([name, init]) => {
    try {
      if (init) init(); // 防御
    } catch (error) {
      console.error(`模块失败：${name}`, error);
    }
  });

}

);
