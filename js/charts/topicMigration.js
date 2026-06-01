// js/charts/topicMigration.js

export async function initTopicMigration() {
  const container = d3.select("#topic-migration-chart");
  if (container.empty()) return;

  const DATA_PATH = "data/";
  const DATA_FILE = "nobel_prize_paper_to_citation_paper_field_paths.csv";

  const fieldSelect = d3.select("#topic-field-filter");
  const viewSelect = d3.select("#topic-view-select");
  const arcTopNSelect = d3.select("#topic-arc-topn-select");
  const arcTopNControl = d3.select("#topic-arc-topn-control");
  const caseCards = d3.select("#topic-case-cards");

  const state = {
    field: fieldSelect.empty() ? "all" : normalizeSelectedField(fieldSelect.property("value")),
    view: viewSelect.empty() ? "sankey" : normalizeView(viewSelect.property("value")),

    // 只作用于引用路径弧线图，不影响 Sankey
    arcTopN: arcTopNSelect.empty() ? 10 : Number(arcTopNSelect.property("value")),

    // Sankey 仍然使用原来的参数，不动
    topSource: 14,
    topPrize: 14,
    topTarget: 14,
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

  let rawRows = [];

  try {
    rawRows = await d3.csv(`${DATA_PATH}${DATA_FILE}`);
  } catch (error) {
    showLoadError(error);
    return;
  }

  populateFieldOptions(rawRows);
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
        state.arcTopN = Number(this.value) || 10;
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

    const records = prepareRecords(rawRows, state);

    if (state.view === "arc") {
      const data = prepareCitationArcData(rawRows, state);
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
    const height = 620;

    const margin = {
      top: 58,
      right: 190,
      bottom: 36,
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
      .text("知识来源");

    svg.append("text")
      .attr("x", width / 2)
      .attr("y", 30)
      .attr("text-anchor", "middle")
      .attr("fill", "#475569")
      .attr("font-size", 13)
      .attr("font-weight", 800)
      .text("诺奖关键论文主题");

    svg.append("text")
      .attr("x", width - margin.right + 20)
      .attr("y", 30)
      .attr("text-anchor", "start")
      .attr("fill", "#475569")
      .attr("font-size", 13)
      .attr("font-weight", 800)
      .text("后续扩散");

    const layout = computeColumnLayout(data, {
      width,
      margin,
      innerHeight,
      nodeWidth
    });

    const colorByType = d3.scaleOrdinal()
      .domain(["source", "prize", "target"])
      .range(["#7aa6c2", "#b8a7d9", "#d9a66a"]);

    const linkWidth = d3.scaleSqrt()
      .domain([1, d3.max(layout.links, d => d.value) || 1])
      .range([1.4, 26]);

    const links = svg.append("g")
      .selectAll("path")
      .data(layout.links, d => d.key)
      .join("path")
      .attr("fill", "none")
      .attr("stroke", d => d.source.type === "source" ? "#7aa6c2" : "#d9a66a")
      .attr("stroke-opacity", 0.28)
      .attr("stroke-linecap", "round")
      .attr("stroke-width", d => linkWidth(d.value))
      .attr("d", d => curvedHorizontalPath(
        d.source.x + nodeWidth,
        d.source.linkY,
        d.target.x,
        d.target.linkY
      ))
      .on("mouseover", function (event, d) {
        d3.select(this)
          .attr("stroke-opacity", 0.82)
          .attr("stroke-width", Math.max(2.5, linkWidth(d.value) + 1.5));

        tooltip
          .style("opacity", 1)
          .html(`
            <strong>${safeText(d.source.name)}</strong><br>
            <span style="color:#cbd5e1;">→ ${safeText(d.target.name)}</span><br>
            路径数量：${formatNumber(d.value)}<br>
            ${d.source.type === "source"
              ? "含义：前置知识进入诺奖论文主题"
              : "含义：诺奖论文主题向后续研究扩散"}
          `);
      })
      .on("mousemove", moveTooltip)
      .on("mouseout", function (event, d) {
        d3.select(this)
          .attr("stroke-opacity", 0.28)
          .attr("stroke-width", linkWidth(d.value));

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
      .attr("fill", d => colorByType(d.type))
      .attr("fill-opacity", 0.88)
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1.2)
      .style("cursor", "pointer")
      .on("mouseover", function (event, d) {
        highlightPathNode(d, nodes, links);

        tooltip
          .style("opacity", 1)
          .html(`
            <strong>${safeText(d.name)}</strong><br>
            类型：${roleLabel(d.type)}<br>
            相关路径：${formatNumber(d.value)}
          `);
      })
      .on("mousemove", moveTooltip)
      .on("mouseout", function () {
        nodes.style("opacity", 1);
        links
          .attr("stroke-opacity", 0.28)
          .attr("stroke-width", d => linkWidth(d.value));
        tooltip.style("opacity", 0);
      })
      .on("click", function (event, d) {
        renderPathNodeCards(d);
      });

    const labelNodes = buildBalancedLabelNodes(layout.nodes, 14);

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

    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height - 10)
      .attr("text-anchor", "middle")
      .attr("fill", "#94a3b8")
      .attr("font-size", 12)
      .text("Sankey 强调路径规模：线越粗，表示该主题路径出现次数越多。");
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
            路径数量：${formatNumber(d.value)}<br>
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

function prepareRecords(rows, state) {
  const records = [];

  rows.forEach(d => {
    const prizePaperId = cleanText(d.prize_paper_id);
    const citationPaperId = cleanText(d.citation_paper_id);
    const direction = cleanText(d.direction);

    if (!prizePaperId || !citationPaperId || !direction) return;

    if (state.field !== "all") {
      const prizeField = cleanText(d.prize_paper_field);
      if (!fieldMatches(prizeField, state.field)) return;
    }

    const isInput = direction === "prize_paper_references_citation_paper";
    const isOutput = direction === "citation_paper_cites_prize_paper";

    if (!isInput && !isOutput) return;

    const prizeTopic = firstMeaningful(
      splitMultiValue(d.prize_paper_subfield),
      normalizeFieldName(d.prize_paper_field),
      "Unknown Nobel Subfield"
    );

    const citationTopic = firstMeaningful(
      splitMultiValue(d.citation_paper_subfield),
      normalizeFieldName(d.citation_paper_field),
      "Unknown Citation Subfield"
    );

    records.push({
      prize_paper_id: prizePaperId,
      prize_paper_title: cleanText(d.prize_paper_title),
      prize_paper_field: cleanText(d.prize_paper_field),
      prizeTopic,
      citation_paper_id: citationPaperId,
      citation_paper_title: cleanText(d.citation_paper_title),
      citation_paper_field: cleanText(d.citation_paper_field),
      citationTopic,
      direction,
      isInput
    });
  });

  return records;
}

function prepareSankeyData(records, state) {
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

  const linkMap = new Map();

  records.forEach(d => {
    const prizeName = topPrizes.has(d.prizeTopic)
      ? d.prizeTopic
      : "其他获奖论文主题";

    let sourceName;
    let targetName;
    let sourceType;
    let targetType;

    if (d.isInput) {
      sourceName = topSources.has(d.citationTopic)
        ? d.citationTopic
        : "其他知识来源";
      targetName = prizeName;
      sourceType = "source";
      targetType = "prize";
    } else {
      sourceName = prizeName;
      targetName = topTargets.has(d.citationTopic)
        ? d.citationTopic
        : "其他后续扩散";
      sourceType = "prize";
      targetType = "target";
    }

    const sourceId = `${sourceType}|${sourceName}`;
    const targetId = `${targetType}|${targetName}`;
    const key = `${sourceId}---${targetId}`;

    if (!linkMap.has(key)) {
      linkMap.set(key, {
        key,
        sourceId,
        targetId,
        sourceName,
        targetName,
        sourceType,
        targetType,
        value: 0,
        samples: []
      });
    }

    const link = linkMap.get(key);
    link.value += 1;
    pushSample(link.samples, d, state.maxSamples);
  });

  const links = Array.from(linkMap.values())
    .filter(d => d.value > 0)
    .sort((a, b) => d3.descending(a.value, b.value));

  const nodeMap = new Map();

  links.forEach(link => {
    if (!nodeMap.has(link.sourceId)) {
      nodeMap.set(link.sourceId, {
        id: link.sourceId,
        name: link.sourceName,
        type: link.sourceType,
        value: 0,
        inValue: 0,
        outValue: 0,
        degree: 0,
        samples: []
      });
    }

    if (!nodeMap.has(link.targetId)) {
      nodeMap.set(link.targetId, {
        id: link.targetId,
        name: link.targetName,
        type: link.targetType,
        value: 0,
        inValue: 0,
        outValue: 0,
        degree: 0,
        samples: []
      });
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

  const nodes = Array.from(nodeMap.values()).map(node => {
    node.value = Math.max(node.inValue, node.outValue, 1);
    return node;
  });

  return {
    nodes,
    links,
    totalPathCount: records.length,
    sourceCount: nodes.filter(d => d.type === "source").length,
    prizeCount: nodes.filter(d => d.type === "prize").length,
    targetCount: nodes.filter(d => d.type === "target").length
  };
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
    nodes.sort((a, b) => d3.descending(a.value, b.value));
  });

  const columnMaxTotal = d3.max(Object.values(columns), nodes => {
    return d3.sum(nodes, d => d.value);
  }) || 1;

  const gap = 9;
  const valueScale = d3.scaleLinear()
    .domain([0, columnMaxTotal])
    .range([0, innerHeight - 20]);

  Object.entries(columns).forEach(([type, nodes]) => {
    const rawHeights = nodes.map(d => Math.max(10, valueScale(d.value)));
    const totalHeight = d3.sum(rawHeights) + Math.max(0, nodes.length - 1) * gap;
    const shrink = totalHeight > innerHeight ? innerHeight / totalHeight : 1;

    let y = margin.top + Math.max(0, (innerHeight - totalHeight * shrink) / 2);

    nodes.forEach((node, i) => {
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

function highlightPathNode(selected, nodes, links) {
  const neighborIds = new Set([selected.id]);

  links.each(function (link) {
    if (link.source.id === selected.id) neighborIds.add(link.target.id);
    if (link.target.id === selected.id) neighborIds.add(link.source.id);
  });

  nodes.style("opacity", d => neighborIds.has(d.id) ? 1 : 0.18);

  links.attr("stroke-opacity", d => {
    return d.source.id === selected.id || d.target.id === selected.id ? 0.9 : 0.06;
  });
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

function countBy(rows, accessor) {
  const map = new Map();

  rows.forEach(row => {
    const key = accessor(row);
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
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

  const rawRecords = [];

  rows.forEach(d => {
    const direction = cleanText(d.direction);
    const isInput = direction === "prize_paper_references_citation_paper";
    const isOutput = direction === "citation_paper_cites_prize_paper";

    if (!isInput && !isOutput) return;

    const prizeField = normalizeFieldName(d.prize_paper_field);
    const citationField = normalizeFieldName(d.citation_paper_field);

    // 仍然按诺奖论文所属大类 field 做筛选
    if (selectedField !== "all" && prizeField !== selectedField) return;

    // 这里改回只使用 subfield
    const prizeSubfield = extractPrimarySubfield(d.prize_paper_subfield);
    const citationSubfield = extractPrimarySubfield(d.citation_paper_subfield);

    if (!prizeSubfield || !citationSubfield) return;

    rawRecords.push({
      direction,
      isInput,
      isOutput,

      prize_paper_id: cleanText(d.prize_paper_id),
      prize_paper_title: cleanText(d.prize_paper_title),
      citation_paper_id: cleanText(d.citation_paper_id),
      citation_paper_title: cleanText(d.citation_paper_title),

      prizeField,
      citationField,
      prizeSubfield,
      citationSubfield
    });
  });

  // ===== 先统计每一侧的 subfield 频次 =====
  const sourceCounts = countBy(
    rawRecords.filter(d => d.isInput),
    d => d.citationSubfield
  );

  const prizeCounts = countBy(
    rawRecords,
    d => d.prizeSubfield
  );

  const targetCounts = countBy(
    rawRecords.filter(d => d.isOutput),
    d => d.citationSubfield
  );

  const topSources = topKeys(sourceCounts, topN);
const topPrizes = topKeys(prizeCounts, topN);

// 先取后续扩散原始 Top N
const rawTopTargets = topKeys(targetCounts, topN);

// 如果后续扩散 subfield 已经在左侧知识来源里出现，就不再单独放到右边
const topTargets = new Set(
  [...rawTopTargets].filter(name => !topSources.has(name))
);

  // ===== 建节点 / 边 =====
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
        colorVotes: {}
      });
    }
    return nodeMap.get(id);
  }

  function addNodeContribution(node, roleField, majorField, record) {
    node.value += 1;
    node[roleField] += 1;
    addFieldVote(node.colorVotes, majorField);
    pushSample(node.samples, record, maxSamples);
  }

  rawRecords.forEach(record => {
    const prizeBucket = bucketToTopOrOthers(record.prizeSubfield, topPrizes);
    const prizeNodeId = `prize|${prizeBucket}`;
    const prizeNode = ensureNode(prizeNodeId, prizeBucket, "prize");
    addNodeContribution(prizeNode, "prizeValue", record.prizeField, record);

    if (record.isInput) {
      const sourceBucket = bucketToTopOrOthers(record.citationSubfield, topSources);
      const sourceNodeId = `source|${sourceBucket}`;
      const sourceNode = ensureNode(sourceNodeId, sourceBucket, "source");
      addNodeContribution(sourceNode, "sourceValue", record.citationField, record);

      // 上方：诺奖核心 -> 知识来源
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
      link.value += 1;
      addFieldVote(link.colorVotes, record.prizeField);
      pushSample(link.samples, record, maxSamples);
    }

    if (record.isOutput) {
      // 先看这个后续扩散 subfield 是否已经出现在左侧知识来源 Top N 里
      const sourceSideBucket = bucketToTopOrOthers(record.citationSubfield, topSources);

      // 再看它是否应该出现在右侧后续扩散区域
      const targetSideBucket = bucketToTopOrOthers(record.citationSubfield, topTargets);

      // 规则：
      // 如果它已经在左侧知识来源里出现了，就不在右边重复建点，
      // 而是复用左侧节点，并从“诺奖核心”往左侧知识来源画下方弧线
      const overlapsWithSource = sourceSideBucket !== "Others";

      if (overlapsWithSource) {
        const sourceNodeId = `source|${sourceSideBucket}`;
        const sourceNode = ensureNode(sourceNodeId, sourceSideBucket, "source");

        // 虽然这个点显示在左边，但它同时承担“后续扩散”的统计角色
        addNodeContribution(sourceNode, "targetValue", record.citationField, record);

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
        link.value += 1;
        addFieldVote(link.colorVotes, record.citationField);
        pushSample(link.samples, record, maxSamples);

      } else {
        // 不和左侧重合的，才放到右边
        const targetNodeId = `target|${targetSideBucket}`;
        const targetNode = ensureNode(targetNodeId, targetSideBucket, "target");

        addNodeContribution(targetNode, "targetValue", record.citationField, record);

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
        link.value += 1;
        addFieldVote(link.colorVotes, record.citationField);
        pushSample(link.samples, record, maxSamples);
      }
    }
  });

  const nodes = Array.from(nodeMap.values()).map(node => {
    node.colorField = chooseDominantField(node.colorVotes);
    return node;
  });

  // 每组内排序：先按 value 降序，Others 固定放最后
  const roleOrder = { source: 0, prize: 1, target: 2 };
  nodes.sort((a, b) => {
    if (a.axisRole !== b.axisRole) {
      return d3.ascending(roleOrder[a.axisRole], roleOrder[b.axisRole]);
    }

    if (a.name === "Others" && b.name !== "Others") return 1;
    if (a.name !== "Others" && b.name === "Others") return -1;

    return d3.descending(a.value, b.value);
  });

  const allLinks = Array.from(linkMap.values())
    .map(link => {
      link.colorField = chooseDominantField(link.colorVotes);
      return link;
    })
    .filter(link => link.value > 0);

  // 为了不让线太炸，只显示每一侧最强的一部分弧线
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
    totalPathCount: rawRecords.length,

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
  const height = 760;

  const margin = {
    top: 95,
    right: 40,
    bottom: 105,
    left: 40
  };

  const axisY = height / 2 + 18;

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
    .attr("fill", "rgba(100, 116, 139, 0.55)");

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
    .text(`节点使用 subfield；每侧保留 Top ${data.topN}，其余合并为 Others；上方为前置知识来源，下方为后续扩散路径；若后续扩散与知识来源重合，则复用左侧节点。`);

    // 轴拉长一点
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

  // 三段拉开一点
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
  const maxLinkValue = d3.max(data.links, d => d.value) || 1;

  const radius = d3.scaleSqrt()
    .domain([1, maxNodeValue])
    .range([6, 17]);

  const linkWidth = d3.scaleSqrt()
    .domain([1, maxLinkValue])
    .range([1.2, 8.2]);

    data.nodes.forEach(d => {
      d.r = radius(d.value);
    });

  const tooltip = d3.select(".topic-tooltip");

  drawArcGroupTitle(svg, (margin.left + 10 + width * 0.31) / 2, axisY + 82, "知识来源 subfield");
  drawArcGroupTitle(svg, width / 2, axisY + 82, "诺奖核心 subfield");
  drawArcGroupTitle(svg, (width * 0.69 + width - margin.right - 10) / 2, axisY + 82, "后续扩散 subfield");

  svg.append("text")
    .attr("x", margin.left + 4)
    .attr("y", axisY - 220)
    .attr("fill", "#64748b")
    .attr("font-size", 12)
    .attr("font-weight", 700)
    .text("上方：诺奖核心引用前置知识");

  svg.append("text")
    .attr("x", margin.left + 4)
    .attr("y", axisY + 226)
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
    .attr("stroke", d => arcStrokeColor(d.role, d.colorField, d.arcRank || 0))
    .attr("stroke-width", d => linkWidth(d.value))
    .attr("stroke-linecap", "round")
    .attr("stroke-opacity", 0.95)
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
        .attr("stroke-width", x => x.key === d.key ? Math.max(2.6, linkWidth(x.value) + 1.2) : linkWidth(x.value));

      nodes.style("opacity", n => (n.id === d.source || n.id === d.target) ? 1 : 0.22);
      labels.style("opacity", n => (n.id === d.source || n.id === d.target) ? 1 : 0.15);

      tooltip
        .style("opacity", 1)
        .html(`
          <strong>${safeText(d.sourceName)} → ${safeText(d.targetName)}</strong><br>
          类型：${safeText(arcRoleLabel(d.role))}<br>
          路径数量：${formatNumber(d.value)}<br>
          说明：${safeText(arcDirectionExplain(d.role))}
        `);
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", function () {
      links
        .attr("stroke-opacity", 0.86)
        .attr("stroke-width", d => linkWidth(d.value));

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
          ? Math.max(2.3, linkWidth(link.value) + 1.1)
          : linkWidth(link.value));

      nodes.style("opacity", n => n.id === d.id ? 1 : 0.24);
      labels.style("opacity", n => n.id === d.id ? 1 : 0.18);

      tooltip
        .style("opacity", 1)
        .html(`
          <strong>${safeText(d.name)}</strong><br>
          角色：${safeText(arcNodeRoleLabel(d.axisRole))}<br>
          相关路径：${formatNumber(d.value)}<br>
          作为知识来源：${formatNumber(d.sourceValue)}<br>
          作为诺奖核心：${formatNumber(d.prizeValue)}<br>
          作为后续扩散：${formatNumber(d.targetValue)}<br>
          主颜色归属：${safeText(d.colorField || "Unknown")}
        `);
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", function () {
      links
        .attr("stroke-opacity", 0.86)
        .attr("stroke-width", d => linkWidth(d.value));

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
    .text(d => d.name === "Others" ? "Others" : shortenText(d.name, 12));

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height - 18)
    .attr("text-anchor", "middle")
    .attr("fill", "#94a3b8")
    .attr("font-size", 11)
    .text("每侧仅保留 Top N subfield，其余合并为 Others；点击节点或弧线可查看代表论文。");

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
    .text(text);
}

function extractPrimarySubfield(value) {
  const items = splitMultiValue(value).map(d => cleanText(d)).filter(Boolean);
  return items.length ? items[0] : cleanText(value);
}

function bucketToTopOrOthers(name, topSet) {
  return topSet.has(name) ? name : "Others";
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
      .filter(d => d.name !== "Others")
      .slice(0, normalCount);

    normal.forEach(d => set.add(d.id));

    const others = nodes.find(d => d.name === "Others");
    if (others) set.add(others.id);
  }

  addGroup(sourceNodes, 4);
  addGroup(prizeNodes, 4);
  addGroup(targetNodes, 4);

  return set;
}

function nodeFieldColor(field, alpha = 0.88) {
  if (field === "Physics") {
    return `rgba(96, 124, 191, ${alpha})`;      // 雾蓝
  }
  if (field === "Chemistry") {
    return `rgba(79, 164, 138, ${alpha})`;      // 青绿
  }
  if (field === "Medicine") {
    return `rgba(216, 120, 110, ${alpha})`;     // 暖珊瑚红
  }
  return `rgba(163, 172, 184, ${alpha})`;       // Unknown / Others 灰色
}

function arcStrokeColor(role, colorField, rank = 0) {
  // unknown 仍然保留灰色
  if (!colorField || colorField === "Other" || colorField === "Unknown") {
    const alpha = Math.max(0.22, 0.42 - rank * 0.012);
    return `rgba(170, 178, 188, ${alpha})`;
  }

  // 上方：诺奖引用前置知识 —— 冷色系
  if (role === "nobel_references_source") {
    const alpha = Math.max(0.16, 0.38 - rank * 0.010);
    return `rgba(122, 156, 196, ${alpha})`;   // 冷蓝灰
  }

  // 下方：后续研究引用诺奖核心 —— 暖色系
  const alpha = Math.max(0.18, 0.42 - rank * 0.010);
  return `rgba(196, 139, 153, ${alpha})`;     // 柔和粉棕 / 豆沙色
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
