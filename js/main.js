import { initCareerModule } from "./charts/overview.js";
import { initWaitTimeModule } from "./charts/waitTime.js";
import { initCountryMap } from "./charts/countryMap.js";
import { initInstitutionNetwork } from "./charts/institutionNetwork.js";
import { initInstitutionOverview } from "./charts/institutionOverview.js";
import { initInstitutionSankey } from "./charts/institutionSankey.js";
import { initTopicMigration } from "./charts/topicMigration.js";

const modules = [
  ["career", initCareerModule],
  ["waittime", initWaitTimeModule],
  ["institution-overview", initInstitutionOverview],
  ["country-map", initCountryMap],
  ["institution-network", initInstitutionNetwork],
  ["institution-sankey", initInstitutionSankey],
  ["topic-migration", initTopicMigration]
];

document.addEventListener("DOMContentLoaded", () => {
  initThemeToggle();
  initStoryTyping();

  modules.forEach(([name, init]) => {
    try {
      if (init) init();
    } catch (error) {
      console.error(`Module failed: ${name}`, error);
    }
  });

  initSectionNav();
  window.setTimeout(applyChartTheme, 400);
});

function initThemeToggle() {
  const STORAGE_KEY = "nobel-viz-theme";
  const root = document.documentElement;
  const toggle = document.querySelector("#theme-toggle");
  const label = toggle?.querySelector(".theme-toggle-label");
  const requestedTheme = new URLSearchParams(window.location.search).get("theme");
  const storedTheme = localStorage.getItem(STORAGE_KEY);
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const initialTheme = requestedTheme || storedTheme || (prefersDark ? "dark" : "light");

  const setTheme = (theme) => {
    const normalizedTheme = theme === "dark" ? "dark" : "light";
    root.dataset.theme = normalizedTheme;
    localStorage.setItem(STORAGE_KEY, normalizedTheme);

    if (toggle) {
      const isDark = normalizedTheme === "dark";
      toggle.setAttribute("aria-pressed", String(isDark));
      toggle.setAttribute("aria-label", isDark ? "切换为亮色模式" : "切换为护眼模式");
    }

    if (label) {
      label.textContent = normalizedTheme === "dark" ? "亮色模式" : "护眼模式";
    }

    window.requestAnimationFrame(applyChartTheme);
    window.dispatchEvent(new CustomEvent("themechange", { detail: { theme: normalizedTheme } }));
  };

  setTheme(initialTheme);
  initChartThemeRefresh();

  toggle?.addEventListener("click", () => {
    setTheme(root.dataset.theme === "dark" ? "light" : "dark");
  });
}

function initStoryTyping() {
  const storyBlocks = Array.from(document.querySelectorAll(".story-copy[data-story-text]"));

  if (!storyBlocks.length) return;

  storyBlocks.forEach((block) => {
    block.textContent = block.dataset.storyText || "";
  });
}

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function applyChartTheme() {
  const axisColor = getCssVar("--chart-axis") || "#8a96a6";
  const labelColor = getCssVar("--chart-label") || "#334155";
  const gridColor = getCssVar("--chart-grid") || "rgba(129, 115, 97, 0.16)";
  const bgColor = getCssVar("--chart-bg") || "#fbfcfd";
  const isDark = document.documentElement.dataset.theme === "dark";

  d3.selectAll("svg .domain, svg .tick line")
    .attr("stroke", axisColor)
    .style("stroke", axisColor);

  d3.selectAll("svg .tick text, svg text")
    .filter(function() {
      return !this.closest(".map-path");
    })
    .style("fill", labelColor)
    .attr("fill", labelColor);

  d3.selectAll(".waittime-grid line, .career-left-grid line, .career-right-grid line, .river-axis line, .river-center-line")
    .attr("stroke", gridColor)
    .style("stroke", gridColor);

  d3.selectAll(".waittime-plot-bg")
    .attr("fill", bgColor)
    .style("fill", bgColor)
    .attr("stroke", isDark ? "rgba(214,205,232,0.14)" : "rgba(216,222,232,0.72)");

  d3.selectAll("#country-map-chart svg > rect")
    .attr("fill", bgColor);

  d3.selectAll(".map-path")
    .attr("stroke", axisColor);

  d3.selectAll(".network-background circle, .citation-network-axis, .river-center-line")
    .attr("stroke", gridColor)
    .style("stroke", gridColor);

  d3.selectAll(".sankey-node text, .sankey-legend text, .topic-node-label, .topic-column-title, .citation-node-label, .citation-layer-label, .citation-network-note, .citation-legend, .river-topic-label, .river-legend, .river-note, .bar-label, .x-axis-label")
    .attr("fill", labelColor)
    .style("fill", labelColor);

  d3.selectAll(".waittime-dot, .career-right-dot, .topic-node, .citation-node")
    .attr("stroke", isDark ? "#171420" : "#fffefa");
}

function initChartThemeRefresh() {
  const chartRoot = document.querySelector("main");
  if (!chartRoot || !("MutationObserver" in window)) return;

  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    window.setTimeout(() => {
      pending = false;
      applyChartTheme();
    }, 80);
  });

  observer.observe(chartRoot, {
    childList: true,
    subtree: true
  });
}

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
