// js/charts/topicMigration.js

export async function initTopicMigration() {
  const container = d3.select("#topic-migration-chart");
  if (container.empty()) return;

  const DATA_PATH = "data_final/section4/";
  const DATA_FILE = "nobel_prize_paper_to_citation_paper_field_paths.csv";
  const AGG_DATA_FILE = "topic_migration_field_domain_agg.csv";
  const ARC_AGG_DATA_FILE = "topic_migration_subfield_domain_agg.csv";

  const fieldSelect = d3.select("#topic-field-filter");
  const viewSelect = d3.select("#topic-view-select");
  const arcTopNSelect = d3.select("#topic-arc-topn-select");
  const arcTopNControl = d3.select("#topic-arc-topn-control");
  const caseCards = d3.select("#topic-case-cards");

  const state = {
    field: fieldSelect.empty() ? "all" : normalizeSelectedField(fieldSelect.property("value")),
    view: viewSelect.empty() ? "sankey" : normalizeView(viewSelect.property("value")),

    // Top N controls both Sankey and arc views in section 4.3.
    sankeyTopN: arcTopNSelect.empty() ? 15 : Number(arcTopNSelect.property("value")),
    arcTopN: arcTopNSelect.empty() ? 15 : Number(arcTopNSelect.property("value")),

    topSource: 18,
    topPrize: 24,
    topTarget: 24,
    maxSamples: 8
  };

  d3.select("body").selectAll(".topic-tooltip").remove();

  const tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "topic-tooltip")
    .style("position", "absolute")
    .style("z-index", 9999)
    .style("max-width", "360px")
    .style("padding", "10px 12px")
    .style("border-radius", "10px")
    .style("background", "rgba(15, 23, 42, 0.94)")
    .style("color", "#ffffff")
    .style("font-size", "12px")
    .style("line-height", "1.6")
    .style("pointer-events", "none")
    .style("box-shadow", "0 10px 28px rgba(15, 23, 42, 0.22)")
    .style("opacity", 0);

  let sankeyRows = [];
  let arcRows = [];

  try {
    showLoadingState();
    sankeyRows = await loadTopicRows(DATA_PATH, AGG_DATA_FILE, DATA_FILE);
    arcRows = await loadTopicRows(DATA_PATH, ARC_AGG_DATA_FILE, DATA_FILE);
  } catch (error) {
    showLoadError(error);
    return;
  }

  populateFieldOptions(sankeyRows);
  state.field = fieldSelect.empty() ? "all" : normalizeSelectedField(fieldSelect.property("value"));

  bindControls();
  updateArcTopNVisibility();
  render();

  function bindControls() {
    if (!fieldSelect.empty()) {
      fieldSelect.on("change", function () {
        state.field = normalizeSelectedField(this.value || "all");
        render();
      });
    }

    if (!viewSelect.empty()) {
      viewSelect.on("change", function () {
        state.view = normalizeView(this.value || "sankey");
        updateArcTopNVisibility();
        render();
      });
    }

    if (!arcTopNSelect.empty()) {
      arcTopNSelect.on("change", function () {
        state.sankeyTopN = Number(this.value) || 15;
        state.arcTopN = Number(this.value) || 15;
        render();
      });
    }
  }

  function updateArcTopNVisibility() {
    if (arcTopNControl.empty()) return;
    arcTopNControl.style("display", state.view === "arc" ? "inline-flex" : "none");
  }

  function render() {
    container.selectAll("*").remove();

    const records = prepareRecords(sankeyRows, state);

    if (state.view === "arc") {
      const data = prepareCitationArcData(arcRows, state);
      updateMetrics(data);

      if (!data.nodes.length || !data.links.length) {
        showEmptyState();
        renderEmptyCards();
        return;
      }

      drawCitationArcDiagram(data);
      renderArcDefaultCards(data);
      return;
    }

    const data = prepareSankeyData(records, state);
    updateMetrics(data);

    if (!data.nodes.length || !data.links.length) {
      showEmptyState();
      renderEmptyCards();
      return;
    }

    drawSankey(data);
    renderSankeyDefaultCards(data);
  }

  function drawSankey(data) {
    const node = container.node();
    const width = node.clientWidth || 980;
    const height = 700;

    const margin = {
      top: 58,
      right: 190,
      bottom: 96,
      left: 190
    };

    const nodeWidth = 18;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = container
      .append("svg")
      .attr("width", "100%")
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    svg.append("text")
      .attr("x", margin.left - 20)
      .attr("y", 30)
      .attr("text-anchor", "end")
      .attr("fill", "#475569")
      .attr("font-size", 13)
      .attr("font-weight", 800)
      .text("Knowledge source domains");

    svg.append("text")
      .attr("x", width / 2)
      .attr("y", 30)
      .attr("text-anchor", "middle")
      .attr("fill", "#475569")
      .attr("font-size", 13)
      .attr("font-weight", 800)
      .text("Nobel paper domains");

    svg.append("text")
      .attr("x", width - margin.right + 20)
      .attr("y", 30)
      .attr("text-anchor", "start")
      .attr("fill", "#475569")
      .attr("font-size", 13)
      .attr("font-weight", 800)
      .text("Impact domains");

    const layout = computeColumnLayout(data, {
      width,
      margin,
      innerHeight,
      nodeWidth
    });

    const inputLinkWidth = d3.scaleSqrt()
      .domain([1, d3.max(layout.links.filter(d => d.flowType === "input"), d => d.value) || 1])
      .range([1.4, 24]);

    const outputLinkWidth = d3.scaleSqrt()
      .domain([1, d3.max(layout.links.filter(d => d.flowType === "output"), d => d.value) || 1])
      .range([1.4, 26]);

    const linkWidth = d => {
      const scale = d.flowType === "output" ? outputLinkWidth : inputLinkWidth;
      return scale(d.value);
    };

    const linkOpacity = d => d.isEmphasis ? 0.42 : 0.075;
    const linkDisplayWidth = d => {
      const width = linkWidth(d);
      return d.isEmphasis ? width : Math.max(0.7, width * 0.42);
    };

    const links = svg.append("g")
      .selectAll("path")
      .data(layout.links.slice().sort((a, b) => d3.ascending(Number(a.isEmphasis), Number(b.isEmphasis))), d => d.key)
      .join("path")
      .attr("fill", "none")
      .attr("stroke", d => domainColor(getLinkColorDomain(d), 0.78))
      .attr("stroke-opacity", linkOpacity)
      .attr("stroke-linecap", "round")
      .attr("stroke-width", linkDisplayWidth)
      .attr("d", d => curvedHorizontalPath(
        d.source.x + nodeWidth,
        d.source.linkY,
        d.target.x,
        d.target.linkY
      ))
      .on("mouseover", function (event, d) {
        d3.select(this)
          .attr("stroke-opacity", 0.86)
          .attr("stroke-width", Math.max(2.5, linkWidth(d) + 1.5));

        tooltip
          .style("opacity", 1)
          .html(`
            <strong>${safeText(d.source.name)}</strong><br>
            <span style="color:#cbd5e1;">→ ${safeText(d.target.name)}</span><br>
            Path count: ${formatNumber(d.value)}<br>
            Flow type: ${safeText(propagationLabel(d.flowType))}<br>
            ${d.source.type === "source"
              ? "含义：前置知识进入诺奖论文主题"
              : "含义：诺奖论文主题向后续研究扩散"}
          `);
      })
      .on("mousemove", moveTooltip)
      .on("mouseout", function (event, d) {
        d3.select(this)
          .attr("stroke-opacity", linkOpacity(d))
          .attr("stroke-width", linkDisplayWidth(d));

        tooltip.style("opacity", 0);
      })
      .on("click", function (event, d) {
        renderPathLinkCards(d);
      });

    const nodes = svg.append("g")
      .selectAll("rect")
      .data(layout.nodes, d => d.id)
      .join("rect")
      .attr("x", d => d.x)
      .attr("y", d => d.y)
      .attr("width", nodeWidth)
      .attr("height", d => d.height)
      .attr("rx", 7)
      .attr("fill", d => domainColor(d.domain, 0.9))
      .attr("fill-opacity", 0.88)
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1.2)
      .style("cursor", "pointer")
      .on("mouseover", function (event, d) {
        highlightPathNode(d, nodes, links, {
          linkOpacity,
          linkDisplayWidth,
          linkColor: link => domainColor(getLinkColorDomain(link), 0.78)
        });

        tooltip
          .style("opacity", 1)
          .html(`
            <strong>${safeText(d.name)}</strong><br>
            类型：${roleLabel(d.type)}<br>
            ${nodePathMetricHtml(d)}
          `);
      })
      .on("mousemove", moveTooltip)
      .on("mouseout", function () {
        nodes
          .interrupt()
          .style("opacity", 1)
          .attr("stroke", "#ffffff")
          .attr("stroke-width", 1.2);
        links
          .interrupt()
          .attr("stroke", d => domainColor(getLinkColorDomain(d), 0.78))
          .attr("stroke-opacity", linkOpacity)
          .attr("stroke-width", linkDisplayWidth);
        tooltip.style("opacity", 0);
      })
      .on("click", function (event, d) {
        renderPathNodeCards(d);
      });

    const labelNodes = layout.nodes;

    svg.append("g")
      .selectAll("text")
      .data(labelNodes, d => d.id)
      .join("text")
      .attr("x", d => {
        if (d.type === "source") return d.x - 8;
        if (d.type === "target") return d.x + nodeWidth + 8;
        return d.x + nodeWidth / 2;
      })
      .attr("y", d => d.y + Math.max(11, d.height / 2 + 4))
      .attr("text-anchor", d => {
        if (d.type === "source") return "end";
        if (d.type === "target") return "start";
        return "middle";
      })
      .attr("fill", "#334155")
      .attr("font-size", 10.8)
      .attr("font-weight", 700)
      .attr("paint-order", "stroke")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 3.2)
      .attr("stroke-linejoin", "round")
      .attr("pointer-events", "none")
      .text(d => shortenText(d.name, d.type === "prize" ? 22 : 24));

    drawDomainLegend(svg, {
      x: margin.left,
      y: height - 54
    });

    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height - 18)
      .attr("text-anchor", "middle")
      .attr("fill", "#94a3b8")
      .attr("font-size", 12)
      .text("Sankey 左右两段分别缩放：线越粗，表示该阶段内部该路径出现次数越多。");
  }

  function drawForceNetwork(data) {
    const node = container.node();
    const width = node.clientWidth || 980;
    const height = 660;

    const svg = container
      .append("svg")
      .attr("width", "100%")
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const defs = svg.append("defs");

    defs.append("marker")
      .attr("id", "topic-network-arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 14)
      .attr("refY", 0)
      .attr("markerWidth", 5)
      .attr("markerHeight", 5)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#94a3b8");

    defs
      .append("filter")
      .attr("id", "topic-network-shadow")
      .attr("x", "-30%")
      .attr("y", "-30%")
      .attr("width", "160%")
      .attr("height", "160%")
      .html(`
        <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#0f172a" flood-opacity="0.16"/>
      `);

    svg.append("text")
      .attr("x", width / 2)
      .attr("y", 30)
      .attr("text-anchor", "middle")
      .attr("fill", "#0f172a")
      .attr("font-size", 15)
      .attr("font-weight", 800)
      .text("主题级引用路径网络");

    svg.append("text")
      .attr("x", width / 2)
      .attr("y", 52)
      .attr("text-anchor", "middle")
      .attr("fill", "#64748b")
      .attr("font-size", 12)
      .text("节点表示 subfield，边表示“前置主题 → 诺奖主题”或“诺奖主题 → 后续主题”的引用知识路径。");

    const zoomLayer = svg.append("g").attr("class", "topic-network-zoom-layer");
    const linkLayer = zoomLayer.append("g");
    const nodeLayer = zoomLayer.append("g");
    const labelLayer = zoomLayer.append("g");

    const zoom = d3.zoom()
      .scaleExtent([0.45, 3.5])
      .on("zoom", event => {
        zoomLayer.attr("transform", event.transform);
      });

    svg.call(zoom);

    const color = d3.scaleOrdinal()
      .domain(["source", "prize", "target", "mixed"])
      .range(["#7aa6c2", "#b8a7d9", "#d9a66a", "#8bbf9f"]);

    const radius = d3.scaleSqrt()
      .domain([1, d3.max(data.nodes, d => d.value) || 1])
      .range([7, 31]);

    const linkWidth = d3.scaleSqrt()
      .domain([1, d3.max(data.links, d => d.value) || 1])
      .range([1.1, 8]);

    data.nodes.forEach(d => {
      d.r = radius(d.value);
    });

    const simulation = d3.forceSimulation(data.nodes)
      .force("link", d3.forceLink(data.links)
        .id(d => d.id)
        .distance(d => {
          const w = d.value || 1;
          return Math.max(82, 170 - Math.sqrt(w) * 4);
        })
        .strength(d => Math.min(0.7, 0.15 + Math.sqrt(d.value || 1) * 0.012))
      )
      .force("charge", d3.forceManyBody().strength(d => {
        return -220 - Math.sqrt(d.value || 1) * 7;
      }))
      .force("center", d3.forceCenter(width / 2, height / 2 + 10))
      .force("collision", d3.forceCollide().radius(d => d.r + 10).strength(0.9))
      .force("x", d3.forceX(width / 2).strength(0.025))
      .force("y", d3.forceY(height / 2 + 20).strength(0.035));

    const links = linkLayer
      .selectAll("path")
      .data(data.links, d => d.key)
      .join("path")
      .attr("fill", "none")
      .attr("stroke", "#94a3b8")
      .attr("stroke-opacity", 0.34)
      .attr("stroke-width", d => linkWidth(d.value))
      .attr("stroke-linecap", "round")
      .attr("marker-end", "url(#topic-network-arrow)")
      .on("mouseover", function (event, d) {
        d3.select(this)
          .attr("stroke-opacity", 0.9)
          .attr("stroke", "#334155")
          .attr("stroke-width", Math.max(2.4, linkWidth(d.value) + 1.2));

        tooltip
          .style("opacity", 1)
          .html(`
            <strong>${safeText(getNodeName(d.source))}</strong><br>
            <span style="color:#cbd5e1;">→ ${safeText(getNodeName(d.target))}</span><br>
            Path count: ${formatNumber(d.value)}<br>
            Flow type: ${safeText(propagationLabel(d.flowType))}<br>
            类型：${safeText(edgeTypeLabel(d.edgeRole))}
          `);
      })
      .on("mousemove", moveTooltip)
      .on("mouseout", function (event, d) {
        d3.select(this)
          .attr("stroke-opacity", 0.34)
          .attr("stroke", "#94a3b8")
          .attr("stroke-width", linkWidth(d.value));

        tooltip.style("opacity", 0);
      })
      .on("click", function (event, d) {
        renderNetworkLinkCards(d);
      });

    const nodeGroups = nodeLayer
      .selectAll("g")
      .data(data.nodes, d => d.id)
      .join("g")
      .style("cursor", "pointer")
      .call(
        d3.drag()
          .on("start", dragStarted)
          .on("drag", dragged)
          .on("end", dragEnded)
      );

    nodeGroups.append("circle")
      .attr("r", d => d.r)
      .attr("fill", d => color(d.role))
      .attr("fill-opacity", 0.9)
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1.5)
      .attr("filter", "url(#topic-network-shadow)")
      .on("mouseover", function (event, d) {
        highlightNetworkNode(d);

        tooltip
          .style("opacity", 1)
          .html(`
            <strong>${safeText(d.name)}</strong><br>
            主要角色：${safeText(roleLabel(d.role))}<br>
            相关路径：${formatNumber(d.value)}<br>
            连接主题数：${formatNumber(d.degree)}<br>
            自循环路径：${formatNumber(d.selfLoop || 0)}
          `);
      })
      .on("mousemove", moveTooltip)
      .on("mouseout", function () {
        clearNetworkHighlight();
        tooltip.style("opacity", 0);
      })
      .on("click", function (event, d) {
        renderNetworkNodeCards(d);
      });

    nodeGroups.append("circle")
      .attr("r", d => Math.max(2.5, d.r * 0.38))
      .attr("fill", "rgba(255,255,255,0.38)")
      .attr("pointer-events", "none");

    const labelNodes = data.nodes
      .slice()
      .sort((a, b) => d3.descending(a.value, b.value))
      .slice(0, 28);

    const labels = labelLayer
      .selectAll("text")
      .data(labelNodes, d => d.id)
      .join("text")
      .attr("fill", "#334155")
      .attr("font-size", 11)
      .attr("font-weight", 700)
      .attr("paint-order", "stroke")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 3.2)
      .attr("stroke-linejoin", "round")
      .attr("pointer-events", "none")
      .text(d => shortenText(d.name, 28));

    const legend = svg.append("g")
      .attr("transform", `translate(${width - 190}, 70)`);

    const legendItems = [
      ["source", "知识来源主题"],
      ["prize", "诺奖论文主题"],
      ["target", "后续扩散主题"],
      ["mixed", "混合角色主题"]
    ];

    legendItems.forEach(([key, label], i) => {
      const y = i * 23;

      legend.append("circle")
        .attr("cx", 0)
        .attr("cy", y)
        .attr("r", 5)
        .attr("fill", color(key));

      legend.append("text")
        .attr("x", 10)
        .attr("y", y + 4)
        .attr("fill", "#475569")
        .attr("font-size", 12)
        .text(label);
    });

    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height - 12)
      .attr("text-anchor", "middle")
      .attr("fill", "#94a3b8")
      .attr("font-size", 12)
      .text("这是力导向网络：节点位置由连接关系自动计算，不表示固定阶段或坐标。可拖拽节点、滚轮缩放。");

    simulation.on("tick", () => {
      links.attr("d", d => {
        const sx = clamp(d.source.x, 30, width - 30);
        const sy = clamp(d.source.y, 70, height - 30);
        const tx = clamp(d.target.x, 30, width - 30);
        const ty = clamp(d.target.y, 70, height - 30);

        return curvedLinkPath(sx, sy, tx, ty, d.curveOffset || 0);
      });

      nodeGroups.attr("transform", d => {
        d.x = clamp(d.x, 30, width - 30);
        d.y = clamp(d.y, 70, height - 30);
        return `translate(${d.x},${d.y})`;
      });

      labels
        .attr("x", d => d.x + d.r + 6)
        .attr("y", d => d.y + 4);
    });

    function highlightNetworkNode(selected) {
      const neighborIds = new Set([selected.id]);

      data.links.forEach(link => {
        if (getId(link.source) === selected.id) neighborIds.add(getId(link.target));
        if (getId(link.target) === selected.id) neighborIds.add(getId(link.source));
      });

      nodeGroups.style("opacity", d => neighborIds.has(d.id) ? 1 : 0.14);

      links
        .attr("stroke-opacity", d => {
          return getId(d.source) === selected.id || getId(d.target) === selected.id ? 0.92 : 0.05;
        })
        .attr("stroke-width", d => {
          return getId(d.source) === selected.id || getId(d.target) === selected.id
            ? Math.max(2.5, linkWidth(d.value) + 1.4)
            : Math.max(0.6, linkWidth(d.value) * 0.45);
        });

      labels.style("opacity", d => neighborIds.has(d.id) ? 1 : 0.12);
    }

    function clearNetworkHighlight() {
      nodeGroups.style("opacity", 1);

      links
        .attr("stroke-opacity", 0.34)
        .attr("stroke-width", d => linkWidth(d.value))
        .attr("stroke", "#94a3b8");

      labels.style("opacity", 1);
    }

    function dragStarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.25).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragEnded(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
  }

  function updateMetrics(data) {
    setText("#topic-path-count", formatNumber(data.totalPathCount || 0));
    setText("#topic-source-count", formatNumber(data.sourceCount || 0));
    setText("#topic-prize-count", formatNumber(data.prizeCount || 0));
    setText("#topic-diffusion-count", formatNumber(data.targetCount || 0));
  }

  function showEmptyState() {
    container
      .append("div")
      .attr("class", "placeholder")
      .style("padding", "48px")
      .html("当前筛选条件下没有可展示的知识路径。可以切换到“全部学科”查看整体结构。");
  }

  function showLoadingState() {
    container.selectAll("*").remove();
    container
      .append("div")
      .attr("class", "placeholder")
      .style("padding", "48px")
      .html("Loading topic migration paths...");
  }

  function showLoadError(error) {
    updateMetrics({
      totalPathCount: 0,
      sourceCount: 0,
      prizeCount: 0,
      targetCount: 0
    });

    container.selectAll("*").remove();

    container
      .append("div")
      .attr("class", "placeholder")
      .style("padding", "48px")
      .html(`
        <strong>主题迁移数据读取失败。</strong><br>
        请检查 data 文件夹中是否存在：<br>
        <code>${DATA_FILE}</code><br><br>
        控制台错误：${safeText(error.message || String(error))}
      `);
  }

  function renderSankeyDefaultCards(data) {
    if (caseCards.empty()) return;

    const topLink = data.links
      .slice()
      .sort((a, b) => d3.descending(a.value, b.value))[0];

    caseCards.html(`
      <div class="card mini-card">
        <div class="topic-badge">读图方式</div>
        <div class="topic-card-title">看知识从哪里来，又流向哪里</div>
        <div class="topic-card-note">
          Sankey 图展示路径规模。左侧是获奖论文引用过的知识来源，中间是诺奖论文主题，右侧是引用诺奖论文的后续研究方向。
        </div>
      </div>

      <div class="card mini-card">
        <div class="topic-badge">当前最强路径</div>
        <div class="topic-card-title">
          ${
            topLink
              ? `${safeText(topLink.sourceName)} → ${safeText(topLink.targetName)}`
              : "暂无可展示路径"
          }
        </div>
        <div class="topic-card-note">
          ${
            topLink
              ? `该路径共 ${formatNumber(topLink.value)} 条记录。`
              : "当前筛选条件下没有路径记录。"
          }
        </div>
      </div>

      <div class="card mini-card">
        <div class="topic-badge">解释重点</div>
        <div class="topic-card-title">看知识汇聚与扩散</div>
        <div class="topic-card-note">
          如果某个中间主题同时连接大量左侧与右侧节点，说明它既吸收多种知识基础，也对后续多个领域产生影响。
        </div>
      </div>
    `);
  }

  function renderNetworkDefaultCards(data) {
    if (caseCards.empty()) return;

    const topNode = data.nodes
      .slice()
      .sort((a, b) => d3.descending(a.value, b.value))[0];

    const topLink = data.links
      .slice()
      .sort((a, b) => d3.descending(a.value, b.value))[0];

    caseCards.html(`
      <div class="card mini-card">
        <div class="topic-badge">读图方式</div>
        <div class="topic-card-title">真正的主题网络</div>
        <div class="topic-card-note">
          节点按 subfield 聚合后进入力导向布局，位置由主题之间的连接关系决定。节点越大，相关知识路径越多。
        </div>
      </div>

      <div class="card mini-card">
        <div class="topic-badge">核心主题</div>
        <div class="topic-card-title">${topNode ? safeText(topNode.name) : "暂无"}</div>
        <div class="topic-card-note">
          ${
            topNode
              ? `该主题关联 ${formatNumber(topNode.value)} 条路径，连接 ${formatNumber(topNode.degree)} 个其他主题。`
              : "当前筛选条件下暂无核心主题。"
          }
        </div>
      </div>

      <div class="card mini-card">
        <div class="topic-badge">最强连接</div>
        <div class="topic-card-title">
          ${
            topLink
              ? `${safeText(getNodeName(topLink.source))} → ${safeText(getNodeName(topLink.target))}`
              : "暂无"
          }
        </div>
        <div class="topic-card-note">
          ${
            topLink
              ? `该连接共 ${formatNumber(topLink.value)} 条路径。`
              : "当前筛选条件下暂无连接。"
          }
        </div>
      </div>
    `);
  }

  function renderEmptyCards() {
    if (caseCards.empty()) return;

    caseCards.html(`
      <div class="card mini-card">
        <div class="panel-title">当前无结果</div>
        <div class="panel-note">当前筛选条件下没有可展示路径。</div>
      </div>
      <div class="card mini-card">
        <div class="panel-title">建议操作</div>
        <div class="panel-note">切换到全部学科，或检查数据文件字段是否完整。</div>
      </div>
      <div class="card mini-card">
        <div class="panel-title">数据来源</div>
        <div class="panel-note">本图读取一跳引文路径表。</div>
      </div>
    `);
  }

  function renderPathNodeCards(node) {
    if (caseCards.empty()) return;

    const prizePapers = uniqueBy(node.samples || [], d => d.prize_paper_id).slice(0, 5);
    const citationPapers = uniqueBy(node.samples || [], d => d.citation_paper_id).slice(0, 5);

    caseCards.html(`
      <div class="card mini-card">
        <div class="topic-badge">${roleLabel(node.type)}</div>
        <div class="topic-card-title">${safeText(node.name)}</div>
        <div class="topic-card-note">
          相关路径数量：${formatNumber(node.value)}；连接主题数：${formatNumber(node.degree)}。
        </div>
      </div>

      <div class="card mini-card">
        <div class="topic-badge">代表诺奖论文</div>
        <div class="topic-card-title">相关 Nobel 关键论文</div>
        <ol class="topic-card-list">
          ${
            prizePapers.length
              ? prizePapers.map(d => `<li>${safeText(shortenText(d.prize_paper_title || d.prize_paper_id, 88))}</li>`).join("")
              : "<li>暂无可展示论文</li>"
          }
        </ol>
      </div>

      <div class="card mini-card">
        <div class="topic-badge">代表引文论文</div>
        <div class="topic-card-title">引用 / 被引论文样例</div>
        <ol class="topic-card-list">
          ${
            citationPapers.length
              ? citationPapers.map(d => `<li>${safeText(shortenText(d.citation_paper_title || d.citation_paper_id, 88))}</li>`).join("")
              : "<li>暂无可展示论文</li>"
          }
        </ol>
      </div>
    `);
  }

  function renderPathLinkCards(link) {
    if (caseCards.empty()) return;

    const prizePapers = uniqueBy(link.samples || [], d => d.prize_paper_id).slice(0, 5);
    const citationPapers = uniqueBy(link.samples || [], d => d.citation_paper_id).slice(0, 5);
    const isInput = link.sourceType === "source";

    caseCards.html(`
      <div class="card mini-card">
        <div class="topic-badge">${isInput ? "知识来源路径" : "后续扩散路径"}</div>
        <div class="topic-card-title">${safeText(link.sourceName)} → ${safeText(link.targetName)}</div>
        <div class="topic-card-note">
          该路径共出现 ${formatNumber(link.value)} 次。
          ${isInput ? "它表示某类前置知识被诺奖论文吸收。" : "它表示诺奖论文主题被后续某类研究继续引用。"}
        </div>
      </div>

      <div class="card mini-card">
        <div class="topic-badge">代表诺奖论文</div>
        <div class="topic-card-title">路径中的 Nobel 关键论文</div>
        <ol class="topic-card-list">
          ${
            prizePapers.length
              ? prizePapers.map(d => `<li>${safeText(shortenText(d.prize_paper_title || d.prize_paper_id, 88))}</li>`).join("")
              : "<li>暂无可展示论文</li>"
          }
        </ol>
      </div>

      <div class="card mini-card">
        <div class="topic-badge">代表引文论文</div>
        <div class="topic-card-title">相关引用关系样例</div>
        <ol class="topic-card-list">
          ${
            citationPapers.length
              ? citationPapers.map(d => `<li>${safeText(shortenText(d.citation_paper_title || d.citation_paper_id, 88))}</li>`).join("")
              : "<li>暂无可展示论文</li>"
          }
        </ol>
      </div>
    `);
  }

  function renderNetworkNodeCards(node) {
    if (caseCards.empty()) return;

    const prizePapers = uniqueBy(node.samples || [], d => d.prize_paper_id).slice(0, 5);
    const citationPapers = uniqueBy(node.samples || [], d => d.citation_paper_id).slice(0, 5);

    caseCards.html(`
      <div class="card mini-card">
        <div class="topic-badge">${roleLabel(node.role)}</div>
        <div class="topic-card-title">${safeText(node.name)}</div>
        <div class="topic-card-note">
          相关路径：${formatNumber(node.value)}；连接主题：${formatNumber(node.degree)}；
          自循环路径：${formatNumber(node.selfLoop || 0)}。
        </div>
      </div>

      <div class="card mini-card">
        <div class="topic-badge">代表诺奖论文</div>
        <div class="topic-card-title">相关 Nobel 关键论文</div>
        <ol class="topic-card-list">
          ${
            prizePapers.length
              ? prizePapers.map(d => `<li>${safeText(shortenText(d.prize_paper_title || d.prize_paper_id, 88))}</li>`).join("")
              : "<li>暂无可展示论文</li>"
          }
        </ol>
      </div>

      <div class="card mini-card">
        <div class="topic-badge">代表引文论文</div>
        <div class="topic-card-title">引用 / 被引论文样例</div>
        <ol class="topic-card-list">
          ${
            citationPapers.length
              ? citationPapers.map(d => `<li>${safeText(shortenText(d.citation_paper_title || d.citation_paper_id, 88))}</li>`).join("")
              : "<li>暂无可展示论文</li>"
          }
        </ol>
      </div>
    `);
  }

  function renderNetworkLinkCards(link) {
    if (caseCards.empty()) return;

    const prizePapers = uniqueBy(link.samples || [], d => d.prize_paper_id).slice(0, 5);
    const citationPapers = uniqueBy(link.samples || [], d => d.citation_paper_id).slice(0, 5);

    caseCards.html(`
      <div class="card mini-card">
        <div class="topic-badge">${edgeTypeLabel(link.edgeRole)}</div>
        <div class="topic-card-title">${safeText(getNodeName(link.source))} → ${safeText(getNodeName(link.target))}</div>
        <div class="topic-card-note">
          该主题连接共 ${formatNumber(link.value)} 条路径。箭头表示知识路径方向。
        </div>
      </div>

      <div class="card mini-card">
        <div class="topic-badge">代表诺奖论文</div>
        <div class="topic-card-title">路径中的 Nobel 关键论文</div>
        <ol class="topic-card-list">
          ${
            prizePapers.length
              ? prizePapers.map(d => `<li>${safeText(shortenText(d.prize_paper_title || d.prize_paper_id, 88))}</li>`).join("")
              : "<li>暂无可展示论文</li>"
          }
        </ol>
      </div>

      <div class="card mini-card">
        <div class="topic-badge">代表引文论文</div>
        <div class="topic-card-title">相关引用关系样例</div>
        <ol class="topic-card-list">
          ${
            citationPapers.length
              ? citationPapers.map(d => `<li>${safeText(shortenText(d.citation_paper_title || d.citation_paper_id, 88))}</li>`).join("")
              : "<li>暂无可展示论文</li>"
          }
        </ol>
      </div>
    `);
  }
}

function populateFieldOptions(rows) {
  const fieldSelect = d3.select("#topic-field-filter");
  if (fieldSelect.empty()) return;

  const existingValue = normalizeSelectedField(fieldSelect.property("value") || "all");

  fieldSelect.selectAll("option").remove();

  fieldSelect
    .append("option")
    .attr("value", "all")
    .text("全部学科");

  ["Physics", "Chemistry", "Medicine"].forEach(field => {
    fieldSelect
      .append("option")
      .attr("value", field)
      .text(field);
  });

  fieldSelect.property("value", existingValue);
}

async function loadTopicRows(dataPath, aggregateFile, rawFile) {
  try {
    const rows = await d3.csv(`${dataPath}${aggregateFile}`);
    if (rows.length && rows.columns?.includes("count")) {
      rows.isAggregated = true;
      return rows;
    }
  } catch (error) {
    console.warn("Topic aggregate file not available; falling back to raw CSV.", error);
  }

  const rows = await d3.csv(`${dataPath}${rawFile}`);
  rows.isAggregated = false;
  return rows;
}

function prepareRecords(rows, state) {
  const records = [];

  rows.forEach(d => {
    const prizePaperId = cleanText(d.prize_paper_id || d.sample_prize_paper_id);
    const citationPaperId = cleanText(d.citation_paper_id || d.sample_citation_paper_id);
    const direction = cleanText(d.direction);

    if (!prizePaperId || !citationPaperId || !direction) return;

    if (state.field !== "all") {
      const prizeField = cleanText(d.prize_paper_field || d.prize_topic);
      if (!fieldMatches(prizeField, state.field) && !fieldMatches(d.prize_topic, state.field)) return;
    }

    const isInput = direction === "prize_paper_references_citation_paper";
    const isOutput = direction === "citation_paper_cites_prize_paper";

    if (!isInput && !isOutput) return;

    const prizeTopic = getPrizeTopic(d);
    const citationTopic = getCitationTopic(d);
    const prizeDomain = getPrizeDomain(d);
    const citationDomain = getCitationDomain(d);
    const count = getRowCount(d);

    if (
      isUnknownValue(prizeTopic) ||
      isUnknownValue(citationTopic) ||
      isUnknownValue(prizeDomain) ||
      isUnknownValue(citationDomain)
    ) {
      return;
    }

    records.push({
      prize_paper_id: prizePaperId,
      prize_paper_title: cleanText(d.prize_paper_title || d.sample_prize_paper_title),
      prize_paper_field: cleanText(d.prize_paper_field),
      prizeDomain,
      prizeTopic,
      citation_paper_id: citationPaperId,
      citation_paper_title: cleanText(d.citation_paper_title || d.sample_citation_paper_title),
      citation_paper_field: cleanText(d.citation_paper_field),
      citationDomain,
      citationTopic,
      direction,
      isInput,
      count
    });
  });

  return records;
}

function prepareSankeyData(records, state) {
  const minPathWeight = 3;
  const topN = state.sankeyTopN || 15;
  const sourceCountsAll = countByWeight(records.filter(d => d.isInput), d => d.citationTopic, d => d.count);
  const prizeCountsAll = countByWeight(records, d => d.prizeTopic, d => d.count);
  const targetCountsAll = countByWeight(records.filter(d => !d.isInput), d => d.citationTopic, d => d.count);

  const filteredRecords = records.filter(d => {
    if (d.count < minPathWeight) return false;
    if ((prizeCountsAll.get(d.prizeTopic) || 0) < minPathWeight) return false;
    const citationCounts = d.isInput ? sourceCountsAll : targetCountsAll;
    return (citationCounts.get(d.citationTopic) || 0) >= minPathWeight;
  });

  const sourceRecords = filteredRecords.filter(d => d.isInput);
  const targetRecords = filteredRecords.filter(d => !d.isInput);
  const sourceCounts = countByWeight(sourceRecords, d => d.citationTopic, d => d.count);
  const prizeCounts = countByWeight(filteredRecords, d => d.prizeTopic, d => d.count);
  const targetCounts = countByWeight(targetRecords, d => d.citationTopic, d => d.count);
  const prizeDomainCounts = countByWeight(filteredRecords, d => d.prizeDomain, d => d.count);

  const sourceDomainByTopic = buildTopicDomainMap(sourceRecords, d => d.citationTopic, d => d.citationDomain);
  const prizeDomainByTopic = buildTopicDomainMap(filteredRecords, d => d.prizeTopic, d => d.prizeDomain);
  const targetDomainByTopic = buildTopicDomainMap(targetRecords, d => d.citationTopic, d => d.citationDomain);
  const topSources = selectTopFieldsWithOtherBudget(sourceCounts, sourceDomainByTopic, topN);
  const topPrizes = selectTopFieldsWithOtherBudget(prizeCounts, prizeDomainByTopic, topN);
  const topTargets = selectTopFieldsWithOtherBudget(targetCounts, targetDomainByTopic, topN);
  const prizeOrder = buildOrderMap(prizeCounts);
  const prizeDomainOrder = buildOrderMap(prizeDomainCounts);
  const linkMap = new Map();

  filteredRecords.forEach(d => {
    const prizeNode = resolveFieldNode({
      type: "prize",
      topic: d.prizeTopic,
      domain: d.prizeDomain,
      keepSet: topPrizes,
      otherPrefix: "Other Nobel"
    });
    const citationNode = d.isInput
      ? resolveFieldNode({
          type: "source",
          topic: d.citationTopic,
          domain: d.citationDomain,
          keepSet: topSources,
          otherPrefix: "Other source"
        })
      : resolveFieldNode({
          type: "target",
          topic: d.citationTopic,
          domain: d.citationDomain,
          keepSet: topTargets,
          otherPrefix: "Other impact"
        });

    const sourceNode = d.isInput ? citationNode : prizeNode;
    const targetNode = d.isInput ? prizeNode : citationNode;
    const sourceId = sourceNode.id;
    const targetId = targetNode.id;
    const key = `${sourceId}---${targetId}`;

    if (!linkMap.has(key)) {
      linkMap.set(key, {
        key,
        sourceId,
        targetId,
        sourceName: sourceNode.name,
        targetName: targetNode.name,
        sourceType: sourceNode.type,
        targetType: targetNode.type,
        flowType: d.isInput ? "input" : "output",
        value: 0,
        sourceDomain: sourceNode.domain,
        targetDomain: targetNode.domain,
        samples: []
      });
    }

    const link = linkMap.get(key);
    link.value += d.count;
    pushSample(link.samples, d, state.maxSamples);
  });

  const links = Array.from(linkMap.values())
    .filter(d => d.value >= minPathWeight)
    .sort((a, b) => d3.descending(a.value, b.value));

  const nodeMap = new Map();

  links.forEach(link => {
    if (!nodeMap.has(link.sourceId)) {
      nodeMap.set(link.sourceId, createSankeyNode(link.sourceId, link.sourceName, link.sourceType, link.sourceDomain));
    }

    if (!nodeMap.has(link.targetId)) {
      nodeMap.set(link.targetId, createSankeyNode(link.targetId, link.targetName, link.targetType, link.targetDomain));
    }

    const sourceNode = nodeMap.get(link.sourceId);
    const targetNode = nodeMap.get(link.targetId);

    sourceNode.outValue += link.value;
    targetNode.inValue += link.value;
    sourceNode.degree += 1;
    targetNode.degree += 1;

    appendSamples(sourceNode.samples, link.samples, state.maxSamples);
    appendSamples(targetNode.samples, link.samples, state.maxSamples);
  });

  const nodes = Array.from(nodeMap.values())
    .map(node => {
      node.value = Math.max(node.inValue, node.outValue, 1);
      node.sortRank = getPrizeReferenceRank(node, prizeOrder, prizeDomainOrder);
      return node;
    })
    .filter(node => node.value >= minPathWeight);

  const keptNodeIds = new Set(nodes.map(d => d.id));
  const keptLinks = links.filter(link => keptNodeIds.has(link.sourceId) && keptNodeIds.has(link.targetId));
  markSankeyEmphasisLinks(keptLinks);

  return {
    nodes,
    links: keptLinks,
    totalPathCount: d3.sum(filteredRecords, d => d.count),
    sourceCount: nodes.filter(d => d.type === "source").length,
    prizeCount: nodes.filter(d => d.type === "prize").length,
    targetCount: nodes.filter(d => d.type === "target").length
  };
}

function markSankeyEmphasisLinks(links) {
  links.forEach(link => {
    link.isEmphasis = false;
  });

  if (!links.length) return;

  const sorted = links.slice().sort((a, b) => d3.descending(a.value, b.value));
  const globalKeep = Math.max(8, Math.ceil(sorted.length * 0.18));
  sorted.slice(0, globalKeep).forEach(link => {
    link.isEmphasis = true;
  });

  const byNode = new Map();

  links.forEach(link => {
    [link.sourceId, link.targetId].forEach(id => {
      if (!byNode.has(id)) byNode.set(id, []);
      byNode.get(id).push(link);
    });
  });

  byNode.forEach(nodeLinks => {
    nodeLinks
      .slice()
      .sort((a, b) => d3.descending(a.value, b.value))
      .slice(0, 2)
      .forEach(link => {
        link.isEmphasis = true;
      });
  });
}

function prepareForceNetworkData(records, state) {
  const sourceCounts = countBy(
    records.filter(d => d.isInput),
    d => d.citationTopic
  );

  const prizeCounts = countBy(records, d => d.prizeTopic);

  const targetCounts = countBy(
    records.filter(d => !d.isInput),
    d => d.citationTopic
  );

  const topSources = topKeys(sourceCounts, state.topSource);
  const topPrizes = topKeys(prizeCounts, state.topPrize);
  const topTargets = topKeys(targetCounts, state.topTarget);

  const nodeMap = new Map();
  const linkMap = new Map();

  function getOrCreateNode(name) {
    if (!nodeMap.has(name)) {
      nodeMap.set(name, {
        id: name,
        name,
        value: 0,
        degree: 0,
        selfLoop: 0,
        roleCounts: {
          source: 0,
          prize: 0,
          target: 0
        },
        role: "mixed",
        samples: []
      });
    }

    return nodeMap.get(name);
  }

  records.forEach(d => {
    const prizeTopic = topPrizes.has(d.prizeTopic)
      ? d.prizeTopic
      : "其他获奖论文主题";

    let sourceTopic;
    let targetTopic;
    let edgeRole;

    if (d.isInput) {
      sourceTopic = topSources.has(d.citationTopic)
        ? d.citationTopic
        : "其他知识来源";
      targetTopic = prizeTopic;
      edgeRole = "source_to_prize";
    } else {
      sourceTopic = prizeTopic;
      targetTopic = topTargets.has(d.citationTopic)
        ? d.citationTopic
        : "其他后续扩散";
      edgeRole = "prize_to_target";
    }

    const sourceNode = getOrCreateNode(sourceTopic);
    const targetNode = getOrCreateNode(targetTopic);

    if (d.isInput) {
      sourceNode.roleCounts.source += 1;
      targetNode.roleCounts.prize += 1;
    } else {
      sourceNode.roleCounts.prize += 1;
      targetNode.roleCounts.target += 1;
    }

    sourceNode.value += 1;
    targetNode.value += 1;

    pushSample(sourceNode.samples, d, state.maxSamples);
    pushSample(targetNode.samples, d, state.maxSamples);

    if (sourceTopic === targetTopic) {
      sourceNode.selfLoop += 1;
      return;
    }

    const key = `${sourceTopic}---${targetTopic}`;

    if (!linkMap.has(key)) {
      linkMap.set(key, {
        key,
        source: sourceTopic,
        target: targetTopic,
        sourceName: sourceTopic,
        targetName: targetTopic,
        edgeRole,
        value: 0,
        samples: []
      });
    }

    const link = linkMap.get(key);
    link.value += 1;
    pushSample(link.samples, d, state.maxSamples);
  });

  const nodes = Array.from(nodeMap.values());

  const links = Array.from(linkMap.values())
    .filter(d => d.value > 0)
    .sort((a, b) => d3.descending(a.value, b.value));

  const degreeMap = new Map();

  links.forEach(link => {
    degreeMap.set(link.source, (degreeMap.get(link.source) || 0) + 1);
    degreeMap.set(link.target, (degreeMap.get(link.target) || 0) + 1);
  });

  nodes.forEach(node => {
    node.degree = degreeMap.get(node.id) || 0;
    node.role = inferDominantRole(node.roleCounts);
  });

  links.forEach((link, index) => {
    link.curveOffset = (index % 3 - 1) * 16;
  });

  return {
    nodes,
    links,
    totalPathCount: records.length,

    // 指标含义：涉及该角色的主题数。一个主题可以同时属于多个角色。
    sourceCount: nodes.filter(d => d.roleCounts.source > 0).length,
    prizeCount: nodes.filter(d => d.roleCounts.prize > 0).length,
    targetCount: nodes.filter(d => d.roleCounts.target > 0).length
  };
}

function computeColumnLayout(data, config) {
  const { width, margin, innerHeight, nodeWidth = 18 } = config;

  const xByType = {
    source: margin.left - nodeWidth,
    prize: width / 2 - nodeWidth / 2,
    target: width - margin.right
  };

  const columns = {
    source: data.nodes.filter(d => d.type === "source"),
    prize: data.nodes.filter(d => d.type === "prize"),
    target: data.nodes.filter(d => d.type === "target")
  };

  Object.values(columns).forEach(nodes => {
    nodes.sort((a, b) =>
      d3.ascending(domainRank(a.domain), domainRank(b.domain)) ||
      d3.ascending(a.sortRank ?? 9999, b.sortRank ?? 9999) ||
      d3.descending(a.value, b.value)
    );
  });

  const gap = 8;
  const domainGap = 22;

  Object.entries(columns).forEach(([type, nodes]) => {
    const columnTotal = d3.sum(nodes, d => d.value) || 1;
    const valueScale = d3.scaleLinear()
      .domain([0, columnTotal])
      .range([0, innerHeight - 20]);
    const rawHeights = nodes.map(d => Math.max(10, valueScale(d.value)));
    const groupBreaks = countDomainBreaks(nodes);
    const totalHeight = d3.sum(rawHeights) +
      Math.max(0, nodes.length - 1) * gap +
      groupBreaks * domainGap;
    const shrink = totalHeight > innerHeight ? innerHeight / totalHeight : 1;

    let y = margin.top + Math.max(0, (innerHeight - totalHeight * shrink) / 2);

    nodes.forEach((node, i) => {
      if (i > 0 && domainRank(nodes[i - 1].domain) !== domainRank(node.domain)) {
        y += domainGap * shrink;
      }

      node.x = xByType[type];
      node.y = y;
      node.height = rawHeights[i] * shrink;
      node.linkY = node.y + node.height / 2;
      y += node.height + gap * shrink;
    });
  });

  const nodeById = new Map(data.nodes.map(d => [d.id, d]));

  const links = data.links
    .map(link => ({
      ...link,
      source: nodeById.get(link.sourceId),
      target: nodeById.get(link.targetId)
    }))
    .filter(d => d.source && d.target);

  links.forEach(link => {
    link.source.linkY = link.source.y + link.source.height / 2;
    link.target.linkY = link.target.y + link.target.height / 2;
  });

  return {
    nodes: data.nodes,
    links
  };
}

function buildBalancedLabelNodes(nodes, perType = 14) {
  return [
    ...nodes.filter(d => d.type === "source").sort((a, b) => d3.descending(a.value, b.value)).slice(0, perType),
    ...nodes.filter(d => d.type === "prize").sort((a, b) => d3.descending(a.value, b.value)).slice(0, perType),
    ...nodes.filter(d => d.type === "target").sort((a, b) => d3.descending(a.value, b.value)).slice(0, perType)
  ];
}

function inferDominantRole(roleCounts) {
  const entries = Object.entries(roleCounts).sort((a, b) => d3.descending(a[1], b[1]));

  if (!entries.length || entries[0][1] === 0) return "mixed";

  if (entries[1] && entries[0][1] === entries[1][1]) {
    return "mixed";
  }

  return entries[0][0];
}

function domainRank(domain) {
  const key = cleanText(domain).toLowerCase();
  if (key.includes("physical")) return 0;
  if (key.includes("life")) return 1;
  if (key.includes("health")) return 2;
  if (key.includes("social")) return 3;
  return 4;
}

function getLinkColorDomain(link) {
  if (link.flowType === "output") {
    return link.target?.domain || link.targetDomain;
  }

  return link.source?.domain || link.sourceDomain;
}

function countDomainBreaks(nodes) {
  let breaks = 0;

  for (let i = 1; i < nodes.length; i += 1) {
    if (domainRank(nodes[i - 1].domain) !== domainRank(nodes[i].domain)) breaks += 1;
  }

  return breaks;
}

function curvedHorizontalPath(x1, y1, x2, y2) {
  const midX = (x1 + x2) / 2;
  return `M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`;
}

function curvedLinkPath(x1, y1, x2, y2, offset = 0) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.sqrt(dx * dx + dy * dy) || 1;

  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;

  const nx = -dy / distance;
  const ny = dx / distance;

  const qx = mx + nx * offset;
  const qy = my + ny * offset;

  return `M${x1},${y1} Q${qx},${qy} ${x2},${y2}`;
}

function highlightPathNode(selected, nodes, links, options = {}) {
  const linkOpacity = options.linkOpacity || (() => 0.34);
  const linkDisplayWidth = options.linkDisplayWidth || (() => 1.4);
  const linkColor = options.linkColor || (() => "#94a3b8");

  nodes.interrupt();
  links.interrupt();

  if (selected.type === "prize") {
    highlightPrizeKnowledgeGap(selected, nodes, links, {
      linkOpacity,
      linkDisplayWidth,
      linkColor
    });
    return;
  }

  const neighborIds = new Set([selected.id]);

  links.each(function (link) {
    if (link.source.id === selected.id) neighborIds.add(link.target.id);
    if (link.target.id === selected.id) neighborIds.add(link.source.id);
  });

  nodes.style("opacity", d => neighborIds.has(d.id) ? 1 : 0.18);

  links
    .attr("stroke", linkColor)
    .attr("stroke-opacity", d => {
      return d.source.id === selected.id || d.target.id === selected.id ? 0.9 : 0.06;
    })
    .attr("stroke-width", d => {
      return d.source.id === selected.id || d.target.id === selected.id
        ? Math.max(2.4, linkDisplayWidth(d) + 1.2)
        : Math.max(0.5, linkDisplayWidth(d) * 0.45);
    });
}

function highlightPrizeKnowledgeGap(selected, nodes, links, options) {
  const novelColor = "#dc2626";
  const lostColor = "#0284c7";
  const incoming = [];
  const outgoing = [];

  links.each(function (link) {
    if (link.target.id === selected.id && link.source.type === "source") incoming.push(link);
    if (link.source.id === selected.id && link.target.type === "target") outgoing.push(link);
  });

  const sourceNames = new Set(incoming.map(link => link.source.name));
  const targetNames = new Set(outgoing.map(link => link.target.name));
  const novelTargetIds = new Set(
    outgoing
      .filter(link => !isOtherFieldNode(link.target) && !sourceNames.has(link.target.name))
      .map(link => link.target.id)
  );
  const lostSourceIds = new Set(
    incoming
      .filter(link => !isOtherFieldNode(link.source) && !targetNames.has(link.source.name))
      .map(link => link.source.id)
  );
  const connectedIds = new Set([selected.id]);

  incoming.forEach(link => connectedIds.add(link.source.id));
  outgoing.forEach(link => connectedIds.add(link.target.id));

  nodes
    .style("opacity", d => connectedIds.has(d.id) ? 1 : 0.13)
    .attr("stroke", d => {
      if (d.id === selected.id) return "#667085";
      if (novelTargetIds.has(d.id)) return novelColor;
      if (lostSourceIds.has(d.id)) return lostColor;
      return "#ffffff";
    })
    .attr("stroke-width", d => {
      if (d.id === selected.id) return 2.4;
      if (novelTargetIds.has(d.id) || lostSourceIds.has(d.id)) return 2.8;
      return 1.2;
    });

  links
    .attr("stroke", d => {
      if (d.source.id === selected.id && novelTargetIds.has(d.target.id)) return novelColor;
      if (d.target.id === selected.id && lostSourceIds.has(d.source.id)) return lostColor;
      if (d.source.id === selected.id || d.target.id === selected.id) return options.linkColor(d);
      return "#d7dde5";
    })
    .attr("stroke-opacity", d => {
      if (d.source.id === selected.id && novelTargetIds.has(d.target.id)) return 0.92;
      if (d.target.id === selected.id && lostSourceIds.has(d.source.id)) return 0.92;
      if (d.source.id === selected.id || d.target.id === selected.id) return Math.max(0.42, options.linkOpacity(d));
      return 0.045;
    })
    .attr("stroke-width", d => {
      if (
        (d.source.id === selected.id && novelTargetIds.has(d.target.id)) ||
        (d.target.id === selected.id && lostSourceIds.has(d.source.id))
      ) {
        return Math.max(2.8, options.linkDisplayWidth(d) + 1.8);
      }

      if (d.source.id === selected.id || d.target.id === selected.id) {
        return Math.max(1.3, options.linkDisplayWidth(d));
      }

      return Math.max(0.45, options.linkDisplayWidth(d) * 0.35);
    });

  nodes
    .filter(d => novelTargetIds.has(d.id) || lostSourceIds.has(d.id))
    .transition()
    .duration(150)
    .attr("stroke-width", 5)
    .transition()
    .duration(360)
    .attr("stroke-width", 2.8);

  links
    .filter(d =>
      (d.source.id === selected.id && novelTargetIds.has(d.target.id)) ||
      (d.target.id === selected.id && lostSourceIds.has(d.source.id))
    )
    .transition()
    .duration(150)
    .attr("stroke-opacity", 1)
    .transition()
    .duration(360)
    .attr("stroke-opacity", 0.88);
}

function isOtherFieldNode(node) {
  return cleanText(node?.name).toLowerCase().startsWith("other ");
}

function nodePathMetricHtml(node) {
  if (node.type === "source") {
    return `来源路径：${formatNumber(node.outValue || node.value || 0)}`;
  }

  if (node.type === "target") {
    return `扩散路径：${formatNumber(node.inValue || node.value || 0)}`;
  }

  return [
    `来源路径：${formatNumber(node.inValue || 0)}`,
    `扩散路径：${formatNumber(node.outValue || 0)}`
  ].join("<br>");
}

function normalizeView(value) {
  const v = cleanText(value).toLowerCase();

  if (!v) return "sankey";

  if (
    v.includes("arc") ||
    v.includes("弧线") ||
    v.includes("network") ||
    v.includes("引用路径")
  ) {
    return "arc";
  }

  if (
    v.includes("sankey") ||
    v.includes("桑基") ||
    v.includes("主题迁移")
  ) {
    return "sankey";
  }

  return v;
}

function pushSample(target, sample, maxSamples) {
  if (target.length >= maxSamples) return;
  target.push(sample);
}

function appendSamples(target, samples, maxSamples) {
  for (const sample of samples) {
    if (target.length >= maxSamples) break;
    target.push(sample);
  }
}

function splitMultiValue(value) {
  const text = cleanText(value);
  if (!text) return [];

  return text
    .split("|")
    .map(d => cleanText(d))
    .filter(Boolean)
    .filter(d => !["nan", "none", "null", "undefined"].includes(d.toLowerCase()));
}

function firstMeaningful(values, fallback1, fallback2) {
  if (Array.isArray(values) && values.length) return values[0];
  if (fallback1) return fallback1;
  return fallback2;
}

function normalizeFieldName(value) {
  const text = cleanText(value);
  if (!text) return "";

  if (/physics/i.test(text)) return "Physics";
  if (/chemistry/i.test(text)) return "Chemistry";
  if (/medicine|physiology/i.test(text)) return "Medicine";

  return splitMultiValue(text)[0] || "";
}

function fieldMatches(value, field) {
  const text = cleanText(value).toLowerCase();
  const f = cleanText(field).toLowerCase();

  if (!text || !f) return false;

  if (f === "physics") return text.includes("physics");
  if (f === "chemistry") return text.includes("chemistry");
  if (f === "medicine") return text.includes("medicine") || text.includes("physiology");

  return false;
}

function getPrizeTopic(row) {
  return cleanText(row.prize_topic) ||
    normalizeFieldName(row.prize_paper_field) ||
    firstMeaningful(splitMultiValue(row.prize_paper_subfield), "", "Unknown Nobel Field");
}

function getCitationTopic(row) {
  return cleanText(row.citation_topic) ||
    normalizeFieldName(row.citation_paper_field) ||
    firstMeaningful(splitMultiValue(row.citation_paper_subfield), "", "Unknown Citation Field");
}

function getPrizeDomain(row) {
  return cleanText(row.prize_domain || row.prize_paper_domain) || "Unknown Domain";
}

function getCitationDomain(row) {
  return cleanText(row.citation_domain || row.citation_paper_domain) || "Unknown Domain";
}

function getRowCount(row) {
  const count = Number(row.count);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

function isUnknownValue(value) {
  const text = cleanText(value).toLowerCase();
  return !text || text.includes("unknown") || text === "nan" || text === "none" || text === "null";
}

function selectReadableFields(countMap, { maxCount, minShare, coverage }) {
  const entries = Array.from(countMap.entries())
    .filter(([, value]) => value > 0)
    .sort((a, b) => d3.descending(a[1], b[1]));
  const total = d3.sum(entries, d => d[1]) || 1;
  const result = new Set();
  let running = 0;

  entries.forEach(([key, value], index) => {
    if (index >= maxCount) return;
    const share = value / total;
    if (share >= minShare || running / total < coverage) {
      result.add(key);
      running += value;
    }
  });

  return result;
}

function selectTopFieldsWithOtherBudget(countMap, domainByTopic, topN) {
  const entries = Array.from(countMap.entries())
    .filter(([, value]) => value > 0)
    .sort((a, b) => d3.descending(a[1], b[1]));
  const keep = new Set(entries.slice(0, topN).map(([key]) => key));

  while (keep.size + countOtherDomains(entries, keep, domainByTopic) > topN && keep.size > 0) {
    const removable = Array.from(keep)
      .sort((a, b) => d3.ascending(countMap.get(a) || 0, countMap.get(b) || 0))[0];
    keep.delete(removable);
  }

  return keep;
}

function countOtherDomains(entries, keep, domainByTopic) {
  const domains = new Set();

  entries.forEach(([topic]) => {
    if (keep.has(topic)) return;
    const domain = domainByTopic.get(topic);
    if (!isUnknownValue(domain)) domains.add(domain);
  });

  return domains.size;
}

function buildTopicDomainMap(rows, topicAccessor, domainAccessor) {
  const domainCountsByTopic = new Map();

  rows.forEach(row => {
    const topic = topicAccessor(row);
    const domain = domainAccessor(row);
    if (!topic || isUnknownValue(domain)) return;
    if (!domainCountsByTopic.has(topic)) domainCountsByTopic.set(topic, new Map());
    const domainCounts = domainCountsByTopic.get(topic);
    domainCounts.set(domain, (domainCounts.get(domain) || 0) + row.count);
  });

  const result = new Map();
  domainCountsByTopic.forEach((domainCounts, topic) => {
    result.set(topic, getDominantDomain(domainCounts));
  });

  return result;
}

function buildOrderMap(countMap) {
  return new Map(
    Array.from(countMap.entries())
      .sort((a, b) => d3.descending(a[1], b[1]))
      .map(([key], index) => [key, index])
  );
}

function getPrizeReferenceRank(node, prizeOrder, prizeDomainOrder) {
  if (prizeOrder.has(node.name)) return prizeOrder.get(node.name);

  const domainRank = prizeDomainOrder.get(node.domain) ?? 99;
  if (node.name.startsWith("Other ")) return 1000 + domainRank;

  return 500 + domainRank;
}

function resolveFieldNode({ type, topic, domain, keepSet, otherPrefix }) {
  const safeDomain = cleanText(domain) || "Unknown Domain";
  const safeTopic = cleanText(topic) || "Unknown Field";
  const isKept = keepSet.has(safeTopic);
  const name = isKept ? safeTopic : `${otherPrefix} ${shortDomainName(safeDomain)}`;

  return {
    id: `${type}|${safeDomain}|${name}`,
    name,
    type,
    domain: safeDomain
  };
}

function shortDomainName(domain) {
  const text = cleanText(domain);
  if (text === "Physical Sciences") return "Physical";
  if (text === "Life Sciences") return "Life";
  if (text === "Health Sciences") return "Health";
  if (text === "Social Sciences") return "Social";
  return "Unknown";
}

function createSankeyNode(id, name, type, domain = "Unknown Domain") {
  return {
    id,
    name,
    type,
    domain,
    value: 0,
    inValue: 0,
    outValue: 0,
    degree: 0,
    domainCounts: new Map(),
    samples: []
  };
}

function addDomainCount(target, domain, value) {
  const key = cleanText(domain) || "Unknown Domain";
  if (!target.domainCounts) target.domainCounts = new Map();
  target.domainCounts.set(key, (target.domainCounts.get(key) || 0) + (Number(value) || 0));
}

function getDominantDomain(domainCounts) {
  if (!domainCounts || !domainCounts.size) return "Unknown Domain";
  return Array.from(domainCounts.entries())
    .sort((a, b) => d3.descending(a[1], b[1]))[0][0];
}

function drawDomainLegend(svg, { x, y }) {
  const legend = svg
    .append("g")
    .attr("class", "sankey-legend")
    .attr("transform", `translate(${x}, ${y})`);

  const items = [
    ["Physical Sciences", "Physical Sciences"],
    ["Life Sciences", "Life Sciences"],
    ["Health Sciences", "Health Sciences"],
    ["Social Sciences", "Social Sciences"]
  ];

  let offset = 0;
  items.forEach(([domain, label]) => {
    const item = legend.append("g").attr("transform", `translate(${offset}, 0)`);

    item.append("line")
      .attr("x1", 0)
      .attr("x2", 30)
      .attr("y1", 0)
      .attr("y2", 0)
      .attr("stroke", domainColor(domain, 1))
      .attr("stroke-width", 5)
      .attr("stroke-linecap", "round");

    item.append("text")
      .attr("x", 38)
      .attr("y", 4)
      .attr("font-size", 12)
      .attr("fill", "#64748b")
      .text(label);

    offset += label.length * 7 + 78;
  });
}

function propagationLabel(type) {
  if (type === "input") return "Input knowledge flow";
  if (type === "output") return "Future impact diffusion";
  return "Knowledge flow";
}

function propagationColor(type, alpha = 0.78) {
  if (type === "input") return `rgba(122, 166, 194, ${alpha})`;
  if (type === "output") return `rgba(216, 162, 74, ${alpha})`;
  return `rgba(148, 163, 184, ${alpha})`;
}

function roleColor(type, alpha = 0.9) {
  if (type === "source") return `rgba(122, 166, 194, ${alpha})`;
  if (type === "prize") return `rgba(184, 166, 207, ${alpha})`;
  if (type === "target") return `rgba(216, 162, 74, ${alpha})`;
  return `rgba(148, 163, 184, ${alpha})`;
}

function domainColor(domain, alpha = 0.78) {
  const key = cleanText(domain).toLowerCase();
  const colors = {
    physical: [216, 162, 74],
    life: [122, 166, 194],
    health: [199, 124, 124],
    social: [184, 166, 207],
    unknown: [215, 221, 229]
  };

  let rgb = colors.unknown;
  if (key.includes("physical")) rgb = colors.physical;
  else if (key.includes("life")) rgb = colors.life;
  else if (key.includes("health")) rgb = colors.health;
  else if (key.includes("social")) rgb = colors.social;

  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function countBy(rows, accessor) {
  const map = new Map();

  rows.forEach(row => {
    const key = accessor(row);
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  });

  return map;
}

function countByWeight(rows, accessor, weightAccessor) {
  const map = new Map();

  rows.forEach(row => {
    const key = accessor(row);
    if (!key) return;
    const weight = Number(weightAccessor(row)) || 0;
    map.set(key, (map.get(key) || 0) + weight);
  });

  return map;
}

function topKeys(countMap, n) {
  return new Set(
    Array.from(countMap.entries())
      .sort((a, b) => d3.descending(a[1], b[1]))
      .slice(0, n)
      .map(d => d[0])
  );
}

function topKeysByCoverage(countMap, { minCount, maxCount, coverage }) {
  const entries = Array.from(countMap.entries())
    .filter(([, value]) => value > 0)
    .sort((a, b) => d3.descending(a[1], b[1]));
  const total = d3.sum(entries, d => d[1]) || 1;
  const result = new Set();
  let running = 0;

  entries.forEach(([key, value], index) => {
    if (index >= maxCount) return;
    if (index < minCount || running / total < coverage) {
      result.add(key);
      running += value;
    }
  });

  return result;
}

function mergeCountMaps(...maps) {
  const result = new Map();

  maps.forEach(map => {
    map.forEach((value, key) => {
      result.set(key, (result.get(key) || 0) + value);
    });
  });

  return result;
}

function mergeTopKeys(primaryKeys, globalKeys, roleCounts) {
  const result = new Set(primaryKeys);

  globalKeys.forEach(key => {
    if (roleCounts.has(key)) result.add(key);
  });

  return result;
}

function uniqueBy(rows, accessor) {
  const seen = new Set();
  const result = [];

  rows.forEach(row => {
    const key = accessor(row);
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(row);
  });

  return result;
}

function roleLabel(role) {
  if (role === "source") return "知识来源主题";
  if (role === "prize") return "诺奖论文主题";
  if (role === "target") return "后续扩散主题";
  if (role === "mixed") return "混合角色主题";
  return "主题节点";
}

function edgeTypeLabel(edgeRole) {
  if (edgeRole === "source_to_prize") return "知识来源 → 诺奖主题";
  if (edgeRole === "prize_to_target") return "诺奖主题 → 后续扩散";
  return "主题路径";
}

function getId(value) {
  return typeof value === "object" && value !== null ? value.id : value;
}

function getNodeName(value) {
  return typeof value === "object" && value !== null ? value.name || value.id : value;
}

function setText(selector, value) {
  const selection = d3.select(selector);
  if (!selection.empty()) selection.text(value);
}

function cleanText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function shortenText(value, maxLength = 32) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function moveTooltip(event) {
  d3.select(".topic-tooltip")
    .style("left", `${event.pageX + 14}px`)
    .style("top", `${event.pageY + 14}px`);
}

function normalizeSelectedField(value) {
  const text = cleanText(value);

  if (text === "all" || text === "全部学科") {
    return "all";
  }

  const field = normalizeFieldName(text);

  if (["Physics", "Chemistry", "Medicine"].includes(field)) {
    return field;
  }

  return "all";
}

function prepareCitationArcData(rows, state) {
  const selectedField = normalizeSelectedField(state.field);
  const topN = state.arcTopN || 10;
  const maxSamples = state.maxSamples || 8;
  const minArcWeight = 3;

  const rawRecords = [];

  rows.forEach(d => {
    const direction = cleanText(d.direction);
    const isInput = direction === "prize_paper_references_citation_paper";
    const isOutput = direction === "citation_paper_cites_prize_paper";

    if (!isInput && !isOutput) return;

    const prizeField = normalizeFieldName(d.prize_paper_field);
    const citationField = normalizeFieldName(d.citation_paper_field);

    // domain 只用于着色，不用于节点命名
    const prizeDomain = normalizeArcDomain(d.prize_paper_domain);
    const citationDomain = normalizeArcDomain(d.citation_paper_domain);

    // 仍然按诺奖论文所属大类 field 做筛选
    if (selectedField !== "all" && prizeField !== selectedField) return;

    // 节点名称只使用 subfield
    const prizeSubfield = cleanText(extractPrimarySubfield(d.prize_paper_subfield));
    const citationSubfield = cleanText(extractPrimarySubfield(d.citation_paper_subfield));

    // Unknown subfield 直接删除；domain 不参与这个判断
    if (!prizeSubfield || !citationSubfield) return;
    if (isUnknownArcSubfield(prizeSubfield) || isUnknownArcSubfield(citationSubfield)) return;

    const count = getRowCount(d);
    if (count < minArcWeight) return;

    rawRecords.push({
      direction,
      isInput,
      isOutput,
      count,

      prize_paper_id: cleanText(d.prize_paper_id || d.sample_prize_paper_id),
      prize_paper_title: cleanText(d.prize_paper_title || d.sample_prize_paper_title),
      citation_paper_id: cleanText(d.citation_paper_id || d.sample_citation_paper_id),
      citation_paper_title: cleanText(d.citation_paper_title || d.sample_citation_paper_title),

      prizeField,
      citationField,
      prizeDomain,
      citationDomain,

      prizeSubfield,
      citationSubfield
    });
  });

  const globalRoleStats = buildArcGlobalRoleStats(rawRecords);

  const sourceCounts = countByWeight(
    rawRecords.filter(d => d.isInput),
    d => d.citationSubfield,
    d => d.count
  );

  const prizeCounts = countByWeight(
    rawRecords,
    d => d.prizeSubfield,
    d => d.count
  );

  const targetCounts = countByWeight(
    rawRecords.filter(d => d.isOutput),
    d => d.citationSubfield,
    d => d.count
  );

  const topSources = topKeys(sourceCounts, topN);
  const topPrizes = topKeys(prizeCounts, topN);

  const rawTopTargets = topKeys(targetCounts, topN);

  // 如果后续扩散 subfield 已经在左侧知识来源里出现，就不再单独放到右边
  const topTargets = new Set(
    [...rawTopTargets].filter(name => !topSources.has(name))
  );

  const nodeMap = new Map();
  const linkMap = new Map();

  function ensureNode(id, name, axisRole) {
    if (!nodeMap.has(id)) {
      nodeMap.set(id, {
        id,
        name,
        axisRole,

        value: 0,
        sourceValue: 0,
        prizeValue: 0,
        targetValue: 0,

        samples: [],
        colorVotes: {},
        globalRoleStats: null
      });
    }

    return nodeMap.get(id);
  }

  function addNodeContribution(node, roleField, domain, record) {
    node.value += record.count;
    node[roleField] += record.count;

    // 只用 domain 投票决定颜色
    addDomainVote(node.colorVotes, domain);

    pushSample(node.samples, record, maxSamples);
  }

  rawRecords.forEach(record => {
    const prizeBucket = bucketToTopOrOthers(record.prizeSubfield, topPrizes, record.prizeDomain);
    const prizeNodeId = `prize|${prizeBucket}`;
    const prizeNode = ensureNode(prizeNodeId, prizeBucket, "prize");

    // 诺奖核心节点颜色按 prize_paper_domain
    addNodeContribution(prizeNode, "prizeValue", record.prizeDomain, record);

    if (record.isInput) {
      const sourceBucket = bucketToTopOrOthers(record.citationSubfield, topSources, record.citationDomain);
      const sourceNodeId = `source|${sourceBucket}`;
      const sourceNode = ensureNode(sourceNodeId, sourceBucket, "source");

      // 知识来源节点颜色按 citation_paper_domain
      addNodeContribution(sourceNode, "sourceValue", record.citationDomain, record);

      const linkKey = `upper|${prizeNodeId}---${sourceNodeId}`;

      if (!linkMap.has(linkKey)) {
        linkMap.set(linkKey, {
          key: linkKey,
          source: prizeNodeId,
          target: sourceNodeId,
          sourceName: prizeBucket,
          targetName: sourceBucket,
          role: "nobel_references_source",
          value: 0,
          samples: [],
          colorVotes: {}
        });
      }

      const link = linkMap.get(linkKey);
      link.value += record.count;
      link.sourceDomain = record.prizeDomain;
      link.targetDomain = record.citationDomain;

      // 弧线也可以按 citation domain 记录颜色归属，但实际颜色函数下面会统一低饱和处理
      addDomainVote(link.colorVotes, record.citationDomain);

      pushSample(link.samples, record, maxSamples);
    }

    if (record.isOutput) {
      const sourceSideBucket = bucketToTopOrOthers(record.citationSubfield, topSources, record.citationDomain);
      const targetSideBucket = bucketToTopOrOthers(record.citationSubfield, topTargets, record.citationDomain);

      const overlapsWithSource = !isArcOtherName(sourceSideBucket);

      if (overlapsWithSource) {
        const sourceNodeId = `source|${sourceSideBucket}`;
        const sourceNode = ensureNode(sourceNodeId, sourceSideBucket, "source");

        // 虽然显示在左侧，但它也承担后续扩散统计角色
        addNodeContribution(sourceNode, "targetValue", record.citationDomain, record);

        const linkKey = `lower|${prizeNodeId}---${sourceNodeId}`;

        if (!linkMap.has(linkKey)) {
          linkMap.set(linkKey, {
            key: linkKey,
            source: prizeNodeId,
            target: sourceNodeId,
            sourceName: prizeBucket,
            targetName: sourceSideBucket,
            role: "future_cites_nobel",
            overlapToSource: true,
            value: 0,
            samples: [],
            colorVotes: {}
          });
        }

        const link = linkMap.get(linkKey);
        link.value += record.count;
        link.sourceDomain = record.prizeDomain;
        link.targetDomain = record.citationDomain;
        addDomainVote(link.colorVotes, record.citationDomain);
        pushSample(link.samples, record, maxSamples);

      } else {
        const targetNodeId = `target|${targetSideBucket}`;
        const targetNode = ensureNode(targetNodeId, targetSideBucket, "target");

        // 后续扩散节点颜色按 citation_paper_domain
        addNodeContribution(targetNode, "targetValue", record.citationDomain, record);

        const linkKey = `lower|${targetNodeId}---${prizeNodeId}`;

        if (!linkMap.has(linkKey)) {
          linkMap.set(linkKey, {
            key: linkKey,
            source: targetNodeId,
            target: prizeNodeId,
            sourceName: targetSideBucket,
            targetName: prizeBucket,
            role: "future_cites_nobel",
            overlapToSource: false,
            value: 0,
            samples: [],
            colorVotes: {}
          });
        }

        const link = linkMap.get(linkKey);
        link.value += record.count;
        link.sourceDomain = record.citationDomain;
        link.targetDomain = record.prizeDomain;
        addDomainVote(link.colorVotes, record.citationDomain);
        pushSample(link.samples, record, maxSamples);
      }
    }
  });

  const nodes = Array.from(nodeMap.values()).map(node => {
    // colorField 这里实际存的是 domain
    node.colorField = chooseDominantField(node.colorVotes);

    node.globalRoleStats = isArcOtherName(node.name)
      ? null
      : (globalRoleStats.get(node.name) || { source: 0, prize: 0, target: 0 });

    return node;
  });

  const roleOrder = { source: 0, prize: 1, target: 2 };

  nodes.sort((a, b) => {
    if (a.axisRole !== b.axisRole) {
      return d3.ascending(roleOrder[a.axisRole], roleOrder[b.axisRole]);
    }

    if (isArcOtherName(a.name) && !isArcOtherName(b.name)) return 1;
    if (!isArcOtherName(a.name) && isArcOtherName(b.name)) return -1;

    return d3.descending(a.value, b.value);
  });

  const allLinks = Array.from(linkMap.values())
    .map(link => {
      link.colorField = chooseDominantField(link.colorVotes);
      return link;
    })
    .filter(link => link.value > 0);

  const upperLinks = allLinks
    .filter(d => d.role === "nobel_references_source")
    .sort((a, b) => d3.descending(a.value, b.value));

  const lowerLinks = allLinks
    .filter(d => d.role === "future_cites_nobel")
    .sort((a, b) => d3.descending(a.value, b.value));

  const maxLinksPerSide =
    topN === 20 ? 34 :
    topN === 15 ? 26 :
    18;

  const keptUpper = upperLinks.slice(0, maxLinksPerSide);
  const keptLower = lowerLinks.slice(0, maxLinksPerSide);

  keptUpper.forEach((d, i) => { d.arcRank = i; });
  keptLower.forEach((d, i) => { d.arcRank = i; });

  return {
    selectedField,
    topN,
    totalPathCount: d3.sum(rawRecords, d => d.count),

    nodes,
    links: [...keptUpper, ...keptLower],

    sourceCount: nodes.filter(d => d.axisRole === "source").length,
    prizeCount: nodes.filter(d => d.axisRole === "prize").length,
    targetCount: nodes.filter(d => d.axisRole === "target").length
  };
}

function drawCitationArcDiagram(data) {
  const container = d3.select("#topic-migration-chart");
  const node = container.node();
  const width = node.clientWidth || 1100;
  const height = 840;

  const margin = {
    top: 95,
    right: 40,
    bottom: 105,
    left: 40
  };

  const axisY = height / 2 - 22;

  const svg = container
    .append("svg")
    .attr("width", "100%")
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const defs = svg.append("defs");

  defs.append("marker")
    .attr("id", "arc-arrow-soft")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 9)
    .attr("refY", 0)
    .attr("markerWidth", 4.8)
    .attr("markerHeight", 4.8)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "rgba(0, 0, 0, 0.45)");

  const title = data.selectedField === "all"
    ? "全部学科引用路径弧线图"
    : `${data.selectedField} 引用路径弧线图`;

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", 28)
    .attr("text-anchor", "middle")
    .attr("fill", "#0f172a")
    .attr("font-size", 16)
    .attr("font-weight", 800)
    .text(title);

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", 50)
    .attr("text-anchor", "middle")
    .attr("fill", "#64748b")
    .attr("font-size", 12)
    .text(`节点使用 subfield，颜色表示 domain；每侧保留 Top ${data.topN}，其余合并为 Others；已删除 Unknown；上方为前置知识来源，下方为后续扩散路径；若后续扩散与知识来源重合，则复用左侧节点。`);

  svg.append("line")
    .attr("x1", margin.left - 20)
    .attr("x2", width - margin.right + 20)
    .attr("y1", axisY)
    .attr("y2", axisY)
    .attr("stroke", "#cbd5e1")
    .attr("stroke-width", 1.2);

  const sourceNodes = data.nodes.filter(d => d.axisRole === "source");
  const prizeNodes = data.nodes.filter(d => d.axisRole === "prize");
  const targetNodes = data.nodes.filter(d => d.axisRole === "target");

  sortArcNodes(sourceNodes);
  sortArcNodes(prizeNodes);
  sortArcNodes(targetNodes);

  assignArcNodePositions(
    sourceNodes,
    margin.left + 30,
    width * 0.36,
    axisY
  );

  assignArcNodePositions(
    prizeNodes,
    width * 0.44,
    width * 0.66,
    axisY
  );

  assignArcNodePositions(
    targetNodes,
    width * 0.76,
    width - margin.right - 30,
    axisY
  );

  const nodeById = new Map(data.nodes.map(d => [d.id, d]));

  const maxNodeValue = d3.max(data.nodes, d => d.value) || 1;
  const upperMaxLinkValue = d3.max(data.links.filter(d => d.role === "nobel_references_source"), d => d.value) || 1;
  const lowerMaxLinkValue = d3.max(data.links.filter(d => d.role === "future_cites_nobel"), d => d.value) || 1;

  const radius = d3.scaleSqrt()
    .domain([1, maxNodeValue])
    .range([6, 17]);

  const upperLinkWidth = d3.scaleSqrt()
    .domain([1, upperMaxLinkValue])
    .range([0.9, 5.8]);

  const lowerLinkWidth = d3.scaleSqrt()
    .domain([1, lowerMaxLinkValue])
    .range([0.9, 6.2]);

  const linkWidth = d => {
    const scale = d.role === "nobel_references_source" ? upperLinkWidth : lowerLinkWidth;
    return scale(d.value);
  };

  data.nodes.forEach(d => {
    d.r = radius(d.value);
  });

  const tooltip = d3.select(".topic-tooltip");

  const lowerGroupTitleY = axisY + 270;
  drawArcGroupTitle(svg, (margin.left + 10 + width * 0.31) / 2, lowerGroupTitleY, "知识来源 subfield");
  drawArcGroupTitle(svg, width / 2, lowerGroupTitleY, "诺奖核心 subfield");
  drawArcGroupTitle(svg, (width * 0.69 + width - margin.right - 10) / 2, lowerGroupTitleY, "后续扩散 subfield");

  svg.append("text")
    .attr("x", margin.left + 4)
    .attr("y", axisY - 220)
    .attr("fill", "#64748b")
    .attr("font-size", 12)
    .attr("font-weight", 700)
    .text("上方：诺奖核心引用前置知识");

  svg.append("text")
    .attr("x", margin.left + 4)
    .attr("y", axisY + 310)
    .attr("fill", "#64748b")
    .attr("font-size", 12)
    .attr("font-weight", 700)
    .text("下方：后续研究引用诺奖核心");

  const linkLayer = svg.append("g");
  const nodeLayer = svg.append("g");
  const labelLayer = svg.append("g");

  const links = linkLayer
    .selectAll("path")
    .data(data.links, d => d.key)
    .join("path")
    .attr("fill", "none")
    .attr("stroke", d => arcStrokeColor(d, d.arcRank || 0))
    .attr("stroke-width", d => arcLinkWidth(d, linkWidth))
    .attr("stroke-linecap", "round")
    .attr("stroke-opacity", d => arcLinkOpacity(d, d.arcRank || 0))
    .attr("d", d => {
      const source = nodeById.get(d.source);
      const target = nodeById.get(d.target);
      if (!source || !target) return "";

      return citationArcPath({
        sourceX: source.x,
        targetX: target.x,
        axisY,
        role: d.role,
        rank: d.arcRank || 0
      });
    })
    .on("mouseover", function (event, d) {
      links
        .attr("stroke-opacity", x => x.key === d.key ? 1 : 0.08)
        .attr("stroke-width", x => x.key === d.key ? Math.max(2.6, arcLinkWidth(x, linkWidth) + 1.2) : arcLinkWidth(x, linkWidth));

      nodes.style("opacity", n => (n.id === d.source || n.id === d.target) ? 1 : 0.22);
      labels.style("opacity", n => (n.id === d.source || n.id === d.target) ? 1 : 0.15);

      tooltip
        .style("opacity", 1)
        .html(`
          <strong>${safeText(d.sourceName)} → ${safeText(d.targetName)}</strong><br>
          类型：${safeText(arcRoleLabel(d.role))}<br>
          路径数量：${formatNumber(d.value)}<br>
          路径关系：${safeText(arcSubfieldRelationLabel(d))}<br>
          说明：${safeText(arcDirectionExplain(d.role))}
        `);
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", function () {
      links
        .attr("stroke-opacity", d => arcLinkOpacity(d, d.arcRank || 0))
        .attr("stroke-width", d => arcLinkWidth(d, linkWidth));

      nodes.style("opacity", 1);
      labels.style("opacity", d => d.__showLabel ? 1 : 0);
      tooltip.style("opacity", 0);
    })
    .on("click", function (event, d) {
      renderArcLinkCards(d);
    });

  const nodes = nodeLayer
    .selectAll("g")
    .data(data.nodes, d => d.id)
    .join("g")
    .attr("transform", d => `translate(${d.x},${d.y})`)
    .style("cursor", "pointer")
    .on("mouseover", function (event, d) {
      links
        .attr("stroke-opacity", link => (link.source === d.id || link.target === d.id) ? 1 : 0.08)
        .attr("stroke-width", link => (link.source === d.id || link.target === d.id)
          ? Math.max(2.3, arcLinkWidth(link, linkWidth) + 1.1)
          : arcLinkWidth(link, linkWidth));

      nodes.style("opacity", n => n.id === d.id ? 1 : 0.24);
      labels.style("opacity", n => n.id === d.id ? 1 : 0.18);

      const globalStatsHtml = isArcOtherName(d.name)
        ? `
          该节点为按 domain 分组的 Others 合并节点。<br>
          它包含未进入 Top N 的多个 subfield，因此不展示单一 subfield 的全局角色统计。
        `
        : `
          该 subfield 在全局中的角色：<br>
          作为知识来源：${formatNumber(d.globalRoleStats?.source || 0)}<br>
          作为诺奖核心：${formatNumber(d.globalRoleStats?.prize || 0)}<br>
          作为后续扩散：${formatNumber(d.globalRoleStats?.target || 0)}
        `;

      tooltip
        .style("opacity", 1)
        .html(`
          <strong>${safeText(d.name)}</strong><br>
          当前节点位置：${safeText(arcNodeRoleLabel(d.axisRole))}<br>
          当前节点路径数：${formatNumber(d.value)}<br>
          节点颜色 domain：${safeText(d.colorField || "Other")}<br>
          ${globalStatsHtml}
        `);
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", function () {
      links
        .attr("stroke-opacity", 1)
        .attr("stroke-width", d => arcLinkWidth(d, linkWidth));

      nodes.style("opacity", 1);
      labels.style("opacity", d => d.__showLabel ? 1 : 0);
      tooltip.style("opacity", 0);
    })
    .on("click", function (event, d) {
      renderArcNodeCards(d);
    });

  nodes.append("circle")
    .attr("r", d => radius(d.value))
    .attr("fill", d => nodeFieldColor(d.colorField, 0.92))
    .attr("stroke", "rgba(255,255,255,0.95)")
    .attr("stroke-width", 1.8);

  nodes.append("circle")
    .attr("r", d => Math.max(2.2, radius(d.value) * 0.34))
    .attr("fill", "rgba(255,255,255,0.28)")
    .attr("pointer-events", "none");

  // 标签只显示每组前几个 + Others，避免太挤
  const labelShowSet = getArcLabelShowSet(sourceNodes, prizeNodes, targetNodes);

  data.nodes.forEach(d => {
    d.__showLabel = labelShowSet.has(d.id);
  });

  const labels = labelLayer
    .selectAll("text.arc-label")
    .data(data.nodes, d => d.id)
    .join("text")
    .attr("class", "arc-label")
    .attr("x", d => d.x)
    .attr("y", d => axisY + 36)
    .attr("text-anchor", "middle")
    .attr("fill", "#334155")
    .attr("font-size", 10.5)
    .attr("font-weight", 700)
    .attr("paint-order", "stroke")
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 3)
    .style("opacity", d => d.__showLabel ? 1 : 0)
    .text(d => isArcOtherName(d.name) ? "" : shortenText(d.name, 12));

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height - 18)
    .attr("text-anchor", "middle")
    .attr("fill", "#94a3b8")
    .attr("font-size", 11)
    .text("节点颜色表示 domain；每侧仅保留 Top N subfield，其余合并为 Others；已删除 Unknown；点击节点或弧线可查看代表论文。");

  drawArcLegend(svg, {
    x: margin.left + 8,
    y: height - 62
  });

  renderArcDefaultCards(data);
}

function assignArcNodePositions(nodes, startX, endX, axisY) {
  const scale = d3.scalePoint()
    .domain(nodes.map(d => d.id))
    .range([startX, endX])
    .padding(0.9);

  nodes.forEach(d => {
    d.x = scale(d.id) || (startX + endX) / 2;
    d.y = axisY;
  });
}

function sortArcNodes(nodes) {
  nodes.sort((a, b) =>
    d3.ascending(domainRank(a.colorField), domainRank(b.colorField)) ||
    d3.descending(a.value, b.value) ||
    d3.ascending(a.name, b.name)
  );
}

function citationArcPath({ sourceX, targetX, axisY, role, rank }) {
  const distance = Math.abs(targetX - sourceX);

  // 弧线幅度明显加大
  const baseHeight = Math.max(110, distance * 0.52);
  const extraHeight = Math.min(150, rank * 11);
  const arcHeight = baseHeight + extraHeight;

  const sign = role === "nobel_references_source" ? -1 : 1;
  const midX = (sourceX + targetX) / 2;
  const controlY = axisY + sign * arcHeight;

  if (Math.abs(sourceX - targetX) < 2) {
    const loopWidth = 40;
    return `
      M${sourceX - loopWidth / 2},${axisY}
      Q${sourceX},${axisY + sign * 92}
      ${sourceX + loopWidth / 2},${axisY}
    `;
  }

  return `M${sourceX},${axisY} Q${midX},${controlY} ${targetX},${axisY}`;
}

function drawArcGroupTitle(svg, x, y, text) {
  svg.append("text")
    .attr("x", x)
    .attr("y", y)
    .attr("text-anchor", "middle")
    .attr("fill", "#64748b")
    .attr("font-size", 12)
    .attr("font-weight", 800)
    .attr("paint-order", "stroke")
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 5)
    .text(text);
}

function drawArcLegend(svg, { x, y }) {
  const legend = svg
    .append("g")
    .attr("class", "arc-legend")
    .attr("transform", `translate(${x}, ${y})`);

  const domainItems = [
    ["Physical Sciences", "Physical"],
    ["Life Sciences", "Life"],
    ["Health Sciences", "Health"],
    ["Social Sciences", "Social"]
  ];

  let offset = 0;

  domainItems.forEach(([domain, label]) => {
    const item = legend.append("g").attr("transform", `translate(${offset}, 0)`);

    item.append("circle")
      .attr("cx", 6)
      .attr("cy", 0)
      .attr("r", 5.5)
      .attr("fill", domainColor(domain, 0.92))
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1);

    item.append("text")
      .attr("x", 16)
      .attr("y", 4)
      .attr("font-size", 11)
      .attr("fill", "#64748b")
      .text(label);

    offset += label.length * 7 + 48;
  });

  const linkItems = [
    ["Same subfield", "rgba(169, 120, 93, 0.60)"],
    ["Different subfield", "rgba(107, 114, 128, 0.48)"]
  ];

  linkItems.forEach(([label, color]) => {
    const item = legend.append("g").attr("transform", `translate(${offset}, 0)`);

    item.append("line")
      .attr("x1", 0)
      .attr("x2", 28)
      .attr("y1", 0)
      .attr("y2", 0)
      .attr("stroke", color)
      .attr("stroke-width", 4)
      .attr("stroke-linecap", "round");

    item.append("text")
      .attr("x", 36)
      .attr("y", 4)
      .attr("font-size", 11)
      .attr("fill", "#64748b")
      .text(label);

    offset += label.length * 7 + 64;
  });
}

function extractPrimarySubfield(value) {
  const items = splitMultiValue(value).map(d => cleanText(d)).filter(Boolean);
  return items.length ? items[0] : cleanText(value);
}

function bucketToTopOrOthers(name, topSet, domain = "") {
  return topSet.has(name) ? name : `Other ${shortDomainName(domain)}`;
}

function addFieldVote(voteObj, field) {
  const key = normalizeFieldName(field) || "Other";
  voteObj[key] = (voteObj[key] || 0) + 1;
}

function chooseDominantField(voteObj) {
  const entries = Object.entries(voteObj || {});
  if (!entries.length) return "Other";
  entries.sort((a, b) => d3.descending(a[1], b[1]));
  return entries[0][0];
}

function getArcLabelShowSet(sourceNodes, prizeNodes, targetNodes) {
  const set = new Set();

  function addGroup(nodes, normalCount = 4) {
    const normal = nodes
      .filter(d => !isArcOtherName(d.name))
      .slice(0, normalCount);

    normal.forEach(d => set.add(d.id));
  }

  addGroup(sourceNodes, 4);
  addGroup(prizeNodes, 4);
  addGroup(targetNodes, 4);

  return set;
}

function nodeFieldColor(domain, alpha = 0.88) {
  return domainColor(domain, alpha);
}

function arcSubfieldRelation(link) {
  const sourceName = cleanText(link.sourceName);
  const targetName = cleanText(link.targetName);
  if (!sourceName || !targetName || isOtherArcLink(link)) return "different";
  return sourceName === targetName ? "same" : "different";
}

function arcSubfieldRelationLabel(link) {
  return arcSubfieldRelation(link) === "same" ? "同一 subfield" : "不同 subfield";
}

function arcStrokeColor(link, rank = 0) {
  const relation = arcSubfieldRelation(link);
  const alpha = Math.max(0.22, 0.54 - rank * 0.010);

  if (relation === "same") return `rgba(169, 120, 93, ${Math.max(0.32, alpha + 0.04)})`;
  if (isOtherArcLink(link)) return `rgba(107, 114, 128, ${Math.max(0.18, alpha * 0.68)})`;

  return `rgba(107, 114, 128, ${Math.max(0.28, alpha * 0.90)})`;
}

function arcLinkOpacity(link, rank = 0) {
  return 1;
}

function arcLinkWidth(link, widthScale) {
  return widthScale(link);
}

function isOtherArcLink(link) {
  return isArcOtherName(link.sourceName) || isArcOtherName(link.targetName);
}

function isArcOtherName(name) {
  return cleanText(name).toLowerCase().startsWith("other ");
}

function arcRoleLabel(role) {
  if (role === "nobel_references_source") return "上方弧线：诺奖核心引用前置知识";
  if (role === "future_cites_nobel") return "下方弧线：后续研究引用诺奖核心";
  return "引用路径";
}

function arcDirectionExplain(role) {
  if (role === "nobel_references_source") {
    return "方向为“诺奖核心 subfield → 知识来源 subfield”，表示诺奖论文参考了该前置知识。";
  }
  if (role === "future_cites_nobel") {
    return "方向为“后续扩散 subfield → 诺奖核心 subfield”，表示后续论文引用了诺奖论文。";
  }
  return "";
}

function arcNodeRoleLabel(role) {
  if (role === "source") return "知识来源 subfield";
  if (role === "prize") return "诺奖核心 subfield";
  if (role === "target") return "后续扩散 subfield";
  return "subfield";
}

function isUnknownArcSubfield(value) {
  const text = cleanText(value).toLowerCase();

  if (!text) return true;

  return (
    text === "unknown" ||
    text === "nan" ||
    text === "none" ||
    text === "null" ||
    text === "undefined" ||
    text === "n/a" ||
    text === "na" ||
    text === "unknown nobel subfield" ||
    text === "unknown citation subfield" ||
    text.includes("unknown")
  );
}

function buildArcGlobalRoleStats(records) {
  const map = new Map();

  function ensure(name) {
    if (!map.has(name)) {
      map.set(name, {
        source: 0,
        prize: 0,
        target: 0
      });
    }
    return map.get(name);
  }

  records.forEach(record => {
    ensure(record.prizeSubfield).prize += 1;

    if (record.isInput) {
      ensure(record.citationSubfield).source += 1;
    }

    if (record.isOutput) {
      ensure(record.citationSubfield).target += 1;
    }
  });

  return map;
}

function normalizeArcDomain(value) {
  const text = cleanText(value);

  if (!text) return "Other";

  const lower = text.toLowerCase();

  if (
    lower === "unknown" ||
    lower === "nan" ||
    lower === "none" ||
    lower === "null" ||
    lower === "undefined" ||
    lower === "n/a" ||
    lower === "na"
  ) {
    return "Other";
  }

  return text;
}

function addDomainVote(voteObj, domain) {
  const key = normalizeArcDomain(domain);
  voteObj[key] = (voteObj[key] || 0) + 1;
}
