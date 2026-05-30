import { loadCSV } from "../utils/dataLoader.js";

const FIELD_COLORS = {
  Physics: "#8DB5CA",
  Chemistry: "#D8A24A",
  Medicine: "#76AD94"
};

const FIELD_LABELS = {
  Physics: "物理",
  Chemistry: "化学",
  Medicine: "生物"
};

const FIELD_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "Physics", label: "物理" },
  { value: "Chemistry", label: "化学" },
  { value: "Medicine", label: "生物" }
];

const Y_AXIS_OPTIONS = [
  { value: "prePubs", label: "首篇获奖论文前发文数量" },
  { value: "careerAge", label: "发表时职业年龄" },
  { value: "institutionHIndex", label: "发表机构 h-index" }
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

const DATA_PATHS = {
  publications: "data/matched_all_publications.csv",
  countries: "data/nobel_prize_author_country.csv",
  institutions: "data/nobel_prize_institution_summary.csv",
  sources: "data/nobel_prize_paper_source_info.csv"
};

const MAX_CAREER_AGE = 80;

const Y_CONFIGS = {
  prePubs: {
    title: "等待时间与首篇获奖论文前发文积累",
    note: "纵轴表示获奖人发表第一篇获奖论文之前的发文数量，使用近似对数刻度压缩极高发文量个体。",
    label: "首篇获奖论文前发文数量（篇，对数刻度）",
    medianLabel: "发文量中位数",
    unit: " 篇",
    type: "numeric",
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
    note: "职业年龄 = 该获奖论文发表年 - 获奖人最早发表年份；已过滤大于 80 年的异常点。",
    label: "发表该获奖论文时的职业年龄（年）",
    medianLabel: "职业年龄中位数",
    unit: " 年",
    type: "numeric",
    value: row => row.careerAgeAtPaper,
    scale: (rows, height) => d3.scaleLinear()
      .domain([0, d3.max(rows, row => row.careerAgeAtPaper) || 1])
      .nice()
      .range([height, 0])
  },
  institutionHIndex: {
    title: "等待时间与发表机构 h-index",
    note: "机构 h-index 来自 OpenAlex 机构元数据；同一获奖论文关联多个机构时，取最高 h-index 代表当时署名机构声誉。",
    label: "发表机构 h-index（最高值）",
    medianLabel: "机构 h-index 中位数",
    unit: "",
    type: "numeric",
    value: row => row.institutionHIndex,
    scale: (rows, height) => d3.scaleLinear()
      .domain([0, d3.max(rows, row => row.institutionHIndex) || 1])
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

function normalizeBool(value) {
  return String(value).toLowerCase() === "true";
}

function normalizeWorkId(value) {
  return String(value || "").trim();
}

function isPrizePaper(row) {
  return String(row.is_prize_winning_paper || "").toUpperCase() === "YES";
}

function getPublicationYear(row) {
  const year = toNumber(row.openalex_publication_year) ?? toNumber(row.nobel_pub_year);
  return year !== null && year >= 1800 && year <= 2026 ? year : null;
}

function getFieldLabel(field) {
  return FIELD_LABELS[field] || field || "未知";
}

function getCountryName(country) {
  if (!country) return "未知国家";
  return COUNTRY_NAMES[country] || country;
}

function titleCaseName(name) {
  return String(name || "")
    .split(/\s+/)
    .map(part => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part))
    .join(" ");
}

function cleanSourceName(value) {
  const source = String(value || "").trim();
  if (!source) return "未知期刊";
  return source
    .split("/")
    .map(part => part.trim())
    .filter(Boolean)[0] || source;
}


const MISSING_TEXT = "暂无";

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

function formatCount(value) {
  return d3.format(",")(value || 0);
}

function getRenderableRows(rows, config) {
  if (config.type === "numeric") {
    return rows.filter(row => Number.isFinite(config.value(row)));
  }
  return rows.filter(row => config.value(row));
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

  return row;
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
      .style("background", FIELD_COLORS[field] || "#94a3b8");
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
      "悬浮或键盘聚焦任意散点查看记录详情；右侧面板固定在图外，不遮挡主图。"
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
  appendDetailRow(panel, "机构国家", row.countries.length ? row.countries.map(getCountryName).join(", ") : MISSING_TEXT);
  appendDetailRow(panel, "机构", row.institutions.length ? row.institutions.join(", ") : MISSING_TEXT);
  appendDetailRow(panel, "期刊", row.sourceName || MISSING_TEXT);
}

function formatMaybe(value, suffix) {
  return value === undefined || value === null || Number.isNaN(value)
    ? "--"
    : `${d3.format(".0f")(value)}${suffix}`;
}

function buildInstitutionMetaLookup(rows) {
  return new Map(
    rows
      .filter(row => String(row.institution_id || "").trim())
      .map(row => [
        String(row.institution_id || "").trim(),
        {
          country: String(row.country_code || "").trim(),
          name: String(row.institution_display_name || "").trim(),
          hIndex: toNumber(row.institution_h_index)
        }
      ])
  );
}

function buildAffiliationLookup(rows, institutionMeta) {
  const lookup = new Map();

  rows.forEach(row => {
    const paperId = normalizeWorkId(row.openalex_paper_id);
    const laureateId = String(row.laureate_id || "").trim();
    const institutionId = String(row.institution_id || "").trim();
    const meta = institutionMeta.get(institutionId) || {};
    const country = String(row.country_code || "").trim() || meta.country || "";
    const institution = String(row.institution_display_name || "").trim() || meta.name || institutionId;
    const hIndex = toNumber(row.institution_h_index) ?? meta.hIndex;
    if (!paperId || !laureateId || (!country && !institution && !Number.isFinite(hIndex))) return;

    const key = `${laureateId}|${paperId}`;
    if (!lookup.has(key)) lookup.set(key, { countries: new Set(), institutions: new Set(), hIndexes: [] });
    if (country) lookup.get(key).countries.add(country);
    if (institution) lookup.get(key).institutions.add(institution);
    if (Number.isFinite(hIndex)) lookup.get(key).hIndexes.push(hIndex);
  });

  return new Map(
    [...lookup.entries()].map(([key, value]) => [
      key,
      {
        countries: [...value.countries].sort(),
        institutions: [...value.institutions].sort(),
        hIndexes: value.hIndexes
      }
    ])
  );
}

function buildSourceLookup(rows) {
  return new Map(
    rows
      .map(row => [
        normalizeWorkId(row.openalex_paper_id),
        {
          sourceType: row.source_type || "",
          sourceName: cleanSourceName(row.source_display_name || row.nobel_journal),
          sourceRawName: row.source_display_name || row.nobel_journal || "",
          sourceCountry: row.source_country_code || ""
        }
      ])
      .filter(([paperId]) => paperId)
  );
}

function buildWaitTimeRows(publications, affiliationLookup, sourceLookup) {
  const normalized = publications
    .map(row => ({
      raw: row,
      laureateId: String(row.laureate_id || "").trim(),
      laureateName: titleCaseName(row.laureate_name),
      field: row.field,
      prizeYear: toNumber(row.prize_year),
      publicationYear: getPublicationYear(row),
      waitTime: toNumber(row.wait_time),
      paperId: normalizeWorkId(row.openalex_paper_id),
      title: row.openalex_title || row.nobel_title || row.norm_title || "",
      sourceId: row.openalex_source_id || "",
      isPrize: isPrizePaper(row),
      needsManualReview: normalizeBool(row.needs_manual_review)
    }))
    .filter(row => row.laureateId && row.prizeYear !== null && row.publicationYear !== null);

  const byLaureate = d3.group(normalized, row => row.laureateId);
  const laureateStats = new Map();

  byLaureate.forEach((rows, laureateId) => {
    const firstPublicationYear = d3.min(rows, row => row.publicationYear);
    const firstPrizePaperYear = d3.min(
      rows.filter(row => row.isPrize),
      row => row.publicationYear
    );
    laureateStats.set(laureateId, {
      firstPublicationYear,
      firstPrizePaperYear,
      prePrizePublicationCount: rows.filter(row => row.publicationYear < firstPrizePaperYear).length
    });
  });

  return normalized
    .map(row => {
      const stats = laureateStats.get(row.laureateId);
      const source = sourceLookup.get(row.paperId) || {};
      const affiliations = affiliationLookup.get(`${row.laureateId}|${row.paperId}`) || {};
      const countries = affiliations.countries || [];
      const institutions = affiliations.institutions || [];
      const institutionHIndex = d3.max(affiliations.hIndexes || []);
      const firstPublicationYear = stats?.firstPublicationYear;
      const careerAgeAtPaper = row.publicationYear - firstPublicationYear;
      const careerAgeAtPrize = row.prizeYear - firstPublicationYear;

      return {
        ...row,
        sourceType: source.sourceType || "unknown",
        sourceName: source.sourceName || cleanSourceName(row.raw.nobel_journal),
        sourceRawName: source.sourceRawName || row.raw.nobel_journal || "",
        countries,
        institutions,
        primaryCountry: getCountryName(countries[0]),
        primaryInstitution: institutions[0] || "未知机构",
        institutionHIndex,
        firstPublicationYear,
        firstPrizePaperYear: stats?.firstPrizePaperYear,
        careerAgeAtPaper,
        careerAgeAtPrize,
        prePrizePublicationCount: stats?.prePrizePublicationCount ?? 0
      };
    })
    .filter(row =>
      row.isPrize &&
      row.waitTime !== null &&
      row.waitTime >= 0 &&
      Number.isFinite(row.careerAgeAtPaper) &&
      Number.isFinite(row.careerAgeAtPrize) &&
      row.careerAgeAtPaper >= 0 &&
      row.careerAgeAtPaper <= MAX_CAREER_AGE
    );
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

function setupFilters(rows) {
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
  return waitTimeState.rows.filter(row => {
    const fieldMatch = waitTimeState.filters.field === "all" ||
      row.field === waitTimeState.filters.field;
    return fieldMatch;
  });
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

  const margin = config.type === "category"
    ? { top: 40, right: 110, bottom: 76, left: 142 }
    : { top: 40, right: 156, bottom: 76, left: 90 };
  const bounds = container.node().getBoundingClientRect();
  const outerWidth = Math.max(720, bounds.width || 720);
  const chartHeight = config.type === "category" ? 610 : 570;
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
  const yMedian = config.type === "numeric" ? d3.median(rows, row => config.value(row)) || 0 : null;

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

  if (config.type === "numeric") {
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
      .text(`${config.medianLabel}：${d3.format(".0f")(yMedian)}${config.unit}`);
  }

  g.append("text")
    .attr("class", "waittime-reference-label")
    .attr("x", Math.min(width - 136, x(xMedian) + 10))
    .attr("y", 28)
    .text(`等待中位数：${d3.format(".0f")(xMedian)} 年`);

  const dotLayer = g.append("g")
    .attr("class", "waittime-dot-layer");

  const dots = dotLayer.selectAll(".waittime-dot")
    .data(rows, getRowKey)
    .join("circle")
    .attr("class", "waittime-dot")
    .attr("cx", row => x(row.waitTime))
    .attr("cy", row => y.cy(row))
    .attr("r", config.type === "category" ? 4.8 : 5.4)
    .attr("fill", row => FIELD_COLORS[row.field] || "#94a3b8")
    .attr("fill-opacity", config.type === "category" ? 0.72 : 0.78)
    .attr("stroke", "#fffefa")
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
    .text(row => `${row.laureateName || "未知获奖人"}｜${getFieldLabel(row.field)}｜等待 ${row.waitTime} 年`);

  g.append("text")
    .attr("x", width / 2)
    .attr("y", height + 54)
    .attr("text-anchor", "middle")
    .attr("class", "waittime-axis-label")
    .text("wait_time：获奖论文从发表到获奖的等待时间（年）");

  g.append("text")
    .attr("x", -height / 2)
    .attr("y", config.type === "category" ? -112 : -62)
    .attr("transform", "rotate(-90)")
    .attr("text-anchor", "middle")
    .attr("class", "waittime-axis-label")
    .text(config.label);

  renderLegend(g, width);
}

function buildY(config, rows, height) {
  if (config.type === "category") {
    const counts = d3.rollups(rows, values => values.length, row => config.value(row))
      .sort((a, b) => d3.descending(a[1], b[1]));
    const topValues = counts.slice(0, 14).map(([value]) => value);
    const hasOther = rows.some(row => !topValues.includes(config.value(row)));
    const domain = hasOther ? [...topValues, "其他"] : topValues;
    const scale = d3.scaleBand()
      .domain(domain)
      .range([0, height])
      .padding(0.3);
    const jitterSpan = Math.max(0, scale.bandwidth() * 0.68);

    return {
      scale,
      cy: row => {
        const value = topValues.includes(config.value(row)) ? config.value(row) : "其他";
        const center = (scale(value) || 0) + scale.bandwidth() / 2;
        return clamp(center + deterministicJitter(getRowKey(row), jitterSpan), 0, height);
      },
      axis: d3.axisLeft(scale).tickSize(0).tickPadding(10),
      gridAxis: width => d3.axisLeft(scale).tickSize(-width).tickFormat("")
    };
  }

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
    cy: row => scale(config.value(row)),
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

  Object.entries(FIELD_COLORS).forEach(([field, color], index) => {
    const item = legend.append("g").attr("transform", `translate(0,${index * 22})`);
    item.append("circle").attr("r", 5).attr("fill", color);
    item.append("text").attr("x", 13).attr("y", 4).text(getFieldLabel(field));
  });
}

export async function initWaitTimeModule() {
  prepareWaitLayout();

  d3.select("#waittime-main-chart")
    .append("div")
    .attr("class", "placeholder")
    .text("正在加载等待时间数据...");

  try {
    const [publications, countries, institutions, sources] = await Promise.all([
      loadCSV(DATA_PATHS.publications),
      loadCSV(DATA_PATHS.countries),
      loadCSV(DATA_PATHS.institutions),
      loadCSV(DATA_PATHS.sources)
    ]);

    const institutionMeta = buildInstitutionMetaLookup(institutions);
    const affiliationLookup = buildAffiliationLookup(countries, institutionMeta);
    const sourceLookup = buildSourceLookup(sources);
    waitTimeState.rows = buildWaitTimeRows(publications, affiliationLookup, sourceLookup);

    setupFilters(waitTimeState.rows);
    renderWaitTimeModule();
  } catch (error) {
    console.error("等待时间模块加载失败：", error);
    d3.select("#waittime-main-chart")
      .selectAll("*")
      .remove();
    d3.select("#waittime-main-chart")
      .append("div")
      .attr("class", "placeholder")
      .text("等待时间数据加载失败，请检查 CSV 路径或字段名称。");
    renderSidePanel(null, []);
  }
}
