// js/charts/institutionNetwork.js

export async function initInstitutionNetwork() {
  const container = d3.select("#institution-network-chart");
  if (container.empty()) return;

  const DATA_PATH = "data/";

  const chartNode = container.node();
  const width = chartNode.clientWidth || 900;
  const height = 640;

  container.selectAll("*").remove();

  const svg = container
    .append("svg")
    .attr("width", "100%")
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const defs = svg.append("defs");

  defs
    .append("filter")
    .attr("id", "network-node-shadow")
    .attr("x", "-30%")
    .attr("y", "-30%")
    .attr("width", "160%")
    .attr("height", "160%")
    .html(`
      <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#0f172a" flood-opacity="0.18"/>
    `);

  const background = svg.append("g").attr("class", "network-background");

  background
    .append("circle")
    .attr("cx", width / 2)
    .attr("cy", height / 2)
    .attr("r", Math.min(width, height) * 0.35)
    .attr("fill", "none")
    .attr("stroke", "#e2e8f0")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "4 8");

  background
    .append("circle")
    .attr("cx", width / 2)
    .attr("cy", height / 2)
    .attr("r", Math.min(width, height) * 0.22)
    .attr("fill", "none")
    .attr("stroke", "#edf2f7")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "4 8");

  const zoomLayer = svg.append("g").attr("class", "network-zoom-layer");
  const linkLayer = zoomLayer.append("g").attr("class", "network-links-layer");
  const nodeLayer = zoomLayer.append("g").attr("class", "network-nodes-layer");
  const labelLayer = zoomLayer.append("g").attr("class", "network-labels-layer");

  const zoom = d3
    .zoom()
    .scaleExtent([0.35, 4])
    .on("zoom", (event) => {
      zoomLayer.attr("transform", event.transform);
    });

  svg.call(zoom);

  d3.select("body").selectAll(".network-tooltip").remove();

  const tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "network-tooltip")
    .style("opacity", 0)
    .style("position", "absolute")
    .style("z-index", 9999)
    .style("pointer-events", "none")
    .style("padding", "10px 12px")
    .style("border-radius", "10px")
    .style("background", "rgba(15, 23, 42, 0.92)")
    .style("color", "#fff")
    .style("font-size", "12px")
    .style("line-height", "1.6")
    .style("box-shadow", "0 10px 28px rgba(15, 23, 42, 0.22)");

  const color = d3
    .scaleOrdinal()
    .domain(["Physics", "Chemistry", "Medicine", "Mixed", "Unknown"])
    .range([
      "rgba(37, 99, 235, 0.72)",   // Physics
      "rgba(5, 150, 105, 0.72)",   // Chemistry
      "rgba(220, 38, 38, 0.72)",   // Medicine
      "rgba(139, 92, 246, 0.72)",  // Mixed
      "rgba(148, 163, 184, 0.72)"  // Unknown
    ]);

  function edgeColorByField(field) {
    if (field === "Physics") return "rgba(37, 99, 235, 0.28)";
    if (field === "Chemistry") return "rgba(5, 150, 105, 0.28)";
    if (field === "Medicine") return "rgba(220, 38, 38, 0.28)";
    return "rgba(148, 163, 184, 0.28)";
  }

  const state = {
    field: "all",
    topN: getInitialNumber("#network-topn-range", 50),
    minWeight: getInitialNumber("#network-weight-range", 2)
  };

  updateControlText();

  let rawEdges;
  let institutionSummary;
  let authorships;
  let matchedPapers;

  try {
    [rawEdges, institutionSummary, authorships, matchedPapers] = await Promise.all([
      d3.csv(`${DATA_PATH}nobel_institution_edges.csv`),
      d3.csv(`${DATA_PATH}nobel_prize_institution_summary.csv`),
      d3.csv(`${DATA_PATH}nobel_paper_authorships.csv`),
      d3.csv(`${DATA_PATH}matched_all_publications.csv`)
    ]);
  } catch (error) {
    showLoadError(error);
    return;
  }

  const nodeInfo = buildNodeInfo(institutionSummary);
  const paperMeta = buildPaperMeta(matchedPapers);
  const institutionStats = buildInstitutionStats(authorships, paperMeta);
  const allEdges = buildAllEdges(rawEdges);
  const fieldEdges = buildFieldEdges(authorships, paperMeta);

  const simulation = d3
    .forceSimulation()
    .force("link", d3.forceLink().id((d) => d.id))
    .force("charge", d3.forceManyBody())
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("x", d3.forceX(width / 2).strength(0.035))
    .force("y", d3.forceY(height / 2).strength(0.035))
    .force("collision", d3.forceCollide());

  bindControls();
  render();

  function bindControls() {
    const fieldButtons = d3.selectAll(".network-field-btn");
    const fieldSelect = d3.select("#network-field-filter");

    if (!fieldButtons.empty()) {
      fieldButtons.on("click", function () {
        fieldButtons.classed("active", false);
        d3.select(this).classed("active", true);
        state.field = this.dataset.field || "all";
        render();
      });
    }

    if (!fieldSelect.empty()) {
      fieldSelect.on("change", function () {
        state.field = this.value || "all";
        render();
      });
    }

    d3.select("#network-topn-range").on("input", function () {
      state.topN = Number(this.value);
      updateControlText();
      render();
    });

    d3.select("#network-weight-range").on("input", function () {
      state.minWeight = Number(this.value);
      updateControlText();
      render();
    });

    d3.select("#network-reset-btn").on("click", () => {
      svg
        .transition()
        .duration(500)
        .call(zoom.transform, d3.zoomIdentity);

      simulation.alpha(0.8).restart();
    });
  }

  function render() {
    linkLayer.selectAll("*").remove();
    nodeLayer.selectAll("*").remove();
    labelLayer.selectAll("*").remove();

    const edgesForField =
      state.field === "all" ? allEdges : fieldEdges[state.field] || [];

    const { nodes, links } = prepareNetworkData({
      edges: edgesForField,
      nodeInfo,
      institutionStats,
      field: state.field,
      topN: state.topN,
      minWeight: state.minWeight
    });

    updateMetricCards(nodes, links);

    if (!nodes.length || !links.length) {
      showEmptyState();
      return;
    }

    const maxPaperCount = d3.max(nodes, (d) => d.paper_count) || 1;
    const maxStrength = d3.max(nodes, (d) => d.strength) || 1;
    const maxWeight = d3.max(links, (d) => d.weight) || 1;

    const radius = d3
      .scaleSqrt()
      .domain([1, maxPaperCount])
      .range([6, 25]);

    const linkWidth = d3
      .scaleSqrt()
      .domain([1, maxWeight])
      .range([1.1, 8]);

    nodes.forEach((d) => {
      d.radius = radius(d.paper_count || 1);
      d.display_field = state.field === "all" ? d.main_field : state.field;
    });

    // 关键修复：必须先注册 nodes，再注册 links
    simulation.nodes(nodes);

    simulation
      .force("link")
      .links(links)
      .distance((d) => Math.max(56, 145 - d.weight * 8))
      .strength((d) => Math.min(0.75, 0.12 + (d.weight / maxWeight) * 0.45));

    simulation
      .force("charge")
      .strength((d) => -140 - Math.sqrt(d.strength || 1) * 32);

    simulation
      .force("collision")
      .radius((d) => d.radius + 8)
      .strength(0.9);

    const link = linkLayer
      .selectAll("path")
      .data(links, (d) => `${getId(d.source)}---${getId(d.target)}`)
      .join("path")
      .attr("class", "network-link")
      .attr("fill", "none")
      .attr("stroke", edgeColorByField(state.field))
      .attr("stroke-opacity", 1)
      .attr("stroke-linecap", "round")
      .attr("stroke-width", (d) => linkWidth(d.weight))
      .on("mouseover", function (event, d) {
        d3.select(this)
          .attr("stroke-opacity", 0.72)
          .attr("stroke", edgeColorByField(state.field));
        tooltip
          .style("opacity", 1)
          .html(`
            <strong>${safeText(getName(d.source, d.source_name))}</strong>
            <div style="margin:4px 0;color:#cbd5e1;">合作 ${formatNumber(d.weight)} 次</div>
            <strong>${safeText(getName(d.target, d.target_name))}</strong>
          `);
      })
      .on("mousemove", moveTooltip)
      .on("mouseout", function () {
        d3.select(this)
          .attr("stroke-opacity", 0.34)
          .attr("stroke", "#94a3b8");

        tooltip.style("opacity", 0);
      });

    const nodeGroup = nodeLayer
      .selectAll("g")
      .data(nodes, (d) => d.id)
      .join("g")
      .attr("class", "network-node-group")
      .call(drag(simulation));

    nodeGroup
      .append("circle")
      .attr("class", "network-node")
      .attr("r", d => d.radius)
      .attr("fill", d => color(d.main_field || "Unknown"))
      .attr("fill-opacity", 1)
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1.6)
      .attr("filter", "url(#institution-node-shadow)")
      .on("mouseover", function (event, d) {
        highlightNeighborhood(d, true);

        tooltip
          .style("opacity", 1)
          .html(`
            <strong>${safeText(d.name)}</strong>
            <div style="margin-top:6px;color:#e2e8f0;">
              国家 / 地区：${safeText(d.country || "Unknown")}<br>
              主要学科：${safeText(d.main_field || "Unknown")}<br>
              当前论文数：${formatNumber(d.paper_count)}<br>
              合作机构数：${formatNumber(d.degree)}<br>
              加权合作强度：${formatNumber(d.strength)}
            </div>
          `);
      })
      .on("mousemove", moveTooltip)
      .on("mouseout", function () {
        highlightNeighborhood(null, false);
        tooltip.style("opacity", 0);
      })
      .on("click", function (event, d) {
        renderDetail(d, links);
      });

    nodeGroup
      .append("circle")
      .attr("class", "network-node-inner")
      .attr("r", (d) => Math.max(2.5, d.radius * 0.38))
      .attr("fill", "rgba(255,255,255,0.42)")
      .attr("pointer-events", "none");

    const labelNodes = nodes
      .slice()
      .sort((a, b) => d3.descending(a.strength, b.strength))
      .slice(0, Math.min(18, nodes.length));

    const labels = labelLayer
      .selectAll("text")
      .data(labelNodes, (d) => d.id)
      .join("text")
      .attr("class", "network-label")
      .attr("font-size", (d) => (d.strength > maxStrength * 0.6 ? 12 : 10.5))
      .attr("font-weight", (d) => (d.strength > maxStrength * 0.6 ? 800 : 650))
      .attr("fill", "#334155")
      .attr("paint-order", "stroke")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 4)
      .attr("stroke-linejoin", "round")
      .text((d) => shortenName(d.name))
      .attr("pointer-events", "none");

    simulation.on("tick", ticked);
    simulation.alpha(1).restart();

    function ticked() {
      link.attr("d", (d) => curvedPath(d));

      nodeGroup.attr("transform", (d) => {
        d.x = clamp(d.x, 20, width - 20);
        d.y = clamp(d.y, 20, height - 20);
        return `translate(${d.x},${d.y})`;
      });

      labels
        .attr("x", (d) => d.x + d.radius + 6)
        .attr("y", (d) => d.y + 4);
    }

    function highlightNeighborhood(selectedNode, active) {
      if (!active) {
        nodeGroup.style("opacity", 1);
        link.style("opacity", 1).attr("stroke", "#94a3b8");
        labels.style("opacity", 1);
        return;
      }

      const neighbors = new Set([selectedNode.id]);

      links.forEach((l) => {
        const sourceId = getId(l.source);
        const targetId = getId(l.target);

        if (sourceId === selectedNode.id) neighbors.add(targetId);
        if (targetId === selectedNode.id) neighbors.add(sourceId);
      });

      nodeGroup.style("opacity", (d) => (neighbors.has(d.id) ? 1 : 0.16));

      link
        .style("opacity", (d) => {
          const sourceId = getId(d.source);
          const targetId = getId(d.target);
          return sourceId === selectedNode.id || targetId === selectedNode.id
            ? 1
            : 0.06;
        })
        .attr("stroke", (d) => {
          const sourceId = getId(d.source);
          const targetId = getId(d.target);
          return sourceId === selectedNode.id || targetId === selectedNode.id
            ? "#334155"
            : "#94a3b8";
        });

      labels.style("opacity", (d) => (neighbors.has(d.id) ? 1 : 0.16));
    }
  }

  function updateMetricCards(nodes, links) {
    setText("#network-visible-node-count", formatNumber(nodes.length));
    setText("#network-visible-edge-count", formatNumber(links.length));
    setText("#network-max-weight", formatNumber(d3.max(links, (d) => d.weight) || 0));

    const coreNode = nodes
      .slice()
      .sort((a, b) => d3.descending(a.strength || 0, b.strength || 0))[0];

    setText("#network-core-institution", coreNode ? shortenName(coreNode.name, 18) : "--");
  }

  function renderDetail(node, links) {
    const detailPanel = d3.select("#network-detail-card");

    if (detailPanel.empty()) return;

    const partners = links
      .filter((l) => getId(l.source) === node.id || getId(l.target) === node.id)
      .map((l) => {
        const sourceId = getId(l.source);
        const sourceName = getName(l.source, l.source_name);
        const targetName = getName(l.target, l.target_name);

        return {
          name: sourceId === node.id ? targetName : sourceName,
          weight: l.weight
        };
      })
      .sort((a, b) => d3.descending(a.weight, b.weight))
      .slice(0, 7);

    detailPanel.html(`
      <div class="network-detail-title">${safeText(node.name)}</div>

      <div class="network-detail-grid">
        <div>
          <span>国家 / 地区</span>
          <strong>${safeText(node.country || "Unknown")}</strong>
        </div>
        <div>
          <span>主要学科</span>
          <strong>${safeText(node.main_field || "Unknown")}</strong>
        </div>
        <div>
          <span>当前论文数</span>
          <strong>${formatNumber(node.paper_count)}</strong>
        </div>
        <div>
          <span>合作机构数</span>
          <strong>${formatNumber(node.degree)}</strong>
        </div>
        <div>
          <span>合作强度</span>
          <strong>${formatNumber(node.strength)}</strong>
        </div>
        <div>
          <span>关联获奖论文</span>
          <strong>${formatNumber(node.prize_paper_count)}</strong>
        </div>
      </div>

      <div class="network-detail-subtitle">Top 合作机构</div>
      <div class="network-partner-list">
        ${
          partners.length
            ? partners
                .map(
                  (d) => `
                  <div class="network-partner-row">
                    <span>${safeText(d.name)}</span>
                    <strong>${formatNumber(d.weight)} 次</strong>
                  </div>
                `
                )
                .join("")
            : `<div class="network-partner-empty">当前筛选条件下没有可展示的合作机构。</div>`
        }
      </div>

      <div class="network-detail-footnote">
        节点位置由力导向布局计算，主要用于观察连接关系；不要将横纵坐标解释为具体数值。
      </div>
    `);
  }

  function showEmptyState() {
    linkLayer.selectAll("*").remove();
    nodeLayer.selectAll("*").remove();
    labelLayer.selectAll("*").remove();

    nodeLayer
      .append("text")
      .attr("x", width / 2)
      .attr("y", height / 2 - 10)
      .attr("text-anchor", "middle")
      .attr("fill", "#64748b")
      .attr("font-size", 15)
      .attr("font-weight", 700)
      .text("当前筛选条件下没有足够的合作关系");

    nodeLayer
      .append("text")
      .attr("x", width / 2)
      .attr("y", height / 2 + 18)
      .attr("text-anchor", "middle")
      .attr("fill", "#94a3b8")
      .attr("font-size", 12)
      .text("可以降低最小合作次数，或增加 Top N 机构范围。");
  }

  function showLoadError(error) {
    container.selectAll("*").remove();

    container
      .append("div")
      .attr("class", "placeholder")
      .style("padding", "40px")
      .html(`
        <strong>机构合作网络数据读取失败。</strong><br>
        请检查 data 文件夹中是否存在以下文件：<br>
        nobel_institution_edges.csv<br>
        nobel_prize_institution_summary.csv<br>
        nobel_paper_authorships.csv<br>
        matched_all_publications.csv<br><br>
        控制台错误：${safeText(error.message || String(error))}
      `);
  }
}

function buildNodeInfo(rows) {
  const map = new Map();

  rows.forEach((d) => {
    const id = cleanId(d.institution_id);
    if (!id) return;

    map.set(id, {
      id,
      name: cleanText(d.institution_display_name) || id,
      country: cleanText(d.country_code) || "Unknown",
      institution_type: cleanText(d.institution_type) || "Unknown",
      prize_paper_count: toNumber(d.prize_paper_count),
      laureate_count: toNumber(d.associated_laureate_count),
      scientist_count: toNumber(d.associated_scientist_count),
      mean_citation: toNumber(d.mean_prize_paper_cited_by_count),
      median_citation: toNumber(d.median_prize_paper_cited_by_count),
      max_citation: toNumber(d.max_prize_paper_cited_by_count),
      mean_percentile: toNumber(d.mean_citation_normalized_percentile),
      median_percentile: toNumber(d.median_citation_normalized_percentile),
      h_index: toNumber(d.institution_h_index),
      total_works: toNumber(d.institution_total_works_count),
      total_citations: toNumber(d.institution_total_cited_by_count)
    });
  });

  return map;
}

function buildPaperMeta(rows) {
  const map = new Map();

  rows.forEach((d) => {
    const paperId = cleanId(d.openalex_paper_id);
    if (!paperId) return;

    if (!map.has(paperId)) {
      map.set(paperId, {
        paperId,
        fields: new Set(),
        laureates: new Set(),
        isPrize: false
      });
    }

    const meta = map.get(paperId);
    const field = normalizeField(d.field);

    if (field) meta.fields.add(field);
    if (cleanId(d.laureate_id)) meta.laureates.add(cleanId(d.laureate_id));

    const prizeFlag = String(d.is_prize_winning_paper || "").trim().toUpperCase();
    if (prizeFlag === "YES" || prizeFlag === "TRUE" || prizeFlag === "1") {
      meta.isPrize = true;
    }
  });

  return map;
}

function buildInstitutionStats(authorships, paperMeta) {
  const stats = {
    all: new Map(),
    Physics: new Map(),
    Chemistry: new Map(),
    Medicine: new Map()
  };

  authorships.forEach((d) => {
    const paperId = cleanId(d.openalex_paper_id);
    const institutionId = cleanId(d.institution_id);
    if (!paperId || !institutionId) return;

    const meta = paperMeta.get(paperId);
    if (!meta) return;

    const fields = Array.from(meta.fields);
    const name = cleanText(d.institution_display_name) || institutionId;
    const country = cleanText(d.country_code) || "Unknown";
    const authorId = cleanId(d.author_id);

    addInstitutionStat(stats.all, institutionId, {
      paperId,
      authorId,
      laureates: meta.laureates,
      name,
      country
    });

    fields.forEach((field) => {
      if (!stats[field]) return;

      addInstitutionStat(stats[field], institutionId, {
        paperId,
        authorId,
        laureates: meta.laureates,
        name,
        country
      });
    });
  });

  const finalStats = {};

  Object.entries(stats).forEach(([field, map]) => {
    finalStats[field] = new Map();

    map.forEach((value, institutionId) => {
      finalStats[field].set(institutionId, {
        id: institutionId,
        name: value.name,
        country: value.country,
        paper_count: value.paperIds.size,
        author_count: value.authorIds.size,
        laureate_count: value.laureateIds.size
      });
    });
  });

  return finalStats;
}

function addInstitutionStat(map, institutionId, payload) {
  if (!map.has(institutionId)) {
    map.set(institutionId, {
      name: payload.name,
      country: payload.country,
      paperIds: new Set(),
      authorIds: new Set(),
      laureateIds: new Set()
    });
  }

  const item = map.get(institutionId);
  item.paperIds.add(payload.paperId);

  if (payload.authorId) item.authorIds.add(payload.authorId);

  payload.laureates.forEach((id) => {
    if (id) item.laureateIds.add(id);
  });
}

function buildAllEdges(rows) {
  const edgeMap = new Map();

  rows.forEach((d) => {
    const source = cleanId(d.source);
    const target = cleanId(d.target);

    if (!source || !target || source === target) return;

    const [a, b] = source < target ? [source, target] : [target, source];
    const sourceName = source === a ? cleanText(d.source_name) : cleanText(d.target_name);
    const targetName = target === b ? cleanText(d.target_name) : cleanText(d.source_name);
    const key = `${a}---${b}`;

    if (!edgeMap.has(key)) {
      edgeMap.set(key, {
        source: a,
        target: b,
        weight: 0,
        source_name: sourceName || a,
        target_name: targetName || b
      });
    }

    edgeMap.get(key).weight += toNumber(d.weight, 1);
  });

  return Array.from(edgeMap.values());
}

function buildFieldEdges(authorships, paperMeta) {
  const paperInstitutions = {
    Physics: new Map(),
    Chemistry: new Map(),
    Medicine: new Map()
  };

  authorships.forEach((d) => {
    const paperId = cleanId(d.openalex_paper_id);
    const institutionId = cleanId(d.institution_id);

    if (!paperId || !institutionId) return;

    const meta = paperMeta.get(paperId);
    if (!meta || !meta.fields.size) return;

    const institutionName = cleanText(d.institution_display_name) || institutionId;

    meta.fields.forEach((field) => {
      if (!paperInstitutions[field]) return;

      if (!paperInstitutions[field].has(paperId)) {
        paperInstitutions[field].set(paperId, new Map());
      }

      paperInstitutions[field].get(paperId).set(institutionId, institutionName);
    });
  });

  const result = {};

  Object.entries(paperInstitutions).forEach(([field, paperMap]) => {
    const edgeMap = new Map();

    paperMap.forEach((instMap) => {
      const institutions = Array.from(instMap.entries());

      for (let i = 0; i < institutions.length; i++) {
        for (let j = i + 1; j < institutions.length; j++) {
          const [id1, name1] = institutions[i];
          const [id2, name2] = institutions[j];

          if (!id1 || !id2 || id1 === id2) continue;

          const [source, target] = id1 < id2 ? [id1, id2] : [id2, id1];
          const sourceName = id1 < id2 ? name1 : name2;
          const targetName = id1 < id2 ? name2 : name1;
          const key = `${source}---${target}`;

          if (!edgeMap.has(key)) {
            edgeMap.set(key, {
              source,
              target,
              weight: 0,
              source_name: sourceName,
              target_name: targetName
            });
          }

          edgeMap.get(key).weight += 1;
        }
      }
    });

    result[field] = Array.from(edgeMap.values());
  });

  return result;
}

function prepareNetworkData({
  edges,
  nodeInfo,
  institutionStats,
  field,
  topN,
  minWeight
}) {
  const currentStats = institutionStats[field] || institutionStats.all || new Map();

  const filteredEdges = edges
    .filter((e) => e.weight >= minWeight)
    .map((e) => ({ ...e }));

  const strength = new Map();
  const degreeSets = new Map();

  filteredEdges.forEach((e) => {
    strength.set(e.source, (strength.get(e.source) || 0) + e.weight);
    strength.set(e.target, (strength.get(e.target) || 0) + e.weight);

    if (!degreeSets.has(e.source)) degreeSets.set(e.source, new Set());
    if (!degreeSets.has(e.target)) degreeSets.set(e.target, new Set());

    degreeSets.get(e.source).add(e.target);
    degreeSets.get(e.target).add(e.source);
  });

  const topIds = Array.from(strength.entries())
    .sort((a, b) => d3.descending(a[1], b[1]))
    .slice(0, topN)
    .map((d) => d[0]);

  const topIdSet = new Set(topIds);

  const links = filteredEdges.filter(
    (e) => topIdSet.has(e.source) && topIdSet.has(e.target)
  );

  const usedIds = new Set();
  const edgeNameMap = new Map();

  links.forEach((e) => {
    usedIds.add(e.source);
    usedIds.add(e.target);

    if (e.source_name) edgeNameMap.set(e.source, e.source_name);
    if (e.target_name) edgeNameMap.set(e.target, e.target_name);
  });

  const nodes = Array.from(usedIds).map((id) => {
    const summary = nodeInfo.get(id) || {};
    const stat = currentStats.get(id) || institutionStats.all?.get(id) || {};
    const mainField = inferMainField(id, institutionStats);

    const paperCount = stat.paper_count || summary.prize_paper_count || 1;
    const laureateCount = stat.laureate_count || summary.laureate_count || 0;

    return {
      id,
      name: summary.name || stat.name || edgeNameMap.get(id) || id,
      country: summary.country || stat.country || "Unknown",
      institution_type: summary.institution_type || "Unknown",
      prize_paper_count: summary.prize_paper_count || 0,
      paper_count: paperCount,
      laureate_count: laureateCount,
      scientist_count: summary.scientist_count || stat.author_count || 0,
      mean_percentile: summary.mean_percentile || 0,
      total_works: summary.total_works || 0,
      total_citations: summary.total_citations || 0,
      degree: degreeSets.has(id) ? degreeSets.get(id).size : 0,
      strength: strength.get(id) || 0,
      main_field: field === "all" ? mainField : field
    };
  });

  return { nodes, links };
}

function inferMainField(institutionId, institutionStats) {
  const fields = ["Physics", "Chemistry", "Medicine"];

  const counts = fields.map((field) => {
    const stat = institutionStats[field]?.get(institutionId);
    return {
      field,
      count: stat ? stat.paper_count : 0
    };
  });

  counts.sort((a, b) => d3.descending(a.count, b.count));

  if (!counts[0] || counts[0].count === 0) return "Unknown";
  if (counts[1] && counts[0].count === counts[1].count) return "Mixed";

  return counts[0].field;
}

function curvedPath(d) {
  const sx = d.source.x;
  const sy = d.source.y;
  const tx = d.target.x;
  const ty = d.target.y;

  const dx = tx - sx;
  const dy = ty - sy;
  const distance = Math.sqrt(dx * dx + dy * dy) || 1;

  const curvature = 0.12;
  const mx = (sx + tx) / 2;
  const my = (sy + ty) / 2;

  const nx = -dy / distance;
  const ny = dx / distance;

  const qx = mx + nx * distance * curvature;
  const qy = my + ny * distance * curvature;

  return `M${sx},${sy} Q${qx},${qy} ${tx},${ty}`;
}

function drag(simulation) {
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.25).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  return d3
    .drag()
    .on("start", dragstarted)
    .on("drag", dragged)
    .on("end", dragended);
}

function normalizeField(value) {
  const v = cleanText(value).toLowerCase();

  if (!v) return null;
  if (v.includes("physics")) return "Physics";
  if (v.includes("chemistry")) return "Chemistry";
  if (v.includes("medicine") || v.includes("physiology")) return "Medicine";

  return null;
}

function getInitialNumber(selector, fallback) {
  const selection = d3.select(selector);
  if (selection.empty()) return fallback;

  const value = Number(selection.property("value"));
  return Number.isFinite(value) ? value : fallback;
}

function updateControlText() {
  setText("#network-topn-value", stateSafeNumber("#network-topn-range", 50));
  setText("#network-weight-value", stateSafeNumber("#network-weight-range", 2));
}

function stateSafeNumber(selector, fallback) {
  const selection = d3.select(selector);
  if (selection.empty()) return fallback;

  const value = Number(selection.property("value"));
  return Number.isFinite(value) ? value : fallback;
}

function setText(selector, value) {
  const selection = d3.select(selector);
  if (!selection.empty()) selection.text(value);
}

function getId(value) {
  return typeof value === "object" && value !== null ? value.id : value;
}

function getName(value, fallback) {
  return typeof value === "object" && value !== null
    ? value.name || value.id
    : fallback || value;
}

function cleanId(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function cleanText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function shortenName(name, maxLength = 28) {
  if (!name) return "";

  const shortened = String(name)
    .replace(/University/g, "Univ.")
    .replace(/Institute of Technology/g, "Inst. Tech.")
    .replace(/National/g, "Nat.")
    .replace(/Laboratory/g, "Lab.")
    .replace(/College/g, "Coll.");

  return shortened.length > maxLength
    ? `${shortened.slice(0, maxLength - 1)}…`
    : shortened;
}

function formatNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return d3.format(",")(num);
}

function safeText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function moveTooltip(event) {
  d3.select(".network-tooltip")
    .style("left", `${event.pageX + 14}px`)
    .style("top", `${event.pageY + 14}px`);
}
