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
}