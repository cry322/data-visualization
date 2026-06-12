import { loadJSON } from "../utils/dataLoader.js";

const FIELD_COLORS = {
  light: {
    Physics: "#6f6fb0",
    Chemistry: "#6f9b7d",
    Medicine: "#c9796f"
  },
  dark: {
    Physics: "#b8a8e6",
    Chemistry: "#9fcfac",
    Medicine: "#e3a09a"
  }
};

const FIELD_LABELS = {
  Physics: "Physics",
  Chemistry: "Chemistry",
  Medicine: "Medicine"
};

const FIELD_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "Physics", label: "Physics" },
  { value: "Chemistry", label: "Chemistry" },
  { value: "Medicine", label: "Medicine" }
];

const Y_AXIS_OPTIONS = [
  { value: "prePubs", label: "首篇获奖论文前发文数量" },
  { value: "careerAge", label: "发表时职业年龄" }
];

const COUNTRY_NAMES = {
  AR: "Argentina",
  AU: "Australia",
  BE: "Belgium",
  BI: "Burundi",
  CA: "Canada",
  CH: "Switzerland",
  CL: "Chile",
  CN: "China",
  DE: "Germany",
  DK: "Denmark",
  ES: "Spain",
  FR: "France",
  GB: "United Kingdom",
  IL: "Israel",
  IT: "Italy",
  JP: "Japan",
  MY: "Malaysia",
  NL: "Netherlands",
  NO: "Norway",
  PL: "Poland",
  RU: "Russia",
  SE: "Sweden",
  TZ: "Tanzania",
  US: "United States"
};

const DATA_PATH = "data_final/section2/wait_time.json";
const MISSING_TEXT = "暂无";

const Y_CONFIGS = {
  prePubs: {
    title: "等待时间与首篇获奖论文前发文积累",
    note: "纵轴表示获奖人发表第一篇获奖论文之前的发文数量，使用近似对数刻度压缩极高发文量个体。",
    label: "首篇获奖论文前发文数量（篇，对数刻度）",
    medianLabel: "发文量中位数",
    unit: " 篇",
    value: row => row.prePrizePublicationCount,
    scale: (rows, height) => d3.scaleSymlog()
      .constant(10)
      .domain([0, d3.max(rows, row => row.prePrizePublicationCount) || 1])
      .nice()
      .range([height, 0]),
    ticks: [0, 1, 5, 10, 25, 50, 100, 250, 500, 1000]
  },
  careerAge: {
    title: "等待时间与发表时职业年龄",
    note: "职业年龄 = 获奖论文发表年 - 获奖人最早发表年；已过滤大于 80 年的异常点。",
    label: "发表获奖论文时的职业年龄（年）",
    medianLabel: "职业年龄中位数",
    unit: " 年",
    value: row => row.careerAgeAtPaper,
    scale: (rows, height) => d3.scaleLinear()
      .domain([0, d3.max(rows, row => row.careerAgeAtPaper) || 1])
      .nice()
      .range([height, 0])
  }
};

let waitTimeState = {
  rows: [],
  filters: {
    yAxis: "prePubs",
    field: "all"
  }
};

function toNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getFieldLabel(field) {
  return FIELD_LABELS[field] || field || "未知";
}

function isDarkTheme() {
  return document.documentElement.dataset.theme === "dark";
}

function getFieldColor(field) {
  const palette = isDarkTheme() ? FIELD_COLORS.dark : FIELD_COLORS.light;
  return palette[field] || (isDarkTheme() ? "#d1c9dc" : "#8a96a6");
}

function getCountryName(country) {
  if (!country) return "未知国家";
  return COUNTRY_NAMES[country] || country;
}

function formatCount(value) {
  return d3.format(",")(value || 0);
}

function formatMaybe(value, suffix) {
  return value === undefined || value === null || Number.isNaN(value)
    ? "--"
    : `${d3.format(".0f")(value)}${suffix}`;
}

function getRowKey(row) {
  return [
    row.laureateId || "unknown-laureate",
    row.paperId || "unknown-paper",
    row.publicationYear || "unknown-year",
    row.title || "untitled"
  ].join("|");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashString(value) {
  const text = String(value || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function deterministicJitter(value, span) {
  if (!span) return 0;
  return ((hashString(value) % 1000) / 999 - 0.5) * span;
}

function getRenderableRows(rows, config) {
  return rows.filter(row => Number.isFinite(config.value(row)));
}

function appendPanelTitle(panel, title, note) {
  panel.append("div")
    .attr("class", "panel-title")
    .text(title);

  if (note) {
    panel.append("div")
      .attr("class", "panel-note")
      .text(note);
  }
}

function appendDetailRow(panel, label, value) {
  const row = panel.append("div")
    .attr("class", "waittime-detail-row");

  row.append("span").text(label);
  row.append("strong")
    .attr("title", String(value ?? MISSING_TEXT))
    .text(value ?? MISSING_TEXT);
}

function appendFieldBreakdown(panel, rows) {
  const fieldCounts = d3.rollups(rows, values => values.length, row => row.field)
    .sort((a, b) => d3.descending(a[1], b[1]));

  if (!fieldCounts.length) return;

  panel.append("div")
    .attr("class", "waittime-mini-title")
    .text("学科分布");

  const breakdown = panel.append("div")
    .attr("class", "waittime-field-breakdown");

  fieldCounts.forEach(([field, count]) => {
    const item = breakdown.append("div")
      .attr("class", "waittime-field-row");

    const label = item.append("span");
    label.append("i")
      .style("background", getFieldColor(field));
    label.append("span")
      .text(getFieldLabel(field));

    item.append("strong").text(`${formatCount(count)} 篇`);
  });
}

function ensureHoverTooltip() {
  let tooltip = d3.select("#waittime-hover-tooltip");
  if (tooltip.empty()) {
    tooltip = d3.select("body")
      .append("div")
      .attr("id", "waittime-hover-tooltip")
      .attr("class", "waittime-hover-tooltip");
  }
  return tooltip;
}

function moveHoverTooltip(event) {
  d3.select("#waittime-hover-tooltip")
    .style("left", `${event.pageX + 12}px`)
    .style("top", `${event.pageY - 16}px`);
}

function showHoverTooltip(event, row) {
  const tooltip = ensureHoverTooltip();
  tooltip.selectAll("*").remove();

  tooltip
    .attr("role", "status")
    .attr("aria-live", "polite")
    .style("opacity", 1);

  tooltip.append("strong")
    .text(row.laureateName || "未知获奖人");

  tooltip.append("span")
    .text(`${getFieldLabel(row.field)} · 等待 ${row.waitTime} 年`);

  moveHoverTooltip(event);
}

function hideHoverTooltip() {
  d3.select("#waittime-hover-tooltip")
    .style("opacity", 0);
}

function renderSidePanel(row, rows) {
  const panel = d3.select("#waittime-detail-panel");
  if (panel.empty()) return;

  panel.selectAll("*").remove();

  if (!row) {
    const medianWait = d3.median(rows, item => item.waitTime);
    const medianPrePubs = d3.median(rows, item => item.prePrizePublicationCount);
    const medianCareerAge = d3.median(rows, item => item.careerAgeAtPaper);

    appendPanelTitle(
      panel,
      "样本概览",
      "悬浮或键盘聚焦任意散点查看记录详情"
    );
    appendDetailRow(panel, "当前记录", formatCount(rows.length));
    appendDetailRow(panel, "等待时间中位数", formatMaybe(medianWait, " 年"));
    appendDetailRow(panel, "首篇获奖论文前发文中位数", formatMaybe(medianPrePubs, " 篇"));
    appendDetailRow(panel, "职业年龄中位数", formatMaybe(medianCareerAge, " 年"));
    appendFieldBreakdown(panel, rows);
    return;
  }

  appendPanelTitle(panel, row.laureateName || "未知获奖人", row.title || "未知论文");
  appendDetailRow(panel, "学科", getFieldLabel(row.field));
  appendDetailRow(panel, "发表 / 获奖", `${row.publicationYear} / ${row.prizeYear}`);
  appendDetailRow(panel, "等待时间", `${row.waitTime} 年`);
  appendDetailRow(panel, "首篇获奖论文前发文", `${row.prePrizePublicationCount} 篇`);
  appendDetailRow(panel, "发表时职业年龄", `${row.careerAgeAtPaper} 年`);
  appendDetailRow(panel, "机构国家", row.countries?.length ? row.countries.map(getCountryName).join(", ") : MISSING_TEXT);
  appendDetailRow(panel, "机构", row.institutions?.length ? row.institutions.join(", ") : MISSING_TEXT);
  appendDetailRow(panel, "期刊", row.sourceName || MISSING_TEXT);
}

function populateSelect(selectId, options, selectedValue) {
  const select = d3.select(selectId);
  if (select.empty()) return;

  select.selectAll("option")
    .data(options)
    .join("option")
    .attr("value", option => option.value)
    .text(option => option.label);

  select.property("value", selectedValue);
}

function setupFilters() {
  populateSelect("#waittime-yaxis-filter", Y_AXIS_OPTIONS, waitTimeState.filters.yAxis);
  populateSelect("#waittime-field-filter", FIELD_OPTIONS, waitTimeState.filters.field);

  d3.select("#waittime-yaxis-filter").on("change", event => {
    waitTimeState.filters.yAxis = event.target.value;
    renderWaitTimeModule();
  });

  d3.select("#waittime-field-filter").on("change", event => {
    waitTimeState.filters.field = event.target.value;
    renderWaitTimeModule();
  });
}

function getFilteredRows() {
  return waitTimeState.rows.filter(row =>
    waitTimeState.filters.field === "all" || row.field === waitTimeState.filters.field
  );
}

function prepareWaitLayout() {
  const cards = d3.selectAll("#section-waittime .wait-layout .card");

  cards.each(function (_, index) {
    const card = d3.select(this);
    card.selectAll("*").remove();
    card
      .classed("placeholder-box", false)
      .classed("wait-chart-card", true)
      .classed("wait-main-card", index === 0)
      .classed("wait-detail-card", index === 1)
      .classed("wait-hidden-card", index === 2);
  });

  const main = d3.select("#section-waittime .wait-layout .card:nth-child(1)");
  const header = main.append("div")
    .attr("class", "wait-card-header");

  header.append("div")
    .attr("class", "panel-title")
    .attr("id", "waittime-chart-title")
    .text("等待时间影响因素");

  header.append("div")
    .attr("class", "panel-note")
    .attr("id", "waittime-chart-note")
    .text("选择 Y 轴查看不同解释变量。");

  header.append("div")
    .attr("class", "waittime-chart-count")
    .attr("id", "waittime-chart-count")
    .text("--");

  main.append("div")
    .attr("id", "waittime-main-chart")
    .attr("class", "waittime-chart");

  const detail = d3.select("#section-waittime .wait-layout .card:nth-child(2)");
  detail.append("div")
    .attr("id", "waittime-detail-panel")
    .attr("class", "waittime-detail-panel");
}

function renderWaitTimeModule() {
  const filteredRows = getFilteredRows();
  const config = Y_CONFIGS[waitTimeState.filters.yAxis] || Y_CONFIGS.prePubs;
  const rows = getRenderableRows(filteredRows, config);
  const removed = filteredRows.length - rows.length;

  d3.select("#waittime-chart-title").text(config.title);
  d3.select("#waittime-chart-note").text(config.note);
  d3.select("#waittime-chart-count")
    .text(`${formatCount(rows.length)} 条记录${removed > 0 ? ` · 已排除 ${formatCount(removed)} 条缺失值` : ""}`);

  renderScatter(config, rows);
  renderSidePanel(null, rows);
}

function highlightRow(dotLayer, activeRow) {
  const activeKey = getRowKey(activeRow);
  dotLayer.selectAll(".waittime-dot")
    .classed("is-muted", row => getRowKey(row) !== activeKey)
    .classed("is-active", row => getRowKey(row) === activeKey);
}

function clearHighlight(dotLayer) {
  dotLayer.selectAll(".waittime-dot")
    .classed("is-muted", false)
    .classed("is-active", false);
}

function renderScatter(config, rows) {
  const container = d3.select("#waittime-main-chart");
  container.selectAll("*").remove();

  if (!rows.length) {
    container.append("div")
      .attr("class", "placeholder")
      .text("当前筛选条件下没有可展示的获奖论文记录。");
    return;
  }

  const margin = { top: 40, right: 230, bottom: 76, left: 90 };
  const bounds = container.node().getBoundingClientRect();
  const outerWidth = Math.max(720, bounds.width || 720);
  const chartHeight = 570;
  const width = outerWidth - margin.left - margin.right;
  const height = chartHeight - margin.top - margin.bottom;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr("width", "100%")
    .attr("height", height + margin.top + margin.bottom)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("role", "img")
    .attr("aria-label", `${config.title}散点图`);

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  g.append("rect")
    .attr("class", "waittime-plot-bg")
    .attr("width", width)
    .attr("height", height)
    .attr("rx", 14)
    .attr("ry", 14);

  const xMax = d3.max(rows, row => row.waitTime) || 1;
  const x = d3.scaleLinear()
    .domain([0, Math.max(1, xMax * 1.06)])
    .nice()
    .range([0, width]);

  const y = buildY(config, rows, height);
  const xMedian = d3.median(rows, row => row.waitTime) || 0;
  const yMedian = d3.median(rows, row => config.value(row)) || 0;

  g.append("g")
    .attr("class", "waittime-grid")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(8).tickSize(-height).tickFormat(""));

  g.append("g")
    .attr("class", "waittime-grid")
    .call(y.gridAxis(width));

  g.append("g")
    .attr("class", "waittime-axis")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(8).tickSizeOuter(0));

  g.append("g")
    .attr("class", "waittime-axis waittime-y-axis")
    .call(y.axis);

  g.append("line")
    .attr("class", "waittime-reference")
    .attr("x1", x(xMedian))
    .attr("x2", x(xMedian))
    .attr("y1", 0)
    .attr("y2", height);

  g.append("line")
    .attr("class", "waittime-reference")
    .attr("x1", 0)
    .attr("x2", width)
    .attr("y1", y.scale(yMedian))
    .attr("y2", y.scale(yMedian));

  g.append("text")
    .attr("class", "waittime-reference-label")
    .attr("x", width + 12)
    .attr("y", Math.max(14, Math.min(height - 8, y.scale(yMedian) + 4)))
    .text(`${config.medianLabel}: ${d3.format(".0f")(yMedian)}${config.unit}`);

  g.append("text")
    .attr("class", "waittime-reference-label")
    .attr("x", Math.min(width - 136, x(xMedian) + 10))
    .attr("y", 28)
    .text(`等待中位数: ${d3.format(".0f")(xMedian)} 年`);

  const dotLayer = g.append("g")
    .attr("class", "waittime-dot-layer");

  const dots = dotLayer.selectAll(".waittime-dot")
    .data(rows, getRowKey)
    .join("circle")
    .attr("class", "waittime-dot")
    .attr("cx", row => x(row.waitTime))
    .attr("cy", row => y.cy(row))
    .attr("r", 5.4)
    .attr("fill", row => getFieldColor(row.field))
    .attr("fill-opacity", isDarkTheme() ? 0.86 : 0.76)
    .attr("stroke", isDarkTheme() ? "#171420" : "#fffefa")
    .attr("stroke-width", 1.35)
    .attr("tabindex", 0)
    .attr("aria-label", row => `${row.laureateName || "未知获奖人"}，${getFieldLabel(row.field)}，等待 ${row.waitTime} 年`)
    .on("mouseenter", function (event, row) {
      showHoverTooltip(event, row);
      renderSidePanel(row, rows);
      highlightRow(dotLayer, row);
    })
    .on("mousemove", moveHoverTooltip)
    .on("mouseleave", () => {
      hideHoverTooltip();
      renderSidePanel(null, rows);
      clearHighlight(dotLayer);
    })
    .on("focus", function (event, row) {
      renderSidePanel(row, rows);
      highlightRow(dotLayer, row);
    })
    .on("blur", () => {
      renderSidePanel(null, rows);
      clearHighlight(dotLayer);
    });

  dots.append("title")
    .text(row => `${row.laureateName || "未知获奖人"} · ${getFieldLabel(row.field)} · 等待 ${row.waitTime} 年`);

  g.append("text")
    .attr("x", width / 2)
    .attr("y", height + 54)
    .attr("text-anchor", "middle")
    .attr("class", "waittime-axis-label")
    .text("wait_time: 获奖论文从发表到获奖的等待时间（年）");

  g.append("text")
    .attr("x", -height / 2)
    .attr("y", -62)
    .attr("transform", "rotate(-90)")
    .attr("text-anchor", "middle")
    .attr("class", "waittime-axis-label")
    .text(config.label);

  renderLegend(g, width);
}

function buildY(config, rows, height) {
  const scale = config.scale(rows, height);
  const tickValues = config.ticks?.filter(value => value <= scale.domain()[1]);
  const axis = d3.axisLeft(scale).ticks(6).tickSizeOuter(0).tickPadding(8);
  const gridAxis = d3.axisLeft(scale).ticks(6).tickSize(-height).tickFormat("");

  if (tickValues?.length) {
    axis.tickValues(tickValues).tickFormat(d3.format(","));
    gridAxis.tickValues(tickValues);
  }

  return {
    scale,
    cy: row => clamp(
      scale(config.value(row)) + deterministicJitter(getRowKey(row), 8),
      0,
      height
    ),
    axis,
    gridAxis: width => {
      gridAxis.tickSize(-width);
      return gridAxis;
    }
  };
}

function renderLegend(g, width) {
  const legend = g.append("g")
    .attr("class", "waittime-legend")
    .attr("transform", `translate(${Math.max(0, width - 78)},18)`);

  Object.keys(FIELD_COLORS.light).forEach((field, index) => {
    const color = getFieldColor(field);
    const item = legend.append("g").attr("transform", `translate(0,${index * 22})`);
    item.append("circle").attr("r", 5).attr("fill", color);
    item.append("text").attr("x", 13).attr("y", 4).text(getFieldLabel(field));
  });
}

function normalizeWaitRows(rows) {
  return (rows || []).map(row => ({
    ...row,
    prizeYear: toNumber(row.prizeYear),
    publicationYear: toNumber(row.publicationYear),
    waitTime: toNumber(row.waitTime),
    firstPublicationYear: toNumber(row.firstPublicationYear),
    firstPrizePaperYear: toNumber(row.firstPrizePaperYear),
    careerAgeAtPaper: toNumber(row.careerAgeAtPaper),
    careerAgeAtPrize: toNumber(row.careerAgeAtPrize),
    prePrizePublicationCount: toNumber(row.prePrizePublicationCount) ?? 0,
    countries: Array.isArray(row.countries) ? row.countries : [],
    institutions: Array.isArray(row.institutions) ? row.institutions : []
  }));
}

export async function initWaitTimeModule() {
  prepareWaitLayout();

  d3.select("#waittime-main-chart")
    .append("div")
    .attr("class", "placeholder")
    .text("正在加载等待时间数据...");

  try {
    const dataset = await loadJSON(DATA_PATH);
    waitTimeState.rows = normalizeWaitRows(dataset?.rows);

    setupFilters();
    renderWaitTimeModule();
    window.addEventListener("themechange", renderWaitTimeModule);
  } catch (error) {
    console.error("等待时间模块加载失败：", error);
    d3.select("#waittime-main-chart")
      .selectAll("*")
      .remove();
    d3.select("#waittime-main-chart")
      .append("div")
      .attr("class", "placeholder")
      .text("等待时间数据加载失败，请检查 JSON 路径或字段名称。");
    renderSidePanel(null, []);
  }
}
