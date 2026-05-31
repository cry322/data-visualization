import { loadCSV } from "../utils/dataLoader.js";

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "their", "these", "those",
  "are", "was", "were", "been", "have", "has", "had", "not", "but", "its", "into",
  "over", "between", "through", "during", "which", "where", "when", "while", "also",
  "using", "based", "study", "studies", "system", "systems", "analysis", "effect",
  "effects", "method", "methods", "paper", "approach", "quality", "properties",
  "living", "induced", "cause", "relative"
]);

const ROW_HEIGHT = 34;
const ROW_PADDING = 0.15;

function normalizeTitle(title = "") {
  return title
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractKeywords(title) {
  return normalizeTitle(title)
    .split(" ")
    .filter(token =>
      token.length >= 3 &&
      !STOPWORDS.has(token) &&
      !/^\d+$/.test(token)
    );
}

function buildYearKeywordMatrix(rows) {
  const counts = new Map();
  const totals = new Map();

  rows.forEach(row => {
    const year = Math.round(Number(row.openalex_publication_year));

    if (!year || year < 1910 || year > 1966) return;

    const terms = extractKeywords(row.openalex_title || "");

    if (!terms.length) return;

    let yearMap = counts.get(year);

    if (!yearMap) {
      yearMap = new Map();
      counts.set(year, yearMap);
    }

    terms.forEach(term => {
      yearMap.set(term, (yearMap.get(term) || 0) + 1);
      totals.set(term, (totals.get(term) || 0) + 1);
    });
  });

  const topTerms = Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([term]) => term);

  // 修复：包含1966
  const years = d3.range(1910, 1967);

  const data = [];

  topTerms.forEach(term => {
    years.forEach(year => {
      const yearMap = counts.get(year);

      data.push({
        term,
        year,
        value: yearMap ? (yearMap.get(term) || 0) : 0
      });
    });
  });

  return {
    years,
    topTerms,
    data,
    totals
  };
}

function createTooltip(container) {
  return container
    .append("div")
    .attr("class", "keyword-tooltip")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("padding", "10px")
    .style("background", "rgba(212, 79, 18, 0.92)")
    .style("color", "white")
    .style("border-radius", "8px")
    .style("font-size", "13px")
    .style("opacity", 0);
}

export async function initSpecialAuthorsModule() {

  const chartTarget = d3.select("#special-keyword-chart");

  chartTarget.selectAll("*").remove();

  const rawData = await loadCSV("data/longest_wait_time_record.csv");

  if (!rawData.length) {
    chartTarget
      .append("div")
      .attr("class", "placeholder")
      .text("无法加载关键词数据。");

    return;
  }

  const filtered = rawData.filter(row => {
    const year = Math.round(Number(row.openalex_publication_year));

    return (
      year >= 1910 &&
      year <= 1966 &&
      row.openalex_title
    );
  });

  const {
    years,
    topTerms,
    data,
    totals
  } = buildYearKeywordMatrix(filtered);

  // ===== 尺寸配置 =====

  const margin = {
    top: 5,
    right: 20,
    bottom: 100,
    left: 180
  };

  const heatmapWidth = 500;
  const barChartWidth = 200;
  const gap = 25;

  const totalHeight = topTerms.length * ROW_HEIGHT;

  const totalWidth =
    margin.left +
    heatmapWidth +
    gap +
    barChartWidth +
    margin.right;

  const svgHeight =
    totalHeight +
    margin.top +
    margin.bottom +
    60;

  // ===== 创建 SVG =====

  const svg = chartTarget
    .append("svg")
    .attr("width", totalWidth)
    .attr("height", svgHeight);

  // ===== 主区域 =====

  const heatmapGroup = svg.append("g")
    .attr(
      "transform",
      `translate(${margin.left},${margin.top})`
    );

  const barGroup = svg.append("g")
    .attr(
      "transform",
      `translate(${margin.left + heatmapWidth + gap},${margin.top})`
    );

  // ===== Scale =====

  const xScale = d3.scaleBand()
    .domain(years)
    .range([0, heatmapWidth])
    .padding(0.05);

  const yScale = d3.scaleBand()
    .domain(topTerms)
    .range([0, totalHeight])
    .padding(ROW_PADDING);

  const bandHeight = yScale.bandwidth();

  const maxValue = d3.max(data, d => d.value) || 1;

  const colorScale = d3.scaleSequential(d3.interpolateOrRd)
    .domain([0, maxValue]);

  // ===== Tooltip =====

  const tooltip = createTooltip(d3.select("body"));

  // ===== 热力图 =====

  heatmapGroup.selectAll(".cell")
    .data(data)
    .join("rect")
    .attr("class", "cell")
    .attr("x", d => xScale(d.year))
    .attr("y", d => yScale(d.term))
    .attr("width", xScale.bandwidth())
    .attr("height", bandHeight)
    .attr("rx", 4)
    .attr("fill", d =>
      d.value ? colorScale(d.value) : "#f1f5f9"
    )
    .attr("stroke", "#e2e8f0")
    .on("mousemove", (event, d) => {

      tooltip
        .style("opacity", 1)
        .html(`
          <strong>年份：</strong>${d.year}<br/>
          <strong>关键词：</strong>${d.term}<br/>
          <strong>出现次数：</strong>${d.value}
        `)
        .style("left", `${event.pageX + 12}px`)
        .style("top", `${event.pageY + 12}px`);
    })
    .on("mouseout", () => {
      tooltip.style("opacity", 0);
    });

  // ===== X轴 =====

  heatmapGroup.append("g")
    .attr(
      "transform",
      `translate(0,${totalHeight})`
    )
    .call(
      d3.axisBottom(xScale)
        .tickValues(
          years.filter(y => y % 5 === 0)
        )
    )
    .selectAll("text")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end")
    .style("font-size", "12px");

  // ===== Y轴 =====

  heatmapGroup.append("g")
    .call(
      d3.axisLeft(yScale)
        .tickSize(0)
    )
    .selectAll("text")
    .style("font-size", "13px");

  // ===== 条形图 =====

  const barData = topTerms.map(term => ({
    term,
    value: totals.get(term) || 0
  }));

  const barScale = d3.scaleLinear()
    .domain([0, d3.max(barData, d => d.value)])
    .range([0, barChartWidth]);

  const barColorScale = d3.scaleLinear()

    .domain([0, d3.max(barData, d => d.value)])
    .range(["#edcda3", "#ac2e04"]);

  barGroup.selectAll("rect")
    .data(barData)
    .join("rect")
    .attr("x", 0)
    .attr("y", d => yScale(d.term))
    .attr("width", d => barScale(d.value))
    .attr("height", bandHeight)
    .attr("rx", 6)
    .attr("fill", d => barColorScale(d.value));

  // ===== 数值 =====

  barGroup.selectAll(".value")
    .data(barData)
    .join("text")
    .attr("class", "value")
    .attr("x", d => barScale(d.value) + 8)
    .attr("y", d => yScale(d.term) + bandHeight / 2 + 4)
    .text(d => d.value)
    .style("font-size", "12px")
    .style("fill", "#943414");

  // ===== 图例 =====

  const legendWidth = 180;
  const legendHeight = 10;

  const defs = svg.append("defs");

  const gradient = defs.append("linearGradient")
    .attr("id", "keyword-gradient");

  gradient.append("stop")
    .attr("offset", "0%")
    .attr("stop-color", colorScale(0));

  gradient.append("stop")
    .attr("offset", "100%")
    .attr("stop-color", colorScale(maxValue));

  const legend = svg.append("g")
    .attr(
      "transform",
      `translate(${margin.left + heatmapWidth + 30},${svgHeight - 100})`
    );

  legend.append("rect")
    .attr("width", legendWidth)
    .attr("height", legendHeight)
    .style("fill", "url(#keyword-gradient)");

  legend.append("text")
    .attr("x", 0)
    .attr("y", -8)
    .text("关键词出现热度/频率")
    .style("font-size", "12px");

}