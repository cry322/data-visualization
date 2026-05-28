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
  { value: "prePubs", label: "获奖前发文数量" },
  { value: "careerAge", label: "发表时职业年龄" },
  { value: "country", label: "发表机构国家" }
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
    title: "等待时间与获奖前发文积累",
    note: "纵轴使用近似对数刻度，压缩极高发文量个体，让中低积累区间更可读。",
    label: "获奖前发文数量（篇，对数刻度）",
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
  country: {
    title: "等待时间与发表机构国家",
    note: "按获奖论文发表时作者机构国家归类，显示样本量最高的国家/地区，其余合并为“其他”。",
    label: "发表该论文时的机构国家 / 地区",
    type: "category",
    value: row => row.primaryCountry
  }
};

let waitTimeState = {
  rows: [],
  filters: {
    yAxis: "prePubs",
    field: "all",
    country: "all",
    journal: "all"
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

function showHoverTooltip(event, row) {
  ensureHoverTooltip()
    .style("opacity", 1)
    .style("left", `${event.pageX + 10}px`)
    .style("top", `${event.pageY - 14}px`)
    .html(`
      <strong>${row.laureateName || "未知获奖人"}</strong>
      <span>${getFieldLabel(row.field)} · 等待 ${row.waitTime} 年</span>
    `);
}

function hideHoverTooltip() {
  d3.select("#waittime-hover-tooltip").style("opacity", 0);
}

function renderSidePanel(row, rows) {
  const panel = d3.select("#waittime-detail-panel");
  if (panel.empty()) return;

  if (!row) {
    const medianWait = d3.median(rows, item => item.waitTime);
    const medianPrePubs = d3.median(rows, item => item.prePrizePublicationCount);
    const medianCareerAge = d3.median(rows, item => item.careerAgeAtPaper);
    panel.html(`
      <div class="panel-title">样本概览</div>
      <div class="panel-note">悬浮任意散点查看记录详情。右侧面板固定在图外，不遮挡主图。</div>
      <div class="waittime-detail-row"><span>当前记录</span><strong>${d3.format(",")(rows.length)}</strong></div>
      <div class="waittime-detail-row"><span>等待时间中位数</span><strong>${formatMaybe(medianWait, " 年")}</strong></div>
      <div class="waittime-detail-row"><span>获奖前发文中位数</span><strong>${formatMaybe(medianPrePubs, " 篇")}</strong></div>
      <div class="waittime-detail-row"><span>职业年龄中位数</span><strong>${formatMaybe(medianCareerAge, " 年")}</strong></div>
    `);
    return;
  }

  panel.html(`
    <div class="panel-title">${row.laureateName || "未知获奖人"}</div>
    <div class="panel-note">${row.title || "未知论文"}</div>
    <div class="waittime-detail-row"><span>学科</span><strong>${getFieldLabel(row.field)}</strong></div>
    <div class="waittime-detail-row"><span>发表 / 获奖</span><strong>${row.publicationYear} / ${row.prizeYear}</strong></div>
    <div class="waittime-detail-row"><span>等待时间</span><strong>${row.waitTime} 年</strong></div>
    <div class="waittime-detail-row"><span>获奖前发文</span><strong>${row.prePrizePublicationCount} 篇</strong></div>
    <div class="waittime-detail-row"><span>发表时职业年龄</span><strong>${row.careerAgeAtPaper} 年</strong></div>
    <div class="waittime-detail-row"><span>机构国家</span><strong>${row.countries.length ? row.countries.map(getCountryName).join(", ") : "暂无"}</strong></div>
    <div class="waittime-detail-row"><span>机构</span><strong>${row.institutions.length ? row.institutions.join(", ") : "暂无"}</strong></div>
    <div class="waittime-detail-row"><span>期刊</span><strong>${row.sourceName}</strong></div>
  `);
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
          name: String(row.institution_display_name || "").trim()
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
    if (!paperId || !laureateId || (!country && !institution)) return;

    const key = `${laureateId}|${paperId}`;
    if (!lookup.has(key)) lookup.set(key, { countries: new Set(), institutions: new Set() });
    if (country) lookup.get(key).countries.add(country);
    if (institution) lookup.get(key).institutions.add(institution);
  });

  return new Map(
    [...lookup.entries()].map(([key, value]) => [
      key,
      {
        countries: [...value.countries].sort(),
        institutions: [...value.institutions].sort()
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
    const prizeYear = rows[0]?.prizeYear;
    laureateStats.set(laureateId, {
      firstPublicationYear,
      prePrizePublicationCount: rows.filter(row => row.publicationYear < prizeYear).length
    });
  });

  return normalized
    .map(row => {
      const stats = laureateStats.get(row.laureateId);
      const source = sourceLookup.get(row.paperId) || {};
      const affiliations = affiliationLookup.get(`${row.laureateId}|${row.paperId}`) || {};
      const countries = affiliations.countries || [];
      const institutions = affiliations.institutions || [];
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
        firstPublicationYear,
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

  const countries = [...new Set(rows.map(row => row.primaryCountry))]
    .filter(Boolean)
    .sort();
  populateSelect(
    "#waittime-country-filter",
    [
      { value: "all", label: "全部国家 / 地区" },
      ...countries.map(country => ({ value: country, label: country }))
    ],
    waitTimeState.filters.country
  );

  const journals = [...new Set(rows.map(row => row.sourceName || "未知期刊"))]
    .filter(Boolean)
    .sort();
  populateSelect(
    "#waittime-journal-filter",
    [
      { value: "all", label: "全部期刊" },
      ...journals.map(journal => ({ value: journal, label: journal }))
    ],
    waitTimeState.filters.journal
  );

  d3.select("#waittime-yaxis-filter").on("change", event => {
    waitTimeState.filters.yAxis = event.target.value;
    renderWaitTimeModule();
  });

  d3.select("#waittime-field-filter").on("change", event => {
    waitTimeState.filters.field = event.target.value;
    renderWaitTimeModule();
  });

  d3.select("#waittime-country-filter").on("change", event => {
    waitTimeState.filters.country = event.target.value;
    renderWaitTimeModule();
  });

  d3.select("#waittime-journal-filter").on("change", event => {
    waitTimeState.filters.journal = event.target.value;
    renderWaitTimeModule();
  });
}

function getFilteredRows() {
  return waitTimeState.rows.filter(row => {
    const fieldMatch = waitTimeState.filters.field === "all" ||
      row.field === waitTimeState.filters.field;
    const countryMatch = waitTimeState.filters.country === "all" ||
      row.primaryCountry === waitTimeState.filters.country;
    const journalMatch = waitTimeState.filters.journal === "all" ||
      row.sourceName === waitTimeState.filters.journal;
    return fieldMatch && countryMatch && journalMatch;
  });
}

function prepareWaitLayout() {
  const cards = d3.selectAll("#section-waittime .wait-layout .card");

  cards.each(function (_, index) {
    const card = d3.select(this);
    card.selectAll("*").remove();
    card
      .classed("placeholder-box", false)
      .classed("wait-chart-card", false)
      .classed("wait-main-card", index === 0)
      .classed("wait-detail-card", index === 1)
      .classed("wait-hidden-card", index === 2);
  });

  const main = d3.select("#section-waittime .wait-layout .card:nth-child(1)");
  main.append("div")
    .attr("class", "wait-card-header")
    .html(`
      <div class="panel-title" id="waittime-chart-title">等待时间影响因素</div>
      <div class="panel-note" id="waittime-chart-note">选择 Y 轴查看不同解释变量。</div>
    `);
  main.append("div").attr("id", "waittime-main-chart").attr("class", "waittime-chart");

  const detail = d3.select("#section-waittime .wait-layout .card:nth-child(2)");
  detail.append("div").attr("id", "waittime-detail-panel").attr("class", "waittime-detail-panel");
}

function renderWaitTimeModule() {
  const rows = getFilteredRows();
  const config = Y_CONFIGS[waitTimeState.filters.yAxis] || Y_CONFIGS.prePubs;
  d3.select("#waittime-chart-title").text(config.title);
  d3.select("#waittime-chart-note").text(config.note);
  renderScatter(config, rows);
  renderSidePanel(null, rows);
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
    ? { top: 34, right: 90, bottom: 68, left: 134 }
    : { top: 34, right: 150, bottom: 68, left: 82 };
  const bounds = container.node().getBoundingClientRect();
  const outerWidth = Math.max(720, bounds.width || 720);
  const width = outerWidth - margin.left - margin.right;
  const height = 520 - margin.top - margin.bottom;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr("width", "100%")
    .attr("height", height + margin.top + margin.bottom);

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear()
    .domain([0, d3.max(rows, row => row.waitTime) || 1])
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
    .call(d3.axisBottom(x).ticks(8));

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
      .attr("y", Math.max(12, Math.min(height - 8, y.scale(yMedian) + 4)))
      .text(`${config.medianLabel}：${d3.format(".0f")(yMedian)}${config.unit}`);
  }

  g.append("text")
    .attr("class", "waittime-reference-label")
    .attr("x", Math.min(width - 126, x(xMedian) + 8))
    .attr("y", 28)
    .text(`等待中位数：${d3.format(".0f")(xMedian)} 年`);

  g.selectAll(".waittime-dot")
    .data(rows, row => `${row.laureateId}-${row.paperId}-${row.title}`)
    .join("circle")
    .attr("class", "waittime-dot")
    .attr("cx", row => x(row.waitTime))
    .attr("cy", row => y.cy(row))
    .attr("r", 5.2)
    .attr("fill", row => FIELD_COLORS[row.field] || "#94a3b8")
    .attr("fill-opacity", 0.82)
    .attr("stroke", "#fffaf0")
    .attr("stroke-width", 1.4)
    .on("mousemove", (event, row) => {
      showHoverTooltip(event, row);
      renderSidePanel(row, rows);
    })
    .on("mouseleave", () => {
      hideHoverTooltip();
      renderSidePanel(null, rows);
    });

  g.append("text")
    .attr("x", width / 2)
    .attr("y", height + 48)
    .attr("text-anchor", "middle")
    .attr("class", "waittime-axis-label")
    .text("wait_time：获奖论文从发表到获奖的等待时间（年）");

  g.append("text")
    .attr("x", -height / 2)
    .attr("y", config.type === "category" ? -108 : -58)
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
      .padding(0.28);
    return {
      scale,
      cy: row => {
        const value = topValues.includes(config.value(row)) ? config.value(row) : "其他";
        return (scale(value) || 0) + scale.bandwidth() / 2;
      },
      axis: d3.axisLeft(scale).tickSize(0),
      gridAxis: width => d3.axisLeft(scale).tickSize(-width).tickFormat("")
    };
  }

  const scale = config.scale(rows, height);
  const tickValues = config.ticks?.filter(value => value <= scale.domain()[1]);
  const axis = d3.axisLeft(scale).ticks(6);
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
}
