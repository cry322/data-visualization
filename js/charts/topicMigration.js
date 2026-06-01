// js/charts/topicMigration.js

export async function initTopicMigration() {
  const container = d3.select("#topic-migration-chart");
  if (container.empty()) return;

  const DATA_PATH = "data/";
  const DATA_FILE = "nobel_prize_paper_to_citation_paper_field_paths.csv";

  const fieldSelect = d3.select("#topic-field-filter");
  const viewSelect = d3.select("#topic-view-select");
  const arcTopNSelect = d3.select("#topic-arc-topn-select");
  const caseCards = d3.select("#topic-case-cards");

  const state = {
    field: fieldSelect.empty() ? "all" : normalizeSelectedField(fieldSelect.property("value")),
    view: viewSelect.empty() ? "sankey" : normalizeView(viewSelect.property("value")),

    // 只作用于“引用路径弧线图”，不影响 Sankey
    arcTopN: arcTopNSelect.empty() ? 15 : Number(arcTopNSelect.property("value")),

    // Sankey 仍然用原来的参数
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
        render();
      });
    }

    // 只控制引用路径弧线图，不影响 Sankey 的数据处理
    if (!arcTopNSelect.empty()) {
      arcTopNSelect.on("change", function () {
        state.arcTopN = Number(this.value) || 15;
        render();
      });
    }
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
    // 按 domain 上色：优先使用数据中 link.domain（已在 prepareSankeyData 中计算）
    const domains = Array.from(new Set((data.links || []).map(d => d.domain))).sort();
    const palette = d3.schemeCategory10 || ["#1f77b4","#ff7f0e","#2ca02c","#d62728","#9467bd","#8c564b","#e377c2","#7f7f7f","#bcbd22","#17becf"];
    const colorByDomain = d3.scaleOrdinal().domain(domains).range(palette);

    const linkWidth = d3.scaleSqrt()
      .domain([1, d3.max(layout.links, d => d.value) || 1])
      .range([1.4, 26]);

    const links = svg.append("g")
      .selectAll("path")
      .data(layout.links, d => d.key)
      .join("path")
      .attr("fill", "none")
      .attr("stroke", d => colorByDomain(d.domain) || (d.source.type === "source" ? "#7aa6c2" : "#d9a66a"))
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
            领域：${safeText(d.domain || 'Unknown')}<br>
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

    // 在右侧绘制域（domain）颜色图例
    if (domains && domains.length) {
      const legendX = width - margin.right + 16;
      const legendY = 72;
      const maxItems = 12; // 最多显示前若干个域，防止溢出
      const legend = svg.append("g").attr("class", "domain-legend").attr("transform", `translate(${legendX}, ${legendY})`);

      legend.append("text")
        .attr("x", 0)
        .attr("y", -12)
        .attr("fill", "#475569")
        .attr("font-size", 12)
        .attr("font-weight", 700)
        .text("领域 (Domain)");

      domains.slice(0, maxItems).forEach((dom, i) => {
        const y = i * 20;
        legend.append("rect")
          .attr("x", 0)
          .attr("y", y - 10)
          .attr("width", 12)
          .attr("height", 12)
          .attr("rx", 2)
          .attr("fill", colorByDomain(dom));

        legend.append("text")
          .attr("x", 18)
          .attr("y", y)
          .attr("fill", "#334155")
          .attr("font-size", 11)
          .attr("font-weight", 600)
          .attr("dominant-baseline", "middle")
          .text(shortenText(dom, 26));
      });

      if (domains.length > maxItems) {
        legend.append("text")
          .attr("x", 0)
          .attr("y", maxItems * 20)
          .attr("fill", "#94a3b8")
          .attr("font-size", 11)
          .text(`共 ${domains.length} 个领域，显示前 ${maxItems} 项`);
      }
    }

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
      prize_paper_domain: cleanText(d.prize_paper_domain),
      citation_paper_id: citationPaperId,
      citation_paper_title: cleanText(d.citation_paper_title),
      citation_paper_field: cleanText(d.citation_paper_field),
      citation_paper_domain: cleanText(d.citation_paper_domain),
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

  // 为每条链接推断一个主域(domain)，用于按域着色（优先使用 citation_paper_domain / prize_paper_domain）
  links.forEach(link => {
    const counts = new Map();
    (link.samples || []).forEach(s => {
      const k = cleanText(s.citation_paper_domain) || cleanText(s.prize_paper_domain) || "Unknown";
      if (!k) return;
      counts.set(k, (counts.get(k) || 0) + 1);
    });

    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    link.domain = sorted.length ? sorted[0][0] : "Unknown";
  });

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

function prepareCitationArcData(rows, state) {
  const selectedField = normalizeSelectedField(state.field);
  const topN = state.arcTopN || 15;

  const records = [];

  rows.forEach(d => {
    const direction = cleanText(d.direction);
    const isInput = direction === "prize_paper_references_citation_paper";
    const isOutput = direction === "citation_paper_cites_prize_paper";

    if (!isInput && !isOutput) return;

    const prizeTopic = firstMeaningful(
      splitMultiValue(d.prize_paper_subfield),
      normalizeFieldName(d.prize_paper_field),
      "Unknown Nobel Core"
    );

    const citationTopic = firstMeaningful(
      splitMultiValue(d.citation_paper_subfield),
      normalizeFieldName(d.citation_paper_field),
      "Unknown Citation Field"
    );

    if (!prizeTopic || !citationTopic) return;

    const prizeMajorField = inferRecordMajorField(
      d.prize_paper_field,
      d.prize_paper_subfield
    );

    const citationMajorField = inferRecordMajorField(
      d.citation_paper_field,
      d.citation_paper_subfield
    );

    // 学科筛选只根据诺奖论文自身所属领域过滤；选择 all 时不过滤
    if (selectedField !== "all") {
      const matched =
        prizeMajorField === selectedField ||
        fieldMatches(d.prize_paper_field, selectedField) ||
        fieldMatches(d.prize_paper_subfield, selectedField);

      if (!matched) return;
    }

    records.push({
      prize_paper_id: cleanText(d.prize_paper_id),
      prize_paper_title: cleanText(d.prize_paper_title),
      citation_paper_id: cleanText(d.citation_paper_id),
      citation_paper_title: cleanText(d.citation_paper_title),

      prizeTopic,
      citationTopic,
      prizeMajorField,
      citationMajorField,

      direction,
      isInput,
      isOutput
    });
  });

  const sourceCounts = countBy(
    records.filter(d => d.isInput),
    d => d.citationTopic
  );

  const prizeCounts = countBy(
    records,
    d => d.prizeTopic
  );

  const targetCounts = countBy(
    records.filter(d => d.isOutput),
    d => d.citationTopic
  );

  const topSources = topKeys(sourceCounts, topN);
  const topPrizes = topKeys(prizeCounts, topN);
  const topTargetsRaw = topKeys(targetCounts, topN);

  // 后续扩散如果已经出现在知识来源 Top N 中，则不再放到右侧重复出现
  const topTargets = new Set(
    Array.from(topTargetsRaw).filter(name => !topSources.has(name))
  );

  const nodeMap = new Map();
  const linkMap = new Map();

  function ensureNode(id, name, axisRole, colorField) {
    if (!nodeMap.has(id)) {
      nodeMap.set(id, {
        id,
        name,
        axisRole,
        colorField,
        value: 0,
        sourceValue: 0,
        prizeValue: 0,
        targetValue: 0,
        samples: []
      });
    }

    return nodeMap.get(id);
  }

  function addNodeSample(node, record) {
    node.value += 1;
    pushSample(node.samples, record, state.maxSamples);
  }

  records.forEach(record => {
    const prizeName = topPrizes.has(record.prizeTopic)
      ? record.prizeTopic
      : "其他诺奖核心";

    const prizeNodeId = `prize|${prizeName}`;

    const prizeNode = ensureNode(
      prizeNodeId,
      prizeName,
      "prize",
      selectedField === "all" ? record.prizeMajorField : selectedField
    );

    prizeNode.prizeValue += 1;
    addNodeSample(prizeNode, record);

    if (record.isInput) {
      const sourceName = topSources.has(record.citationTopic)
        ? record.citationTopic
        : "其他知识来源";

      const sourceNodeId = `source|${sourceName}`;

      const sourceNode = ensureNode(
        sourceNodeId,
        sourceName,
        "source",
        record.citationMajorField
      );

      sourceNode.sourceValue += 1;
      addNodeSample(sourceNode, record);

      // 上方弧线：诺奖核心 → 知识来源
      const key = `upper|${prizeNodeId}---${sourceNodeId}`;

      if (!linkMap.has(key)) {
        linkMap.set(key, {
          key,
          source: prizeNodeId,
          target: sourceNodeId,
          sourceName: prizeName,
          targetName: sourceName,
          role: "nobel_references_source",
          value: 0,
          samples: []
        });
      }

      const link = linkMap.get(key);
      link.value += 1;
      pushSample(link.samples, record, state.maxSamples);
    }

    if (record.isOutput) {
      let targetName;
      let targetNodeId;
      let targetAxisRole;

      if (topSources.has(record.citationTopic)) {
        // 后续扩散 field 与知识来源重叠：复用左侧知识来源节点
        targetName = record.citationTopic;
        targetNodeId = `source|${targetName}`;
        targetAxisRole = "source";
      } else {
        targetName = topTargets.has(record.citationTopic)
          ? record.citationTopic
          : "其他后续扩散";

        targetNodeId = `target|${targetName}`;
        targetAxisRole = "target";
      }

      const targetNode = ensureNode(
        targetNodeId,
        targetName,
        targetAxisRole,
        record.citationMajorField
      );

      targetNode.targetValue += 1;
      addNodeSample(targetNode, record);

      // 下方弧线：后续扩散 → 诺奖核心
      const key = `lower|${targetNodeId}---${prizeNodeId}`;

      if (!linkMap.has(key)) {
        linkMap.set(key, {
          key,
          source: targetNodeId,
          target: prizeNodeId,
          sourceName: targetName,
          targetName: prizeName,
          role: "future_cites_nobel",
          value: 0,
          samples: []
        });
      }

      const link = linkMap.get(key);
      link.value += 1;
      pushSample(link.samples, record, state.maxSamples);
    }
  });

  const nodes = Array.from(nodeMap.values())
    .sort((a, b) => {
      const roleOrder = {
        source: 0,
        prize: 1,
        target: 2
      };

      return d3.ascending(roleOrder[a.axisRole], roleOrder[b.axisRole]) ||
        d3.descending(a.value, b.value);
    });

  const links = Array.from(linkMap.values())
    .filter(d => d.value > 0)
    .sort((a, b) => d3.descending(a.value, b.value));

  return {
    selectedField,
    topN,
    nodes,
    links,
    totalPathCount: records.length,
    sourceCount: nodes.filter(d => d.axisRole === "source").length,
    prizeCount: nodes.filter(d => d.axisRole === "prize").length,
    targetCount: nodes.filter(d => d.axisRole === "target").length
  };
}

function drawCitationArcDiagram(data) {
  const container = d3.select("#topic-migration-chart");
  const node = container.node();
  const width = node.clientWidth || 980;
  const height = 650;

  const margin = {
    top: 90,
    right: 80,
    bottom: 110,
    left: 80
  };

  const axisY = height / 2;

  const svg = container
    .append("svg")
    .attr("width", "100%")
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const defs = svg.append("defs");

  defs.append("marker")
    .attr("id", "arc-arrow")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 9)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "rgba(100, 116, 139, 0.78)");

  const title = data.selectedField === "all"
    ? "全部学科引用路径弧线图"
    : `${data.selectedField} 引用路径弧线图`;

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", 30)
    .attr("text-anchor", "middle")
    .attr("fill", "#0f172a")
    .attr("font-size", 15)
    .attr("font-weight", 800)
    .text(title);

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", 53)
    .attr("text-anchor", "middle")
    .attr("fill", "#64748b")
    .attr("font-size", 12)
    .text(`每组展示 Top ${data.topN}：知识来源、诺奖核心、后续扩散。上方为诺奖引用，下方为诺奖被引。`);

  svg.append("line")
    .attr("x1", margin.left)
    .attr("x2", width - margin.right)
    .attr("y1", axisY)
    .attr("y2", axisY)
    .attr("stroke", "#cbd5e1")
    .attr("stroke-width", 1.4);

  const sourceNodes = data.nodes.filter(d => d.axisRole === "source");
  const prizeNodes = data.nodes.filter(d => d.axisRole === "prize");
  const targetNodes = data.nodes.filter(d => d.axisRole === "target");

  assignArcNodePositions(sourceNodes, margin.left, width * 0.34, axisY);
  assignArcNodePositions(prizeNodes, width * 0.40, width * 0.60, axisY);
  assignArcNodePositions(targetNodes, width * 0.66, width - margin.right, axisY);

  const nodeById = new Map(data.nodes.map(d => [d.id, d]));

  const maxNodeValue = d3.max(data.nodes, d => d.value) || 1;
  const maxLinkValue = d3.max(data.links, d => d.value) || 1;

  const radius = d3.scaleSqrt()
    .domain([1, maxNodeValue])
    .range([7, 23]);

  const linkWidth = d3.scaleSqrt()
    .domain([1, maxLinkValue])
    .range([1.3, 8]);

  data.nodes.forEach(d => {
    d.r = radius(d.value);
  });

  const upperLinks = data.links
    .filter(d => d.role === "nobel_references_source")
    .sort((a, b) => d3.descending(a.value, b.value));

  const lowerLinks = data.links
    .filter(d => d.role === "future_cites_nobel")
    .sort((a, b) => d3.descending(a.value, b.value));

  upperLinks.forEach((d, i) => {
    d.arcRank = i;
  });

  lowerLinks.forEach((d, i) => {
    d.arcRank = i;
  });

  const tooltip = d3.select(".topic-tooltip").empty()
    ? d3.select("body")
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
        .style("opacity", 0)
    : d3.select(".topic-tooltip");

  svg.append("text")
    .attr("x", (margin.left + width * 0.34) / 2)
    .attr("y", axisY + 78)
    .attr("text-anchor", "middle")
    .attr("fill", "#64748b")
    .attr("font-size", 12)
    .attr("font-weight", 800)
    .text("知识来源");

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", axisY + 78)
    .attr("text-anchor", "middle")
    .attr("fill", "#64748b")
    .attr("font-size", 12)
    .attr("font-weight", 800)
    .text("诺奖核心");

  svg.append("text")
    .attr("x", (width * 0.66 + width - margin.right) / 2)
    .attr("y", axisY + 78)
    .attr("text-anchor", "middle")
    .attr("fill", "#64748b")
    .attr("font-size", 12)
    .attr("font-weight", 800)
    .text("后续扩散");

  const linkLayer = svg.append("g");
  const nodeLayer = svg.append("g");
  const labelLayer = svg.append("g");

  const links = linkLayer
    .selectAll("path")
    .data(data.links, d => d.key)
    .join("path")
    .attr("fill", "none")
    .attr("stroke", d => {
      const source = nodeById.get(d.source);
      return topicFieldColor(
        source?.colorField || data.selectedField,
        d.role === "nobel_references_source" ? 0.44 : 0.60
      );
    })
    .attr("stroke-width", d => linkWidth(d.value))
    .attr("stroke-linecap", "round")
    .attr("marker-end", "url(#arc-arrow)")
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
      d3.select(this)
        .attr("stroke-width", Math.max(2.5, linkWidth(d.value) + 1.6));

      tooltip
        .style("opacity", 1)
        .html(`
          <strong>${safeText(d.sourceName)} → ${safeText(d.targetName)}</strong><br>
          类型：${safeText(arcRoleLabel(d.role))}<br>
          路径数量：${formatNumber(d.value)}<br>
          方向解释：${safeText(arcDirectionExplain(d.role))}
        `);
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", function (event, d) {
      d3.select(this)
        .attr("stroke-width", linkWidth(d.value));

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
      tooltip
        .style("opacity", 1)
        .html(`
          <strong>${safeText(d.name)}</strong><br>
          轴上位置：${safeText(arcNodeRoleLabel(d.axisRole))}<br>
          相关路径：${formatNumber(d.value)}<br>
          作为知识来源：${formatNumber(d.sourceValue)}<br>
          作为诺奖核心：${formatNumber(d.prizeValue)}<br>
          作为后续扩散：${formatNumber(d.targetValue)}
        `);
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", function () {
      tooltip.style("opacity", 0);
    })
    .on("click", function (event, d) {
      renderArcNodeCards(d);
    });

  nodes.append("circle")
    .attr("r", d => radius(d.value))
    .attr("fill", d => topicFieldColor(d.colorField || data.selectedField, 0.72))
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 1.5);

  nodes.append("circle")
    .attr("r", d => Math.max(3, radius(d.value) * 0.38))
    .attr("fill", "rgba(255,255,255,0.38)")
    .attr("pointer-events", "none");

  labelLayer
    .selectAll("text.field-label")
    .data(data.nodes, d => d.id)
    .join("text")
    .attr("class", "field-label")
    .attr("x", d => d.x)
    .attr("y", d => axisY + 42)
    .attr("text-anchor", "middle")
    .attr("fill", "#334155")
    .attr("font-size", 11)
    .attr("font-weight", 800)
    .attr("paint-order", "stroke")
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 3)
    .text(d => shortenText(d.name, 22));

  svg.append("text")
    .attr("x", margin.left)
    .attr("y", axisY - 230)
    .attr("fill", "#64748b")
    .attr("font-size", 12)
    .attr("font-weight", 700)
    .text("上方：诺奖核心引用前置知识");

  svg.append("text")
    .attr("x", margin.left)
    .attr("y", axisY + 235)
    .attr("fill", "#64748b")
    .attr("font-size", 12)
    .attr("font-weight", 700)
    .text("下方：后续研究引用诺奖核心");
}

function assignArcNodePositions(nodes, startX, endX, axisY) {
  const scale = d3.scalePoint()
    .domain(nodes.map(d => d.id))
    .range([startX, endX])
    .padding(0.5);

  nodes.forEach(d => {
    d.x = scale(d.id) || (startX + endX) / 2;
    d.y = axisY;
  });
}

function citationArcPath({ sourceX, targetX, axisY, role, rank }) {
  const distance = Math.abs(targetX - sourceX);
  const baseHeight = Math.max(60, distance * 0.35);
  const extraHeight = Math.min(120, rank * 18);
  const arcHeight = baseHeight + extraHeight;

  const sign = role === "nobel_references_source" ? -1 : 1;
  const midX = (sourceX + targetX) / 2;
  const controlY = axisY + sign * arcHeight;

  if (Math.abs(sourceX - targetX) < 2) {
    const loopWidth = 42;
    return `
      M${sourceX - loopWidth / 2},${axisY}
      Q${sourceX},${axisY + sign * 86}
      ${sourceX + loopWidth / 2},${axisY}
    `;
  }

  return `M${sourceX},${axisY} Q${midX},${controlY} ${targetX},${axisY}`;
}

function renderArcDefaultCards(data) {
  const caseCards = d3.select("#topic-case-cards");
  if (caseCards.empty()) return;

  const topUpper = data.links
    .filter(d => d.role === "nobel_references_source")
    .sort((a, b) => d3.descending(a.value, b.value))[0];

  const topLower = data.links
    .filter(d => d.role === "future_cites_nobel")
    .sort((a, b) => d3.descending(a.value, b.value))[0];

  caseCards.html(`
    <div class="card mini-card">
      <div class="topic-badge">读图方式</div>
      <div class="topic-card-title">横轴 + 上下弧线</div>
      <div class="topic-card-note">
        横轴分为知识来源、诺奖核心、后续扩散三段。上方弧线表示诺奖论文引用前置知识，下方弧线表示后续论文引用诺奖论文。
      </div>
    </div>

    <div class="card mini-card">
      <div class="topic-badge">上方最强路径</div>
      <div class="topic-card-title">
        ${
          topUpper
            ? `${safeText(topUpper.sourceName)} → ${safeText(topUpper.targetName)}`
            : "暂无"
        }
      </div>
      <div class="topic-card-note">
        ${
          topUpper
            ? `该路径共 ${formatNumber(topUpper.value)} 条。`
            : "当前筛选条件下暂无上方路径。"
        }
      </div>
    </div>

    <div class="card mini-card">
      <div class="topic-badge">下方最强路径</div>
      <div class="topic-card-title">
        ${
          topLower
            ? `${safeText(topLower.sourceName)} → ${safeText(topLower.targetName)}`
            : "暂无"
        }
      </div>
      <div class="topic-card-note">
        ${
          topLower
            ? `该路径共 ${formatNumber(topLower.value)} 条。`
            : "当前筛选条件下暂无下方路径。"
        }
      </div>
    </div>
  `);
}

function renderArcNodeCards(node) {
  const caseCards = d3.select("#topic-case-cards");
  if (caseCards.empty()) return;

  const prizePapers = uniqueBy(node.samples || [], d => d.prize_paper_id).slice(0, 5);
  const citationPapers = uniqueBy(node.samples || [], d => d.citation_paper_id).slice(0, 5);

  caseCards.html(`
    <div class="card mini-card">
      <div class="topic-badge">${arcNodeRoleLabel(node.axisRole)}</div>
      <div class="topic-card-title">${safeText(node.name)}</div>
      <div class="topic-card-note">
        相关路径：${formatNumber(node.value)}；
        作为知识来源：${formatNumber(node.sourceValue)}；
        作为诺奖核心：${formatNumber(node.prizeValue)}；
        作为后续扩散：${formatNumber(node.targetValue)}。
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

function renderArcLinkCards(link) {
  const caseCards = d3.select("#topic-case-cards");
  if (caseCards.empty()) return;

  const prizePapers = uniqueBy(link.samples || [], d => d.prize_paper_id).slice(0, 5);
  const citationPapers = uniqueBy(link.samples || [], d => d.citation_paper_id).slice(0, 5);

  caseCards.html(`
    <div class="card mini-card">
      <div class="topic-badge">${arcRoleLabel(link.role)}</div>
      <div class="topic-card-title">${safeText(link.sourceName)} → ${safeText(link.targetName)}</div>
      <div class="topic-card-note">
        该路径共 ${formatNumber(link.value)} 条。${safeText(arcDirectionExplain(link.role))}
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

function inferRecordMajorField(fieldValue, subfieldValue) {
  const field = normalizeFieldName(fieldValue);
  if (["Physics", "Chemistry", "Medicine"].includes(field)) return field;

  const subfield = normalizeFieldName(subfieldValue);
  if (["Physics", "Chemistry", "Medicine"].includes(subfield)) return subfield;

  return "Unknown";
}

function normalizeSelectedField(value) {
  const text = cleanText(value);

  if (text === "all" || text === "全部学科") return "all";

  const field = normalizeFieldName(text);

  if (["Physics", "Chemistry", "Medicine"].includes(field)) {
    return field;
  }

  return "all";
}

function topicFieldColor(field, alpha = 0.72) {
  if (field === "Physics") return `rgba(37, 99, 235, ${alpha})`;
  if (field === "Chemistry") return `rgba(5, 150, 105, ${alpha})`;
  if (field === "Medicine") return `rgba(220, 38, 38, ${alpha})`;
  return `rgba(148, 163, 184, ${alpha})`;
}

function arcRoleLabel(role) {
  if (role === "nobel_references_source") return "上方弧线：诺奖引用前置知识";
  if (role === "future_cites_nobel") return "下方弧线：后续引用诺奖论文";
  return "引用路径";
}

function arcDirectionExplain(role) {
  if (role === "nobel_references_source") {
    return "方向为诺奖核心指向知识来源，表示诺奖论文参考了该领域的前置知识。";
  }

  if (role === "future_cites_nobel") {
    return "方向为后续扩散指向诺奖核心，表示该领域后续论文引用了诺奖论文。";
  }

  return "";
}

function arcNodeRoleLabel(role) {
  if (role === "source") return "知识来源";
  if (role === "prize") return "诺奖核心";
  if (role === "target") return "后续扩散";
  return "field";
}
