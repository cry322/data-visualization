function drawTimeline(data) {
  const container = d3.select("#timeline-chart");
  container.selectAll("*").remove();

  const margin = { top: 40, right: 40, bottom: 60, left: 90 };
  const width = container.node().clientWidth - margin.left - margin.right;
  const height = 420 - margin.top - margin.bottom;

  const svg = container
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom);

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3
    .scaleLinear()
    .domain(d3.extent(data.flatMap(d => [d.pubYear, d.prizeYear])))
    .nice()
    .range([0, width]);

  const y = d3
    .scaleBand()
    .domain(data.map(d => d.laureate))
    .range([0, height])
    .padding(0.45);

  g.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")));

  g.append("g")
    .call(d3.axisLeft(y));

  const tooltip = d3
    .select("body")
    .selectAll(".tooltip")
    .data([null])
    .join("div")
    .attr("class", "tooltip");

  g.selectAll(".wait-line")
    .data(data)
    .join("line")
    .attr("class", "wait-line")
    .attr("x1", d => x(d.pubYear))
    .attr("x2", d => x(d.prizeYear))
    .attr("y1", d => y(d.laureate) + y.bandwidth() / 2)
    .attr("y2", d => y(d.laureate) + y.bandwidth() / 2)
    .attr("stroke", "#9ca3af")
    .attr("stroke-width", 2);

  g.selectAll(".pub-point")
    .data(data)
    .join("circle")
    .attr("class", "pub-point")
    .attr("cx", d => x(d.pubYear))
    .attr("cy", d => y(d.laureate) + y.bandwidth() / 2)
    .attr("r", 6)
    .attr("fill", "#3b82f6")
    .on("mousemove", (event, d) => {
      tooltip
        .style("opacity", 1)
        .style("left", event.pageX + 12 + "px")
        .style("top", event.pageY + 12 + "px")
        .html(`
          <strong>${d.laureate}</strong><br/>
          论文：${d.title}<br/>
          发表年份：${d.pubYear}<br/>
          获奖年份：${d.prizeYear}<br/>
          等待时间：${d.waitTime} 年
        `);
    })
    .on("mouseleave", () => {
      tooltip.style("opacity", 0);
    });

  g.selectAll(".prize-point")
    .data(data)
    .join("circle")
    .attr("class", "prize-point")
    .attr("cx", d => x(d.prizeYear))
    .attr("cy", d => y(d.laureate) + y.bandwidth() / 2)
    .attr("r", 7)
    .attr("fill", "#f59e0b")
    .on("mousemove", (event, d) => {
      tooltip
        .style("opacity", 1)
        .style("left", event.pageX + 12 + "px")
        .style("top", event.pageY + 12 + "px")
        .html(`
          <strong>${d.laureate}</strong><br/>
          学科：${d.field}<br/>
          获奖年份：${d.prizeYear}<br/>
          等待时间：${d.waitTime} 年
        `);
    })
    .on("mouseleave", () => {
      tooltip.style("opacity", 0);
    });

  g.append("text")
    .attr("x", 0)
    .attr("y", -16)
    .attr("font-size", 14)
    .attr("fill", "#555")
    .text("蓝点 = 关键论文发表年份；橙点 = 诺贝尔奖获奖年份");
}
