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
  modules.forEach(([name, init]) => {
    try {
      if (init) init();
    } catch (error) {
      console.error(`Module failed: ${name}`, error);
    }
  });

  initSectionNav();
});

function initSectionNav() {
  const navLinks = Array.from(document.querySelectorAll(".global-subnav a[href^='#']"));
  const sections = navLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  if (!navLinks.length || !sections.length) return;

  const setActiveLink = (sectionId) => {
    navLinks.forEach((link) => {
      link.classList.toggle("is-active", link.getAttribute("href") === `#${sectionId}`);
    });
  };

  const updateActiveLink = () => {
    const marker = window.innerHeight * 0.42;
    let currentSection = sections[0];

    sections.forEach((section) => {
      if (section.getBoundingClientRect().top <= marker) {
        currentSection = section;
      }
    });

    setActiveLink(currentSection.id);
  };

  let ticking = false;
  const requestUpdate = () => {
    if (ticking) return;

    ticking = true;
    window.requestAnimationFrame(() => {
      updateActiveLink();
      ticking = false;
    });
  };

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      const sectionId = link.getAttribute("href").slice(1);
      setActiveLink(sectionId);
    });
  });

  updateActiveLink();
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  window.addEventListener("hashchange", () => {
    const sectionId = window.location.hash.slice(1);
    if (sections.some((section) => section.id === sectionId)) {
      setActiveLink(sectionId);
    }
  });
}
