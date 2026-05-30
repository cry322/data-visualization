export async function initCareerModule() {

  // =====================================================
  // container
  // =====================================================

  const container = d3.select("#career-overview");

  container.selectAll("*").remove();

  const width = 540;
  const height = 500;

  const margin = {
    top: 40,
    right: 30,
    bottom: 70,
    left: 70
  };

  const svg = container
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  // =====================================================
  // data
  // =====================================================

  const data = await d3.csv(
    "data/career_overview.csv",
    d => ({
      laureate_name: d.laureate_name,
      field: d.field,
      prize_paper_career_year: +d.prize_paper_career_year,
      award_career_year: +d.award_career_year
    })
  );

  // =====================================================
  // tooltip
  // =====================================================

  d3.selectAll(".career-tooltip").remove();

  const tooltip = d3.select("body")
    .append("div")
    .attr("class", "career-tooltip");

  // =====================================================
  // controls
  // =====================================================

  const fieldSelect = d3.select("#career-field-filter");

  const overallCheckbox = d3.select(
    "#career-show-all"
  );

  fieldSelect.on("change", update);

  overallCheckbox.on("change", update);

  update();

  // =====================================================
  // update
  // =====================================================

  function update() {

    svg.selectAll("*").remove();

    const selectedField =
      fieldSelect.property("value");

    const showOverall =
      overallCheckbox.property("checked");

    const fieldName =
      selectedField === "physics"
        ? "Physics"
        : selectedField === "chemistry"
        ? "Chemistry"
        : "Medicine";

    const fieldClass =
      selectedField;

    const fieldData = data.filter(
      d => d.field === fieldName
    );

    const fieldPrizeBins = createBins(
      fieldData.map(d => d.prize_paper_career_year)
    );

    const fieldAwardBins = createBins(
      fieldData.map(d => d.award_career_year)
    );

    const overallPrizeBins = createBins(
      data.map(d => d.prize_paper_career_year)
    );

    const overallAwardBins = createBins(
      data.map(d => d.award_career_year)
    );

    const maxDensity = d3.max([
      ...fieldPrizeBins.map(d => d.value),
      ...fieldAwardBins.map(d => d.value)
    ]);

    const x = d3.scaleLinear()
      .domain([0, 60])
      .range([
        margin.left,
        width - margin.right
      ]);

    const y = d3.scaleLinear()
      .domain([
        -maxDensity * 1.15,
         maxDensity * 1.15
      ])
      .range([
        height - margin.bottom,
        margin.top
      ]);

    svg.append("g")
      .attr("class", "career-grid")
      .attr(
        "transform",
        `translate(${margin.left},0)`
      )
      .call(
        d3.axisLeft(y)
          .tickSize(
            -(width - margin.left - margin.right)
          )
          .tickFormat("")
          .ticks(8)
      );

    svg.append("g")
      .attr("class", "career-axis")
      .attr(
        "transform",
        `translate(0,${height / 2})`
      )
      .call(
        d3.axisBottom(x).ticks(12)
      );

    svg.append("g")
      .attr("class", "career-axis")
      .attr(
        "transform",
        `translate(${margin.left},0)`
      )
      .call(
        d3.axisLeft(y)
          .ticks(8)
          .tickFormat(d =>
            Math.abs(d).toFixed(2)
          )
      );

    svg.append("text")
      .attr("class", "career-label")
      .attr("x", width / 2)
      .attr("y", height - 20)
      .attr("text-anchor", "middle")
      .text("Career Year");

    svg.append("text")
      .attr("class", "career-label")
      .attr(
        "transform",
        `translate(18,${height / 2})
         rotate(-90)`
      )
      .attr("text-anchor", "middle")
      .text("Normalized Density");

    svg.append("text")
      .attr("class", "career-section-label")
      .attr("x", margin.left + 8)
      .attr("y", margin.top - 12)
      .text("Prize-winning Paper");

    svg.append("text")
      .attr("class", "career-section-label")
      .attr("x", margin.left + 8)
      .attr("y", height - margin.bottom + 45)
      .text("Nobel Recognition");

    svg.append("line")
      .attr("class", "career-reference-line")
      .attr("x1", margin.left)
      .attr("x2", width - margin.right)
      .attr("y1", height / 2)
      .attr("y2", height / 2);

    const topArea = d3.area()
      .x(d => x(d.x0))
      .y0(height / 2)
      .y1(d => y(d.value))
      .curve(d3.curveBasis);

    const bottomArea = d3.area()
      .x(d => x(d.x0))
      .y0(height / 2)
      .y1(d => y(-d.value))
      .curve(d3.curveBasis);

    const topLine = d3.line()
      .x(d => x(d.x0))
      .y(d => y(d.value))
      .curve(d3.curveBasis);

    const bottomLine = d3.line()
      .x(d => x(d.x0))
      .y(d => y(-d.value))
      .curve(d3.curveBasis);

    if (showOverall) {

      svg.append("path")
        .datum(overallPrizeBins)
        .attr("class", "career-overall-line")
        .attr("d", topLine);

      svg.append("path")
        .datum(overallAwardBins)
        .attr("class", "career-overall-line")
        .attr("d", bottomLine);
    }

    svg.append("path")
      .datum(fieldPrizeBins)
      .attr(
        "class",
        `career-focus-area-top ${fieldClass}`
      )
      .attr("d", topArea);

    svg.append("path")
      .datum(fieldAwardBins)
      .attr(
        "class",
        `career-focus-area-bottom ${fieldClass}`
      )
      .attr("d", bottomArea);

    const hoverLine = svg.append("line")
      .attr("class", "career-hover-line")
      .style("opacity", 0);

    svg.append("rect")
      .attr("x", margin.left)
      .attr("y", margin.top)
      .attr(
        "width",
        width - margin.left - margin.right
      )
      .attr(
        "height",
        height - margin.top - margin.bottom
      )
      .attr("fill", "transparent")

      .on("mousemove", function(event) {

        const [mx] = d3.pointer(event);

        const year =
          Math.round(x.invert(mx));

        hoverLine
          .style("opacity", 1)
          .attr("x1", x(year))
          .attr("x2", x(year))
          .attr("y1", margin.top)
          .attr("y2", height - margin.bottom);

        const prizeValue =
          getBinValue(fieldPrizeBins, year);

        const awardValue =
          getBinValue(fieldAwardBins, year);

        tooltip
          .style("opacity", 1)
          .html(`
            <strong>${fieldName}</strong><br/>
            Career Year: ${year}<br/><br/>
            Prize-winning Paper Density:
            ${prizeValue.toFixed(3)}<br/>
            Nobel Recognition Density:
            ${awardValue.toFixed(3)}
          `)
          .style(
            "left",
            `${event.pageX + 12}px`
          )
          .style(
            "top",
            `${event.pageY - 28}px`
          );

      })

      .on("mouseleave", () => {

        hoverLine.style("opacity", 0);

        tooltip.style("opacity", 0);

      });

  }

  function createBins(values) {

    const bins = d3.bin()
      .domain([0, 60])
      .thresholds(24)
      (values);

    const maxCount =
      d3.max(bins, d => d.length);

    return bins.map(d => ({
      x0: d.x0,
      value:
        d.length / maxCount
    }));
  }

  function getBinValue(bins, year) {

    const bin = bins.find(
      d =>
        year >= d.x0 &&
        year < d.x0 + 2.5
    );

    return bin ? bin.value : 0;
  }
  export async function initCareerDetailModule() {

  const container = d3.select("#career-detail");
  container.selectAll("*").remove();

  const width = 600;
  const height = 300;
  const margin = { top: 30, right: 30, bottom: 50, left: 55 };

  const svg = container
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const tooltip = d3.select("body")
    .append("div")
    .attr("class", "career-tooltip")
    .style("opacity", 0)
    .style("position", "absolute")
    .style("background", "#fff")
    .style("border", "1px solid #ccc")
    .style("padding", "6px")
    .style("pointer-events", "none");

  const detailData = await d3.csv("data/career_detail.csv", d => ({
    laureate_name: d.laureate_name,
    field: d.field,
    career_year: +d.career_year,
    yearly_papers: +d.yearly_papers,
    cumulative_papers: +d.cumulative_papers,
    is_prize_year: d.is_prize_year === "True"
  }));

  const overviewData = await d3.csv("data/career_overview.csv", d => ({
    laureate_name: d.laureate_name,
    field: d.field,
    prize_paper_career_year: +d.prize_paper_career_year,
    award_career_year: +d.award_career_year,
    trajectory_type: d.trajectory_type
  }));

  const fieldSelect = d3.select("#career-detail-field-select");
  const scientistSelect = d3.select("#career-scientist-select");

  const fields = ["All", "Physics", "Chemistry", "Medicine"];

  fieldSelect.selectAll("option")
    .data(fields)
    .join("option")
    .attr("value", d => d.toLowerCase())
    .text(d => d);

  const typeTagsContainer = d3.select("#career-type-tags");
  const trajectoryTypes = ["early", "sustained", "late"];
  const typeColors = { early: "#16a34a", sustained: "#2563eb", late: "#a855f7" };

  const typicalScientists = {
    early: [{ name: "Einstein", field: "Physics" }, { name: "Curie", field: "Chemistry" }],
    sustained: [{ name: "Fischer", field: "Chemistry" }, { name: "Pauling", field: "Chemistry" }],
    late: [{ name: "Yamanaka", field: "Medicine" }, { name: "Milstein", field: "Medicine" }]
  };

  typeTagsContainer.selectAll("div.type-row")
    .data(trajectoryTypes)
    .join("div")
    .attr("class", "type-row")
    .each(function(type) {

      const row = d3.select(this);

      row.append("span")
        .attr("class", "trajectory-tag")
        .style("background-color", typeColors[type])
        .text(type.charAt(0).toUpperCase() + type.slice(1));

      row.selectAll("span.scientist-chip")
        .data(typicalScientists[type])
        .join("span")
        .attr("class", "scientist-chip")
        .style("margin-left", "10px")
        .text(d => {
          let emoji = "⚛";
          if (d.field === "Chemistry") emoji = "🧪";
          if (d.field === "Medicine") emoji = "🧬";
          return `${emoji} ${d.name} (${d.field})`;
        })
        .on("click", (event, d) => {
          scientistSelect.property("value", d.name);
          render();
        });
    });

  fieldSelect.on("change", render);
  scientistSelect.on("change", render);

  function render() {

    svg.selectAll("*").remove();

    const selectedField = fieldSelect.property("value");
    const selectedScientist = scientistSelect.property("value");

    let filtered = detailData;

    if (selectedField !== "all") {
      filtered = filtered.filter(d => d.field.toLowerCase() === selectedField);
    }

    if (selectedScientist && selectedScientist !== "All") {
      filtered = filtered.filter(d => d.laureate_name === selectedScientist);
    }

    const x = d3.scaleLinear()
      .domain([0, d3.max(filtered, d => d.career_year)])
      .range([margin.left, width - margin.right]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(filtered, d => d.cumulative_papers)])
      .range([height - margin.bottom, margin.top]);

    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(10));

    svg.append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y));

    const line = d3.line()
      .x(d => x(d.career_year))
      .y(d => y(d.cumulative_papers))
      .curve(d3.curveMonotoneX);

    const laureates = Array.from(new Set(filtered.map(d => d.laureate_name)));

    laureates.forEach((name) => {
      const d = filtered.filter(e => e.laureate_name === name);
      svg.append("path")
        .datum(d)
        .attr("fill", "none")
        .attr("stroke", "#2563eb")
        .attr("stroke-width", 2)
        .attr("d", line);
    });

    svg.selectAll("circle")
      .data(filtered)
      .join("circle")
      .attr("cx", d => x(d.career_year))
      .attr("cy", d => y(d.cumulative_papers))
      .attr("r", 4)
      .attr("fill", d => d.is_prize_year ? "gold" : "#999")
      .on("mousemove", (event, d) => {
        tooltip
          .style("opacity", 1)
          .html(`
            <strong>${d.laureate_name}</strong><br/>
            Career Year: ${d.career_year}<br/>
            Yearly Papers: ${d.yearly_papers}<br/>
            Cumulative Papers: ${d.cumulative_papers}<br/>
            Prize Paper: ${d.is_prize_year}
          `)
          .style("left", `${event.pageX + 12}px`)
          .style("top", `${event.pageY - 20}px`);
      })
      .on("mouseleave", () => tooltip.style("opacity", 0));

    const scientists = Array.from(new Set(filtered.map(d => d.laureate_name)));

    scientistSelect.selectAll("option").remove();
    scientistSelect.selectAll("option")
      .data(["All"].concat(scientists))
      .join("option")
      .attr("value", d => d)
      .text(d => d);

  }

  render();
}
}