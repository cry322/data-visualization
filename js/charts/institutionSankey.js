import { sankey, sankeyLinkHorizontal } from "https://cdn.jsdelivr.net/npm/d3-sankey@0.12.3/+esm";

const d3 = window.d3;

const DATA_PATHS = {
  fieldOutputs: "data/nobel_prize_institution_field_outputs.csv",
  institutionSummary: "data/nobel_prize_institution_summary.csv",
  authorCountry: "data/nobel_prize_author_country.csv",
  prizePapers: "data/matched_prize_papers_unique.csv",
};

const FIELD_ORDER = ["Physics", "Chemistry", "Medicine"];

const FIELD_COLORS = {
  Physics: "#667085",
  Chemistry: "#6b8f71",
  Medicine: "#9b6a6c",
};

const LINK_COLORS = {
  consistent: "#d8a24a", // 研究集中领域与获奖领域一致
  prizeOnly: "#c77c7c",  // 参与获奖领域，但不是研究最集中领域
  mainOnly: "#7aa6c2",   // 研究最集中领域，但不是获奖领域
  normal: "#d7dde5",     // 其他一般关联
  topic: "#b8a6cf",      // 探索性主题层级
};

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanText(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function normalizeInstitutionId(value) {
  let text = cleanText(value);
  if (text.includes("/")) text = text.split("/").pop();
  text = text.replace(/^I/i, "");
  return text;
}

function splitPipe(value) {
  return cleanText(value)
    .split("|")
    .map((d) => d.trim())
    .filter(Boolean);
}

function normalizeField(value) {
  const text = cleanText(value).toLowerCase();
  if (text.includes("physics")) return "Physics";
  if (text.includes("chemistry")) return "Chemistry";
  if (text.includes("medicine") || text.includes("physiology")) return "Medicine";
  return cleanText(value);
}

function formatNumber(value) {
  return d3.format(",")(Math.round(toNumber(value)));
}

function formatPercentile(value) {
  const n = toNumber(value, NaN);
  if (!Number.isFinite(n)) return "暂无";
  return n <= 1 ? d3.format(".1%")(n) : d3.format(".1f")(n);
}

function truncate(value, length = 28) {
  const text = cleanText(value);
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

function uniqueArray(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getOrCreateTooltip() {
  let tooltip = d3.select("#sankey-tooltip");
  if (tooltip.empty()) {
    tooltip = d3
      .select("body")
      .append("div")
      .attr("id", "sankey-tooltip")
      .attr("class", "chart-tooltip");
  }
  return tooltip;
}

function buildPrizeFieldMap(authorRows, prizeRows) {
  const paperToFields = new Map();

  prizeRows.forEach((row) => {
    const paperId = cleanText(row.openalex_paper_id);
    const field = normalizeField(row.field);
    if (!paperId || !FIELD_ORDER.includes(field)) return;

    if (!paperToFields.has(paperId)) paperToFields.set(paperId, new Set());
    paperToFields.get(paperId).add(field);
  });

  const instToPrizeFields = new Map();

  authorRows.forEach((row) => {
    const paperId = cleanText(row.openalex_paper_id);
    const instKey = normalizeInstitutionId(row.institution_id);
    if (!paperId || !instKey) return;

    const fields = paperToFields.get(paperId);
    if (!fields) return;

    if (!instToPrizeFields.has(instKey)) instToPrizeFields.set(instKey, new Set());
    fields.forEach((field) => instToPrizeFields.get(instKey).add(field));
  });

  return instToPrizeFields;
}

function aggregateRows(fieldRows, summaryRows, mappingMode) {
  const summaryByInst = new Map();

  summaryRows.forEach((row) => {
    const key = normalizeInstitutionId(row.institution_id);
    if (key) summaryByInst.set(key, row);
  });

  const rawRows = fieldRows
    .map((row) => {
      const instKey = normalizeInstitutionId(row.institution_id);
      const field = normalizeField(row.nobel_field);
      const summary = summaryByInst.get(instKey) || {};

      return {
        institutionKey: instKey,
        rawInstitutionId: cleanText(row.institution_id),
        institutionName: cleanText(
          summary.institution_display_name || row.institution_display_name,
          cleanText(row.institution_id)
        ),
        countryCode: cleanText(summary.country_code || row.country_code),
        institutionType: cleanText(summary.institution_type, "未知"),
        field,
        worksCount: toNumber(row.works_count),
        citedByCount: toNumber(row.cited_by_count),
        topicCount: toNumber(row.topic_count),
        topicNames: splitPipe(row.topic_names),
        subfieldNames: splitPipe(row.subfield_names),
        mappingMethods: cleanText(row.mapping_methods),
        mappingEvidence: cleanText(row.mapping_evidence_values),
        prizePaperCount: toNumber(summary.prize_paper_count),
        associatedLaureateCount: toNumber(summary.associated_laureate_count),
        associatedScientistCount: toNumber(summary.associated_scientist_count),
        meanCitationPercentile: toNumber(summary.mean_citation_normalized_percentile, NaN),
      };
    })
    .filter((d) => {
      if (!d.institutionKey) return false;
      if (!FIELD_ORDER.includes(d.field)) return false;
      if (d.worksCount <= 0) return false;
      if (mappingMode === "field_exact" && !d.mappingMethods.includes("field_exact")) return false;
      return true;
    });

  const grouped = d3.group(rawRows, (d) => `${d.institutionKey}||${d.field}`);

  return Array.from(grouped.values()).map((values) => {
    const first = values[0];

    return {
      ...first,
      worksCount: d3.sum(values, (d) => d.worksCount),
      citedByCount: d3.sum(values, (d) => d.citedByCount),
      topicCount: d3.sum(values, (d) => d.topicCount),
      topicNames: uniqueArray(values.flatMap((d) => d.topicNames)),
      subfieldNames: uniqueArray(values.flatMap((d) => d.subfieldNames)),
      mappingMethods: uniqueArray(values.map((d) => d.mappingMethods)).join(" | "),
      mappingEvidence: uniqueArray(values.map((d) => d.mappingEvidence)).join(" | "),
    };
  });
}

function prepareData({ fieldRows, summaryRows, authorRows, prizeRows, topN, mappingMode, viewMode }) {
  let rows = aggregateRows(fieldRows, summaryRows, mappingMode);

  if (rows.length === 0 && mappingMode === "field_exact") {
    rows = aggregateRows(fieldRows, summaryRows, "all");
  }

  const prizeFieldsByInst = buildPrizeFieldMap(authorRows, prizeRows);

  const totalByInst = d3.rollup(
    rows,
    (values) => d3.sum(values, (d) => d.worksCount),
    (d) => d.institutionKey
  );

  const selectedInstIds = new Set(
    Array.from(totalByInst.entries())
      .sort((a, b) => d3.descending(a[1], b[1]))
      .slice(0, Number(topN))
      .map(([id]) => id)
  );

  rows = rows.filter((d) => selectedInstIds.has(d.institutionKey));

  const mainFieldByInst = new Map();
  const groupedByInst = d3.group(rows, (d) => d.institutionKey);

  groupedByInst.forEach((values, instId) => {
    const best = [...values].sort((a, b) => d3.descending(a.worksCount, b.worksCount))[0];
    if (best) mainFieldByInst.set(instId, best.field);
  });

  const nodes = [];
  const nodeIndex = new Map();

  function addNode(id, name, type, extra = {}) {
    if (nodeIndex.has(id)) return nodeIndex.get(id);
    const node = { id, name, type, ...extra };
    nodeIndex.set(id, nodes.length);
    nodes.push(node);
    return nodes.length - 1;
  }

  rows.forEach((d) => {
    const prizeFieldSet = prizeFieldsByInst.get(d.institutionKey) || new Set();
    const mainField = mainFieldByInst.get(d.institutionKey);

    addNode(`inst:${d.institutionKey}`, d.institutionName, "institution", {
      institutionKey: d.institutionKey,
      countryCode: d.countryCode,
      institutionType: d.institutionType,
      mainField,
      prizeFields: Array.from(prizeFieldSet),
      isConsistent: prizeFieldSet.has(mainField),
      prizePaperCount: d.prizePaperCount,
      associatedLaureateCount: d.associatedLaureateCount,
      associatedScientistCount: d.associatedScientistCount,
      meanCitationPercentile: d.meanCitationPercentile,
    });

    addNode(`field:${d.field}`, d.field, "field", { field: d.field });
  });

  const links = [];

  rows.forEach((d) => {
    const prizeFieldSet = prizeFieldsByInst.get(d.institutionKey) || new Set();
    const mainField = mainFieldByInst.get(d.institutionKey);
    const isPrizeField = prizeFieldSet.has(d.field);
    const isMainField = mainField === d.field;
    const isConsistent = isPrizeField && isMainField;

    links.push({
      source: nodeIndex.get(`inst:${d.institutionKey}`),
      target: nodeIndex.get(`field:${d.field}`),
      value: d.worksCount,
      raw: d,
      linkType: isConsistent ? "consistent" : isPrizeField ? "prizeOnly" : isMainField ? "mainOnly" : "normal",
      isPrizeField,
      isMainField,
      isConsistent,
      approximate: false,
    });
  });

  if (viewMode === "field-topic") {
    const topicWeights = new Map();

    rows.forEach((d) => {
      const topics = d.topicNames.slice(0, 10);
      if (!topics.length) return;

      const eachWeight = d.worksCount / topics.length;
      topics.forEach((topic) => {
        const key = `${d.field}||${topic}`;
        topicWeights.set(key, (topicWeights.get(key) || 0) + eachWeight);
      });
    });

    const topTopicEntries = Array.from(topicWeights.entries())
      .sort((a, b) => d3.descending(a[1], b[1]))
      .slice(0, 12);

    topTopicEntries.forEach(([key]) => {
      const [field, topic] = key.split("||");
      addNode(`topic:${field}:${topic}`, topic, "topic", { field, approximate: true });
    });

    topTopicEntries.forEach(([key, value]) => {
      const [field, topic] = key.split("||");
      const source = nodeIndex.get(`field:${field}`);
      const target = nodeIndex.get(`topic:${field}:${topic}`);

      if (source === undefined || target === undefined) return;

      links.push({
        source,
        target,
        value,
        raw: {
          field,
          topicNames: [topic],
          institutionName: field,
          worksCount: value,
        },
        linkType: "topic",
        approximate: true,
        topicName: topic,
      });
    });
  }

  const institutionIds = Array.from(groupedByInst.keys());

  const consistentInstitutionCount = institutionIds.filter((instId) => {
    const mainField = mainFieldByInst.get(instId);
    const prizeFields = prizeFieldsByInst.get(instId);
    return prizeFields && prizeFields.has(mainField);
  }).length;

  const inconsistentInstitutionCount = institutionIds.filter((instId) => {
    const mainField = mainFieldByInst.get(instId);
    const prizeFields = prizeFieldsByInst.get(instId);
    return prizeFields && prizeFields.size > 0 && !prizeFields.has(mainField);
  }).length;

  const unknownPrizeFieldCount = institutionIds.filter((instId) => {
    const prizeFields = prizeFieldsByInst.get(instId);
    return !prizeFields || prizeFields.size === 0;
  }).length;

  return {
    nodes,
    links,
    stats: {
      institutionCount: groupedByInst.size,
      consistentInstitutionCount,
      inconsistentInstitutionCount,
      unknownPrizeFieldCount,
      totalWorks: d3.sum(rows, (d) => d.worksCount),
      viewMode,
      mappingMode,
    },
  };
}

function renderInsightPanel(container, stats, selected = null) {
  if (!container) return;

  if (!selected) {
    container.innerHTML = `
      <div class="sankey-insight-grid">
        <div class="sankey-stat">
          <div class="sankey-stat-value">${formatNumber(stats.institutionCount)}</div>
          <div class="sankey-stat-label">当前机构数</div>
        </div>
        <div class="sankey-stat">
          <div class="sankey-stat-value">${formatNumber(stats.consistentInstitutionCount)}</div>
          <div class="sankey-stat-label">集中领域与获奖领域一致</div>
        </div>
        <div class="sankey-stat">
          <div class="sankey-stat-value">${formatNumber(stats.inconsistentInstitutionCount)}</div>
          <div class="sankey-stat-label">集中领域与获奖领域不一致</div>
        </div>
      </div>
      <p class="sankey-explain">
        本图用于判断：一个机构实际参与诺奖的领域，是否也是它在 OpenAlex 主题产出中最集中的领域。
        左侧为机构，右侧为诺奖学科；连线越宽，表示该机构在该学科相关主题上的产出强度越高。
      </p>
      <p class="sankey-explain">
        颜色含义：黄色表示“研究最集中领域与获奖关联领域一致”；红色表示“参与过该领域获奖论文，但该领域不是最集中方向”；
        蓝色表示“该领域是最集中方向，但不是获奖关联领域”；灰色表示其他一般关联。
      </p>
      <p class="sankey-explain">
        数据口径：“精确映射”只保留 OpenAlex field 直接对应三大诺奖学科的记录，适合正式展示；
        “扩展映射”还加入 subfield/topic 关键词映射，信息更丰富，但解释上更偏探索。
      </p>
    `;
    return;
  }

  if (selected.type === "institution") {
    container.innerHTML = `
      <div class="sankey-detail-title">${selected.name}</div>
      <div class="sankey-detail-row"><span>国家 / 地区</span><strong>${selected.countryCode || "暂无"}</strong></div>
      <div class="sankey-detail-row"><span>机构类型</span><strong>${selected.institutionType || "暂无"}</strong></div>
      <div class="sankey-detail-row"><span>研究最集中领域</span><strong>${selected.mainField || "暂无"}</strong></div>
      <div class="sankey-detail-row"><span>获奖关联领域</span><strong>${selected.prizeFields?.length ? selected.prizeFields.join(" / ") : "暂无"}</strong></div>
      <div class="sankey-detail-row"><span>是否一致</span><strong>${selected.isConsistent ? "是" : "否 / 暂无"}</strong></div>
      <div class="sankey-detail-row"><span>参与获奖论文数</span><strong>${formatNumber(selected.prizePaperCount)}</strong></div>
      <div class="sankey-detail-row"><span>关联获奖者数</span><strong>${formatNumber(selected.associatedLaureateCount)}</strong></div>
      <div class="sankey-detail-row"><span>平均引用百分位</span><strong>${formatPercentile(selected.meanCitationPercentile)}</strong></div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="sankey-detail-title">${selected.name}</div>
    <p class="sankey-explain">
      当前选择的是${selected.type === "field" ? "学科节点" : "主题节点"}。
      可以 hover 连线查看具体机构、产出强度与代表主题。
    </p>
  `;
}

function showLinkTooltip(event, link, tooltip) {
  const d = link.raw || {};
  const title = link.approximate
    ? `${d.field} → ${link.topicName || "Topic"}`
    : `${d.institutionName} → ${d.field}`;

  tooltip
    .style("opacity", 1)
    .html(`
      <div class="tooltip-title">${title}</div>
      <div>产出强度：<strong>${formatNumber(link.value)}</strong></div>
      ${link.approximate ? `<div>说明：主题层级为探索性展开，权重为近似分配</div>` : ""}
      ${link.isPrizeField !== undefined ? `<div>获奖关联领域：<strong>${link.isPrizeField ? "是" : "否"}</strong></div>` : ""}
      ${link.isMainField !== undefined ? `<div>研究最集中领域：<strong>${link.isMainField ? "是" : "否"}</strong></div>` : ""}
      <div>总被引量：${formatNumber(d.citedByCount)}</div>
      <div>Topic 数：${formatNumber(d.topicCount)}</div>
      <div>代表 subfield：${truncate(d.subfieldNames?.slice(0, 3).join(" / ") || "暂无", 88)}</div>
      <div>代表 topic：${truncate(d.topicNames?.slice(0, 3).join(" / ") || "暂无", 88)}</div>
      <div>映射方法：${truncate(d.mappingMethods || "暂无", 88)}</div>
    `)
    .style("left", `${event.pageX + 14}px`)
    .style("top", `${event.pageY + 14}px`);
}

function showNodeTooltip(event, node, tooltip) {
  tooltip
    .style("opacity", 1)
    .html(`
      <div class="tooltip-title">${node.name}</div>
      <div>节点类型：${node.type}</div>
      ${node.countryCode ? `<div>国家 / 地区：${node.countryCode}</div>` : ""}
      ${node.mainField ? `<div>研究最集中领域：${node.mainField}</div>` : ""}
      ${node.prizeFields ? `<div>获奖关联领域：${node.prizeFields.length ? node.prizeFields.join(" / ") : "暂无"}</div>` : ""}
      ${node.isConsistent !== undefined ? `<div>是否一致：<strong>${node.isConsistent ? "是" : "否 / 暂无"}</strong></div>` : ""}
    `)
    .style("left", `${event.pageX + 14}px`)
    .style("top", `${event.pageY + 14}px`);
}

function hideTooltip(tooltip) {
  tooltip.style("opacity", 0);
}

function renderSankey(data, containerSelector) {
  const { nodes, links, stats } = data;

  const container = d3.select(containerSelector);
  if (container.empty()) return;

  container.selectAll("*").remove();

  const containerNode = container.node();
  const rect = containerNode.getBoundingClientRect();
  const width = Math.max(rect.width || 900, 760);
  const height = Math.max(560, Math.min(860, 360 + nodes.length * 16));

  const margin = { top: 26, right: 34, bottom: 38, left: 34 };

  const svg = container
    .append("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("width", "100%")
    .attr("height", height);

  const graph = sankey()
    .nodeWidth(16)
    .nodePadding(stats.viewMode === "field-topic" ? 9 : 14)
    .extent([
      [margin.left, margin.top],
      [width - margin.right, height - margin.bottom],
    ])({
    nodes: nodes.map((d) => ({ ...d })),
    links: links.map((d) => ({ ...d })),
  });

  const tooltip = getOrCreateTooltip();
  const insightContainer = document.querySelector("#sankey-insight-card");
  renderInsightPanel(insightContainer, stats);

  const linkGroup = svg.append("g").attr("fill", "none");

  const link = linkGroup
    .selectAll("path")
    .data(graph.links)
    .join("path")
    .attr("class", "sankey-link")
    .attr("d", sankeyLinkHorizontal())
    .attr("stroke", (d) => LINK_COLORS[d.linkType] || LINK_COLORS.normal)
    .attr("stroke-width", (d) => Math.max(1, d.width))
    .attr("stroke-opacity", (d) => {
      if (d.linkType === "topic") return 0.18;
      if (d.linkType === "normal") return 0.26;
      return 0.58;
    })
    .on("mouseenter", function (event, d) {
      d3.select(this).attr("stroke-opacity", 0.96);
      showLinkTooltip(event, d, tooltip);
    })
    .on("mousemove", function (event, d) {
      showLinkTooltip(event, d, tooltip);
    })
    .on("mouseleave", function (event, d) {
      d3.select(this).attr("stroke-opacity", d.linkType === "topic" ? 0.18 : d.linkType === "normal" ? 0.26 : 0.58);
      hideTooltip(tooltip);
    });

  const node = svg
    .append("g")
    .selectAll("g")
    .data(graph.nodes)
    .join("g")
    .attr("class", "sankey-node")
    .attr("transform", (d) => `translate(${d.x0},${d.y0})`)
    .on("mouseenter", function (event, d) {
      d3.select(this).select("rect").attr("stroke", "#0f172a").attr("stroke-width", 1.8);
      showNodeTooltip(event, d, tooltip);

      link.attr("stroke-opacity", (l) => (l.source === d || l.target === d ? 0.94 : 0.06));
    })
    .on("mousemove", function (event, d) {
      showNodeTooltip(event, d, tooltip);
    })
    .on("mouseleave", function () {
      d3.select(this).select("rect").attr("stroke", "#ffffff").attr("stroke-width", 1);
      hideTooltip(tooltip);

      link.attr("stroke-opacity", (l) => (l.linkType === "topic" ? 0.18 : l.linkType === "normal" ? 0.26 : 0.58));
    })
    .on("click", function (event, d) {
      renderInsightPanel(insightContainer, stats, d);
    });

  node
    .append("rect")
    .attr("height", (d) => Math.max(1, d.y1 - d.y0))
    .attr("width", (d) => d.x1 - d.x0)
    .attr("rx", 5)
    .attr("fill", (d) => {
      if (d.type === "field") return FIELD_COLORS[d.name] || "#64748b";
      if (d.type === "topic") return "#8b5cf6";
      if (d.isConsistent) return "#f59e0b";
      return "#475569";
    })
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 1);

  node
    .append("text")
    .attr("x", (d) => (d.x0 < width / 2 ? 23 : -8))
    .attr("y", (d) => (d.y1 - d.y0) / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", (d) => (d.x0 < width / 2 ? "start" : "end"))
    .attr("font-size", (d) => {
      if (d.type === "field") return 13;
      if (d.type === "topic") return 10;
      return 10.5;
    })
    .attr("font-weight", (d) => (d.type === "field" ? 700 : 500))
    .attr("fill", "#334155")
    .text((d) => {
      if (d.type === "topic") return truncate(d.name, 24);
      if (d.type === "institution") return truncate(d.name, stats.institutionCount <= 10 ? 28 : 22);
      return d.name;
    });

  const legend = svg
    .append("g")
    .attr("class", "sankey-legend")
    .attr("transform", `translate(${margin.left}, ${height - 15})`);

  const items = [
  [LINK_COLORS.consistent, "最集中领域 = 获奖领域"],
  [LINK_COLORS.prizeOnly, "获奖领域但非最集中"],
  [LINK_COLORS.mainOnly, "最集中但非获奖领域"],
  [LINK_COLORS.normal, "其他关联"],
];

  let x = 0;
  items.forEach(([color, label]) => {
    const item = legend.append("g").attr("transform", `translate(${x}, 0)`);
    item.append("line").attr("x1", 0).attr("x2", 24).attr("stroke", color).attr("stroke-width", 4);
    item.append("text").attr("x", 30).attr("y", 4).attr("font-size", 12).attr("fill", "#64748b").text(label);
    x += label.length * 12 + 58;
  });
}

export async function initInstitutionSankey() {
  const container = d3.select("#institution-sankey-chart");
  if (container.empty()) return;

  const modeSelect = document.querySelector("#sankey-mode-select");
  const topNSelect = document.querySelector("#sankey-topn-select");
  const mappingSelect = document.querySelector("#sankey-mapping-select");

  try {
    const [fieldRows, summaryRows, authorRows, prizeRows] = await Promise.all([
      d3.csv(DATA_PATHS.fieldOutputs),
      d3.csv(DATA_PATHS.institutionSummary),
      d3.csv(DATA_PATHS.authorCountry),
      d3.csv(DATA_PATHS.prizePapers),
    ]);

    function update() {
      const viewMode = modeSelect?.value || "field";
      const topN = topNSelect?.value || "20";
      const mappingMode = mappingSelect?.value || "field_exact";

      const prepared = prepareData({
        fieldRows,
        summaryRows,
        authorRows,
        prizeRows,
        topN,
        mappingMode,
        viewMode,
      });

      renderSankey(prepared, "#institution-sankey-chart");
    }

    modeSelect?.addEventListener("change", update);
    topNSelect?.addEventListener("change", update);
    mappingSelect?.addEventListener("change", update);

    update();

    window.addEventListener(
      "resize",
      debounce(() => update(), 250)
    );
  } catch (error) {
    console.error("Failed to load institution sankey data:", error);
    container.html(`
      <div class="placeholder">
        机构—学科桑基图数据加载失败。请检查 data 文件夹中的 CSV 文件名和路径。
      </div>
    `);
  }
}

function debounce(fn, delay = 200) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
