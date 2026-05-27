import { loadCSV } from "../utils/dataLoader.js";

const FIELD_COLORS = {
  Physics: "#0072B2",
  Chemistry: "#D55E00",
  Medicine: "#009E73"
};

const FIELD_LABELS = {
  Physics: "物理",
  Chemistry: "化学",
  Medicine: "生物"
};

const FIELD_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "Physics", label: FIELD_LABELS.Physics },
  { value: "Chemistry", label: FIELD_LABELS.Chemistry },
  { value: "Medicine", label: FIELD_LABELS.Medicine }
];

const Y_AXIS_OPTIONS = [
  { value: "prePubs", label: "获奖前发文数量" },
  { value: "careerAge", label: "职业年龄" },
  { value: "country", label: "机构国家" },
  { value: "institution", label: "机构" }
];

const MAX_CAREER_AGE = 80;

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

let waitTimeState = {
  rows: [],
  filteredRows: [],
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
    .map(part => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function ensureTooltip() {
  let tooltip = d3.select("#waittime-tooltip");
  if (tooltip.empty()) {
    tooltip = d3.select("body")
      .append("div")
      .attr("id", "waittime-tooltip")
      .attr("class", "waittime-tooltip");
  }
  return tooltip;
}

function showTooltip(event, html) {
  ensureTooltip()
    .style("opacity", 1)
    .style("left", `${event.pageX + 14}px`)
    .style("top", `${event.pageY + 14}px`)
    .html(html);
}

function hideTooltip() {
  d3.select("#waittime-tooltip").style("opacity", 0);
}

function buildCountryLookup(rows) {
  return buildAffiliationLookup(rows, new Map());
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
          sourceName: row.source_display_name || row.nobel_journal || "",
          sourceCountry: row.source_country_code || ""
        }
      ])
      .filter(([paperId]) => paperId)
  );
}

function buildWaitTimeRows(publications, affiliationLookup, sourceLookup) {
  const byLaureate = d3.group(
    publications
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
        openalexType: row.openalex_type || "",
        sourceId: row.openalex_source_id || "",
        isPrize: isPrizePaper(row),
        matchStatus: row.match_status,
        needsManualReview: normalizeBool(row.needs_manual_review)
      }))
      .filter(row => row.laureateId && row.prizeYear !== null && row.publicationYear !== null),
    row => row.laureateId
  );

  const laureateStats = new Map();
  byLaureate.forEach((rows, laureateId) => {
    const years = rows.map(row => row.publicationYear).filter(Number.isFinite);
    const firstPublicationYear = d3.min(years);
    const prizeYear = rows[0]?.prizeYear;
    const prePrizePublicationCount = rows.filter(row => row.publicationYear < prizeYear).length;

    laureateStats.set(laureateId, {
      firstPublicationYear,
      prePrizePublicationCount
    });
  });

  return publications
    .map(row => {
      const laureateId = String(row.laureate_id || "").trim();
      const paperId = normalizeWorkId(row.openalex_paper_id);
      const publicationYear = getPublicationYear(row);
      const prizeYear = toNumber(row.prize_year);
      const waitTime = toNumber(row.wait_time);
      const stats = laureateStats.get(laureateId);
      const source = sourceLookup.get(paperId) || {};
      const affiliations = affiliationLookup.get(`${laureateId}|${paperId}`) || {};
      const countries = affiliations.countries || [];
      const institutions = affiliations.institutions || [];
      const firstPublicationYear = stats?.firstPublicationYear;
      const careerAgeAtPaper = publicationYear - firstPublicationYear;
      const careerAgeAtPrize = prizeYear - firstPublicationYear;

      return {
        laureateId,
        laureateName: titleCaseName(row.laureate_name),
        field: row.field,
        prizeYear,
        publicationYear,
        waitTime,
        paperId,
        title: row.openalex_title || row.nobel_title || row.norm_title || "",
        sourceType: source.sourceType || row.openalex_type || "unknown",
        sourceName: source.sourceName || row.nobel_journal || "未知来源",
        countries,
        institutions,
        primaryCountry: getCountryName(countries[0]),
        primaryInstitution: institutions[0] || "未知机构",
        isPrize: isPrizePaper(row),
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
      row.publicationYear !== null &&
      row.prizeYear !== null &&
      Number.isFinite(row.careerAgeAtPaper) &&
      Number.isFinite(row.careerAgeAtPrize) &&
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
      { value: "all", label: countries.length ? "全部国家 / 地区" : "全部（暂无国家数据）" },
      ...countries.map(country => ({ value: country, label: country }))
    ],
    waitTimeState.filters.country
  );
  d3.select("#waittime-country-filter").property("disabled", countries.length === 0);

  const journals = [...new Set(rows.map(row => row.sourceName || "未知来源"))]
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

function renderWaitTimeModule() {
  waitTimeState.filteredRows = getFilteredRows();
  renderScatter(waitTimeState.filteredRows);
  renderSummary(waitTimeState.filteredRows);
  renderInsights(waitTimeState.filteredRows);
}

function prepareWaitLayout() {
  const cards = d3.selectAll("#section-waittime .wait-layout .card")
    .classed("placeholder-box", false);

  cards.each(function (_, index) {
    const card = d3.select(this);
    card.selectAll("*").remove();
    card
      .classed("wait-main-card", index === 0)
      .classed("wait-side-card", index !== 0);
  });

  const first = d3.select("#section-waittime .wait-layout .card:nth-child(1)");
  first.append("div").attr("class", "wait-card-header")
    .html(`
      <div>
        <div class="panel-title">等待时间与获奖前发文积累</div>
        <div class="panel-note">每个点代表一条获奖论文记录；横轴越靠右表示等待越久，纵轴越高表示获奖前发表积累越多。</div>
      </div>
    `);
  first.append("div").attr("id", "waittime-main-chart").attr("class", "waittime-chart");

  const second = d3.select("#section-waittime .wait-layout .card:nth-child(2)");
  second.append("div").attr("class", "panel-title").text("样本概览");
  second.append("div").attr("id", "waittime-summary").attr("class", "waittime-summary");

  const third = d3.select("#section-waittime .wait-layout .card:nth-child(3)");
  third.append("div").attr("class", "panel-title").text("象限解读");
  third.append("div").attr("id", "waittime-insights").attr("class", "waittime-insights");
}

function renderScatter(rows) {
  const container = d3.select("#waittime-main-chart");
  container.selectAll("*").remove();

  if (!rows.length) {
    container.append("div")
      .attr("class", "placeholder")
      .text("当前筛选条件下没有可展示的获奖论文记录。");
    return;
  }

  const margin = { top: 34, right: 36, bottom: 64, left: 76 };
  const bounds = container.node().getBoundingClientRect();
  const width = Math.max(720, bounds.width || 720) - margin.left - margin.right;
  const height = 500 - margin.top - margin.bottom;

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

  const yConfig = buildYAxis(rows, height);
  const y = yConfig.scale;

  const xMedian = d3.median(rows, row => row.waitTime) || 0;
  const yMedian = yConfig.isNumeric ? d3.median(rows, row => yConfig.value(row)) || 0 : null;

  g.append("g")
    .attr("class", "waittime-grid")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(8).tickSize(-height).tickFormat(""));

  g.append("g")
    .attr("class", "waittime-grid")
    .call(yConfig.gridAxis(width));

  g.append("g")
    .attr("class", "waittime-axis")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(8));

  g.append("g")
    .attr("class", "waittime-axis")
    .call(yConfig.axis);

  g.append("line")
    .attr("class", "waittime-reference")
    .attr("x1", x(xMedian))
    .attr("x2", x(xMedian))
    .attr("y1", 0)
    .attr("y2", height);

  if (yConfig.isNumeric) {
    g.append("line")
      .attr("class", "waittime-reference")
      .attr("x1", 0)
      .attr("x2", width)
      .attr("y1", y(yMedian))
      .attr("y2", y(yMedian));
  }

  g.append("text")
    .attr("class", "waittime-reference-label")
    .attr("x", x(xMedian) + 6)
    .attr("y", 34)
    .text(`等待时间中位数：${d3.format(".0f")(xMedian)} 年`);

  if (yConfig.isNumeric) {
    g.append("text")
      .attr("class", "waittime-reference-label")
      .attr("x", 6)
      .attr("y", Math.min(height - 8, y(yMedian) + 20))
      .text(`${yConfig.medianLabel}：${d3.format(".0f")(yMedian)}${yConfig.unit}`);
  }

  g.selectAll(".waittime-dot")
    .data(rows, row => `${row.laureateId}-${row.paperId}-${row.title}`)
    .join("circle")
    .attr("class", "waittime-dot")
    .attr("cx", row => x(row.waitTime))
    .attr("cy", row => yConfig.cy(row))
    .attr("r", 5.5)
    .attr("fill", row => FIELD_COLORS[row.field] || "#6b7280")
    .attr("fill-opacity", 0.76)
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.1)
    .on("mousemove", (event, row) => showTooltip(event, `
      <strong>${row.laureateName || "未知获奖人"}</strong><br/>
      ${row.title || "未知论文"}<br/>
      学科：${getFieldLabel(row.field)}<br/>
      发表 / 获奖：${row.publicationYear} / ${row.prizeYear}<br/>
      等待时间：${row.waitTime} 年<br/>
      获奖前发文数量：${row.prePrizePublicationCount} 篇<br/>
      发表该论文时职业年龄：${row.careerAgeAtPaper} 年<br/>
      获奖时职业年龄：${row.careerAgeAtPrize} 年<br/>
      机构国家：${row.countries.length ? row.countries.map(getCountryName).join(", ") : "暂无"}<br/>
      机构：${row.institutions.length ? row.institutions.join(", ") : "暂无"}<br/>
      期刊：${row.sourceName}
    `))
    .on("mouseleave", hideTooltip);

  g.append("text")
    .attr("x", width / 2)
    .attr("y", height + 46)
    .attr("text-anchor", "middle")
    .attr("class", "waittime-axis-label")
    .text("wait_time：获奖论文从发表到获奖的等待时间（年）");

  g.append("text")
    .attr("x", -height / 2)
    .attr("y", -54)
    .attr("transform", "rotate(-90)")
    .attr("text-anchor", "middle")
    .attr("class", "waittime-axis-label")
    .text(yConfig.label);

  const legend = g.append("g")
    .attr("class", "waittime-legend")
    .attr("transform", `translate(${width - 86},18)`);
  Object.entries(FIELD_COLORS).forEach(([field, color], index) => {
    const item = legend.append("g").attr("transform", `translate(0,${index * 24})`);
    item.append("circle").attr("r", 5).attr("fill", color);
    item.append("text").attr("x", 12).attr("y", 4).text(getFieldLabel(field));
  });
}

function buildYAxis(rows, height) {
  const mode = waitTimeState.filters.yAxis;

  if (mode === "careerAge") {
    const scale = d3.scaleLinear()
      .domain([0, d3.max(rows, row => row.careerAgeAtPaper) || 1])
      .nice()
      .range([height, 0]);
    return {
      isNumeric: true,
      label: "发表该获奖论文时的职业年龄（年）",
      medianLabel: "职业年龄中位数",
      unit: " 年",
      value: row => row.careerAgeAtPaper,
      scale,
      cy: row => scale(row.careerAgeAtPaper),
      axis: d3.axisLeft(scale).ticks(6),
      gridAxis: width => d3.axisLeft(scale).ticks(6).tickSize(-width).tickFormat("")
    };
  }

  if (mode === "country" || mode === "institution") {
    const key = mode === "country" ? "primaryCountry" : "primaryInstitution";
    const label = mode === "country" ? "机构国家" : "机构";
    const counts = d3.rollups(rows, values => values.length, row => row[key])
      .sort((a, b) => d3.descending(a[1], b[1]));
    const topValues = counts.slice(0, 14).map(([value]) => value);
    const mappedRows = rows.map(row => ({
      ...row,
      yCategory: topValues.includes(row[key]) ? row[key] : "其他"
    }));
    const domain = [...new Set([...topValues, mappedRows.some(row => row.yCategory === "其他") ? "其他" : null].filter(Boolean))];
    const scale = d3.scaleBand()
      .domain(domain)
      .range([0, height])
      .padding(0.32);
    return {
      isNumeric: false,
      label,
      value: row => row[key],
      scale,
      cy: row => {
        const value = topValues.includes(row[key]) ? row[key] : "其他";
        return (scale(value) || 0) + scale.bandwidth() / 2;
      },
      axis: d3.axisLeft(scale).tickSize(0),
      gridAxis: width => d3.axisLeft(scale).tickSize(-width).tickFormat("")
    };
  }

  const scale = d3.scaleSymlog()
    .constant(10)
    .domain([0, d3.max(rows, row => row.prePrizePublicationCount) || 1])
    .nice()
    .range([height, 0]);
  return {
    isNumeric: true,
    label: "获奖前发文数量（篇，对数刻度）",
    medianLabel: "获奖前发文中位数",
    unit: " 篇",
    value: row => row.prePrizePublicationCount,
    scale,
    cy: row => scale(row.prePrizePublicationCount),
    axis: d3.axisLeft(scale)
      .tickValues([0, 1, 5, 10, 25, 50, 100, 250, 500, 1000])
      .tickFormat(d3.format(",")),
    gridAxis: width => d3.axisLeft(scale)
      .tickValues([0, 1, 5, 10, 25, 50, 100, 250, 500, 1000])
      .tickSize(-width)
      .tickFormat("")
  };
}

function renderSummary(rows) {
  const container = d3.select("#waittime-summary");
  container.selectAll("*").remove();

  const allRows = waitTimeState.rows;
  const medianWait = d3.median(rows, row => row.waitTime);
  const medianPrePubs = d3.median(rows, row => row.prePrizePublicationCount);
  const fields = d3.rollups(rows, values => values.length, row => row.field)
    .sort((a, b) => d3.descending(a[1], b[1]));

  const stats = [
    ["当前记录", `${d3.format(",")(rows.length)} / ${d3.format(",")(allRows.length)}`],
    ["等待时间中位数", medianWait === undefined ? "--" : `${d3.format(".0f")(medianWait)} 年`],
    ["当前 Y 轴", Y_AXIS_OPTIONS.find(option => option.value === waitTimeState.filters.yAxis)?.label || "--"],
    ["获奖前发文中位数", medianPrePubs === undefined ? "--" : `${d3.format(".0f")(medianPrePubs)} 篇`],
    ["学科筛选", waitTimeState.filters.field === "all" ? "全部" : getFieldLabel(waitTimeState.filters.field)],
    ["期刊筛选", waitTimeState.filters.journal === "all" ? "全部" : waitTimeState.filters.journal]
  ];

  container.selectAll(".waittime-stat")
    .data(stats)
    .join("div")
    .attr("class", "waittime-stat")
    .html(([label, value]) => `<span>${label}</span><strong>${value}</strong>`);

  const fieldBlock = container.append("div").attr("class", "waittime-field-breakdown");
  fieldBlock.append("div").attr("class", "panel-note").text("学科分布");
  fieldBlock.selectAll(".waittime-field-row")
    .data(fields)
    .join("div")
    .attr("class", "waittime-field-row")
    .html(([field, count]) => `
      <span><i style="background:${FIELD_COLORS[field] || "#6b7280"}"></i>${getFieldLabel(field)}</span>
      <strong>${count}</strong>
    `);
}

function classifyQuadrant(row, xMedian, yMedian) {
  const fast = row.waitTime <= xMedian;
  const highAccumulation = row.prePrizePublicationCount >= yMedian;
  if (fast && highAccumulation) return "积累多、认可快";
  if (!fast && highAccumulation) return "积累多、等待久";
  if (fast && !highAccumulation) return "积累少、认可快";
  return "积累少、等待久";
}

function renderInsights(rows) {
  const container = d3.select("#waittime-insights");
  container.selectAll("*").remove();

  if (!rows.length) {
    container.append("div")
      .attr("class", "panel-note")
      .text("当前筛选条件下没有可解读的样本。");
    return;
  }

  const xMedian = d3.median(rows, row => row.waitTime) || 0;
  const yMedian = d3.median(rows, row => row.prePrizePublicationCount) || 0;
  const quadrants = d3.rollups(
    rows,
    values => values.length,
    row => classifyQuadrant(row, xMedian, yMedian)
  );

  const order = ["积累多、认可快", "积累多、等待久", "积累少、认可快", "积累少、等待久"];
  container.append("div")
    .attr("class", "panel-note")
    .text("中位数参考线将样本分成四类，用于寻找高积累但长期等待、低积累但快速获奖等案例。");

  container.selectAll(".waittime-quadrant")
    .data(order.map(name => [name, quadrants.find(item => item[0] === name)?.[1] || 0]))
    .join("div")
    .attr("class", "waittime-quadrant")
    .html(([name, count]) => `<span>${name}</span><strong>${count}</strong>`);

  const longWaitHighAccumulation = rows
    .filter(row => row.waitTime > xMedian && row.prePrizePublicationCount >= yMedian)
    .sort((a, b) => d3.descending(a.waitTime, b.waitTime))
    .slice(0, 3);

  const fastLowAccumulation = rows
    .filter(row => row.waitTime <= xMedian && row.prePrizePublicationCount < yMedian)
    .sort((a, b) => d3.ascending(a.waitTime, b.waitTime))
    .slice(0, 3);

  renderCaseList(container, "积累多但等待久", longWaitHighAccumulation);
  renderCaseList(container, "积累少但认可快", fastLowAccumulation);
}

function renderCaseList(container, title, rows) {
  const block = container.append("div").attr("class", "waittime-case-list");
  block.append("div").attr("class", "panel-note").text(title);

  if (!rows.length) {
    block.append("div").attr("class", "waittime-case empty").text("暂无案例");
    return;
  }

  block.selectAll(".waittime-case")
    .data(rows)
    .join("div")
    .attr("class", "waittime-case")
    .html(row => `
      <strong>${row.laureateName}</strong>
      <span>${getFieldLabel(row.field)} · 等待 ${row.waitTime} 年 · 获奖前 ${row.prePrizePublicationCount} 篇</span>
    `);
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
  const countryLookup = buildAffiliationLookup(countries, institutionMeta);
  const sourceLookup = buildSourceLookup(sources);
  waitTimeState.rows = buildWaitTimeRows(publications, countryLookup, sourceLookup);

  setupFilters(waitTimeState.rows);
  renderWaitTimeModule();
}
