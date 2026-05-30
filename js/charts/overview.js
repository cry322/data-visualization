const OVERVIEW_PATHS = [
  "data/career_overview(1).csv",
  "data/career_overview.csv"
];

const DETAIL_PATHS = [
  "data/career_detail(1).csv",
  "data/career_detail.csv"
];

const REPRESENTATIVES = {
  early: ["dirac, pam", "einstein, a"],
  sustained: ["bardeen, j", "pauling, l"],
  late: ["furchgott, rf", "mulliken, r"]
};

export async function initCareerModule() {
  const [overviewData, detailData] = await Promise.all([
    loadFirstCsv(OVERVIEW_PATHS, parseOverviewRow),
    loadFirstCsv(DETAIL_PATHS, parseDetailRow)
  ]);

  renderCareerStageLeft("#career-stage-left-chart", overviewData);
  renderCareerStageRight("#career-stage-right-chart", overviewData, detailData);
}

async function loadFirstCsv(paths, parser) {
  let lastError;

  for (const path of paths) {
    try {
      const rows = await d3.csv(path, parser);
      if (rows.length) return rows;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`No data loaded from ${paths.join(", ")}`);
}

function parseOverviewRow(d) {
  return {
    laureate_name: normalizeName(d.laureate_name),
    field: d.field,
    prize_paper_career_year: +d.prize_paper_career_year,
    award_career_year: +d.award_career_year,
    trajectory_type: d.trajectory_type
  };
}

function parseDetailRow(d) {
  return {
    laureate_name: normalizeName(d.laureate_name),
    field: d.field,
    career_year: +d.career_year,
    yearly_papers: +d.yearly_papers,
    cumulative_papers: +d.cumulative_papers,
    is_prize_year: String(d.is_prize_year).toLowerCase() === "true"
  };
}

function renderCareerStageLeft(containerSelector, data) {
  const container = d3.select(containerSelector);
  if (container.empty()) return;

  container.selectAll("*").remove();
  container.selectAll(".career-stage-left-tooltip").remove();

  const width = 540;
  const height = 500;
  const margin = { top: 40, right: 30, bottom: 70, left: 70 };

  const tooltip = container
    .append("div")
    .attr("class", "career-stage-tooltip career-stage-left-tooltip");

  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", "Career publication density overview");

  const fieldSelect = d3.select("#career-field-filter");
  const overallCheckbox = d3.select("#career-show-all");

  fieldSelect.on("change.careerLeft", update);
  overallCheckbox.on("change.careerLeft", update);

  update();

  function update() {
    svg.selectAll("*").remove();

    const selectedField = fieldSelect.property("value");
    const showOverall = overallCheckbox.property("checked");

    const fieldName =
      selectedField === "physics"
        ? "Physics"
        : selectedField === "chemistry"
        ? "Chemistry"
        : "Medicine";

    const fieldData = data.filter(d => d.field === fieldName);
    const fieldPrizeBins = createBins(fieldData.map(d => d.prize_paper_career_year));
    const fieldAwardBins = createBins(fieldData.map(d => d.award_career_year));
    const overallPrizeBins = createBins(data.map(d => d.prize_paper_career_year));
    const overallAwardBins = createBins(data.map(d => d.award_career_year));

    const maxDensity = d3.max([
      ...fieldPrizeBins.map(d => d.value),
      ...fieldAwardBins.map(d => d.value),
      1
    ]);

    const x = d3.scaleLinear()
      .domain([0, 60])
      .range([margin.left, width - margin.right]);

    const y = d3.scaleLinear()
      .domain([-maxDensity * 1.15, maxDensity * 1.15])
      .range([height - margin.bottom, margin.top]);

    svg.append("g")
      .attr("class", "career-left-grid")
      .attr("transform", `translate(${margin.left},0)`)
      .call(
        d3.axisLeft(y)
          .tickSize(-(width - margin.left - margin.right))
          .tickFormat("")
          .ticks(8)
      );

    svg.append("g")
      .attr("class", "career-left-axis")
      .attr("transform", `translate(0,${height / 2})`)
      .call(d3.axisBottom(x).ticks(12));

    svg.append("g")
      .attr("class", "career-left-axis")
      .attr("transform", `translate(${margin.left},0)`)
      .call(
        d3.axisLeft(y)
          .ticks(8)
          .tickFormat(d => Math.abs(d).toFixed(2))
      );

    svg.append("text")
      .attr("class", "career-left-label")
      .attr("x", width / 2)
      .attr("y", height - 20)
      .attr("text-anchor", "middle")
      .text("Career Year");

    svg.append("text")
      .attr("class", "career-left-label")
      .attr("transform", `translate(18,${height / 2}) rotate(-90)`)
      .attr("text-anchor", "middle")
      .text("Normalized Density");

    svg.append("text")
      .attr("class", "career-left-section-label")
      .attr("x", margin.left + 8)
      .attr("y", margin.top - 12)
      .text("Prize-winning Paper");

    svg.append("text")
      .attr("class", "career-left-section-label")
      .attr("x", margin.left + 8)
      .attr("y", height - margin.bottom + 45)
      .text("Nobel Recognition");

    svg.append("line")
      .attr("class", "career-left-reference-line")
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
        .attr("class", "career-left-overall-line")
        .attr("d", topLine);

      svg.append("path")
        .datum(overallAwardBins)
        .attr("class", "career-left-overall-line")
        .attr("d", bottomLine);
    }

    svg.append("path")
      .datum(fieldPrizeBins)
      .attr("class", `career-left-focus-area-top ${selectedField}`)
      .attr("d", topArea);

    svg.append("path")
      .datum(fieldAwardBins)
      .attr("class", `career-left-focus-area-bottom ${selectedField}`)
      .attr("d", bottomArea);

    const hoverLine = svg.append("line")
      .attr("class", "career-left-hover-line")
      .style("opacity", 0);

    svg.append("rect")
      .attr("x", margin.left)
      .attr("y", margin.top)
      .attr("width", width - margin.left - margin.right)
      .attr("height", height - margin.top - margin.bottom)
      .attr("fill", "transparent")
      .on("mousemove", function(event) {
        const [mx] = d3.pointer(event, svg.node());
        const year = Math.round(x.invert(mx));

        hoverLine
          .style("opacity", 1)
          .attr("x1", x(year))
          .attr("x2", x(year))
          .attr("y1", margin.top)
          .attr("y2", height - margin.bottom);

        tooltip
          .style("opacity", 1)
          .html(`
            <strong>${fieldName}</strong><br/>
            Career Year: ${year}<br/><br/>
            Prize-winning Paper Density: ${getBinValue(fieldPrizeBins, year).toFixed(3)}<br/>
            Nobel Recognition Density: ${getBinValue(fieldAwardBins, year).toFixed(3)}
          `);

        moveTooltip(container, tooltip, event, 12, -28);
      })
      .on("mouseleave", () => {
        hoverLine.style("opacity", 0);
        tooltip.style("opacity", 0);
      });
  }
}

function renderCareerStageRight(containerSelector, overviewData, detailData) {
  const container = d3.select(containerSelector);
  if (container.empty()) return;

  container.selectAll("*").remove();
  container.selectAll(".career-stage-right-tooltip").remove();

  const tooltip = container
    .append("div")
    .attr("class", "career-stage-tooltip career-stage-right-tooltip");

  const fieldSelect = d3.select("#career-detail-field-select");
  const scientistSelect = d3.select("#career-scientist-select");
  const yMetricSelect = d3.select("#career-y-metric-select");
  const tagButtons = d3.selectAll("#career-stage-overview .trajectory-tag");
  const scientistChips = d3.selectAll("#career-stage-overview .scientist-chip");

  const overviewByName = new Map(overviewData.map(d => [d.laureate_name, d]));
  const detailByName = d3.group(detailData, d => d.laureate_name);

  let selectedName = pickAvailableRepresentative("early") || detailData[0]?.laureate_name;

  fieldSelect.on("change.careerRight", () => {
    populateScientistSelect();
    selectedName = scientistSelect.property("value");
    updateActiveType();
    render();
  });

  scientistSelect.on("change.careerRight", () => {
    selectedName = normalizeName(scientistSelect.property("value"));
    updateActiveType();
    render();
  });

  yMetricSelect.on("change.careerRight", render);

  tagButtons.on("click.careerRight", function() {
    const type = d3.select(this).attr("data-type");
    const nextName = pickAvailableRepresentative(type);
    if (!nextName) return;

    selectedName = nextName;
    fieldSelect.property("value", "all");
    populateScientistSelect();
    scientistSelect.property("value", selectedName);
    updateActiveType(type);
    render();
  });

  scientistChips.on("click.careerRight", function() {
    const chip = d3.select(this);
    const type = d3.select(this.closest(".trajectory-row"))
      .select(".trajectory-tag")
      .attr("data-type");
    const chipIndex = Array.from(this.parentNode.children).indexOf(this);
    const nextName = (REPRESENTATIVES[type] || [])[chipIndex] || resolveScientistName(
      normalizeName(chip.attr("data-name")),
      chip.attr("data-field")
    );

    if (!nextName) return;

    selectedName = nextName;
    fieldSelect.property("value", chip.attr("data-field") || "all");
    populateScientistSelect();
    scientistSelect.property("value", selectedName);
    updateActiveType();
    render();
  });

  populateScientistSelect();
  scientistSelect.property("value", selectedName);
  updateActiveType();
  render();

  function populateScientistSelect() {
    const field = fieldSelect.property("value");
    const names = Array.from(detailByName.keys())
      .filter(name => field === "all" || overviewByName.get(name)?.field === field)
      .sort(d3.ascending);

    scientistSelect.selectAll("option")
      .data(names, d => d)
      .join("option")
      .attr("value", d => d)
      .text(d => formatName(d));

    if (!names.includes(selectedName)) {
      selectedName = names[0] || Array.from(detailByName.keys())[0];
    }
  }

  function render() {
    container.selectAll("svg, .placeholder").remove();

    const rows = (detailByName.get(selectedName) || [])
      .slice()
      .sort((a, b) => d3.ascending(a.career_year, b.career_year));

    const overview = overviewByName.get(selectedName);
    if (!rows.length || !overview) {
      container.append("div")
        .attr("class", "placeholder")
        .text("No career trajectory data available.");
      return;
    }

    const width = 620;
    const height = 430;
    const margin = { top: 34, right: 34, bottom: 58, left: 64 };
    const metric = yMetricSelect.property("value");
    const yKey = metric === "yearly" ? "yearly_papers" : "cumulative_papers";
    const yLabel = metric === "yearly" ? "Annual publications" : "Cumulative publications";
    const yMax = d3.max(rows, d => d[yKey]) || 1;

    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("role", "img")
      .attr("aria-label", `${formatName(selectedName)} career trajectory`);

    const maxCareerYear = d3.max([
      d3.max(rows, d => d.career_year) || 1,
      overview.prize_paper_career_year,
      overview.award_career_year
    ]);

    const x = d3.scaleLinear()
      .domain([0, maxCareerYear || 1])
      .nice()
      .range([margin.left, width - margin.right]);

    const y = d3.scaleLinear()
      .domain([0, yMax])
      .nice()
      .range([height - margin.bottom, margin.top]);

    svg.append("g")
      .attr("class", "career-right-grid")
      .attr("transform", `translate(${margin.left},0)`)
      .call(
        d3.axisLeft(y)
          .ticks(6)
          .tickSize(-(width - margin.left - margin.right))
          .tickFormat("")
      );

    svg.append("g")
      .attr("class", "career-right-axis")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(8));

    svg.append("g")
      .attr("class", "career-right-axis")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(6));

    svg.append("text")
      .attr("class", "career-right-label")
      .attr("x", width / 2)
      .attr("y", height - 16)
      .attr("text-anchor", "middle")
      .text("Career Year");

    svg.append("text")
      .attr("class", "career-right-label")
      .attr("transform", `translate(18,${height / 2}) rotate(-90)`)
      .attr("text-anchor", "middle")
      .text(yLabel);

    const line = d3.line()
      .x(d => x(d.career_year))
      .y(d => y(d[yKey]))
      .curve(d3.curveMonotoneX);

    svg.append("path")
      .datum(rows)
      .attr("class", "career-right-line")
      .attr("d", line);

    const prizeYears = new Set(rows.filter(d => d.is_prize_year).map(d => d.career_year));
    if (!prizeYears.size && Number.isFinite(overview.prize_paper_career_year)) {
      prizeYears.add(overview.prize_paper_career_year);
    }

    drawMilestone(svg, x, margin, height, overview.prize_paper_career_year, "Prize paper");
    drawMilestone(svg, x, margin, height, overview.award_career_year, "Recognition");

    svg.selectAll(".career-right-dot")
      .data(rows)
      .join("circle")
      .attr("class", d => prizeYears.has(d.career_year) ? "career-right-dot is-prize" : "career-right-dot")
      .attr("cx", d => x(d.career_year))
      .attr("cy", d => y(d[yKey]))
      .attr("r", d => prizeYears.has(d.career_year) ? 5 : 3.2)
      .on("mousemove", function(event, d) {
        tooltip
          .style("opacity", 1)
          .html(`
            <strong>${formatName(selectedName)}</strong><br/>
            Career Year: ${d.career_year}<br/>
            Annual Publications: ${d.yearly_papers}<br/>
            Cumulative Publications: ${d.cumulative_papers}
          `);
        moveTooltip(container, tooltip, event, 12, -30);
      })
      .on("mouseleave", () => tooltip.style("opacity", 0));

    svg.append("text")
      .attr("class", "career-right-title")
      .attr("x", margin.left)
      .attr("y", 22)
      .text(`${formatName(selectedName)} · ${overview.field} · ${overview.trajectory_type}`);

    updateSummary(rows, overview);
  }

  function pickAvailableRepresentative(type) {
    return (REPRESENTATIVES[type] || []).find(name => detailByName.has(name));
  }

  function resolveScientistName(rawName, field) {
    if (detailByName.has(rawName)) return rawName;

    const token = rawName.split(/[,\s]+/).find(Boolean);
    return Array.from(detailByName.keys()).find(name => {
      const overview = overviewByName.get(name);
      return (!field || overview?.field === field) && name.includes(token);
    });
  }

  function updateActiveType(type = overviewByName.get(selectedName)?.trajectory_type) {
    tagButtons.classed("active", function() {
      return d3.select(this).attr("data-type") === type;
    });
  }
}

function drawMilestone(svg, x, margin, height, year, label) {
  if (!Number.isFinite(year)) return;

  const xPos = x(year);
  const lineGroup = svg.append("g")
    .attr("class", "career-right-milestone");

  lineGroup.append("line")
    .attr("x1", xPos)
    .attr("x2", xPos)
    .attr("y1", margin.top)
    .attr("y2", height - margin.bottom);

  lineGroup.append("text")
    .attr("x", xPos + 6)
    .attr("y", margin.top + (label === "Prize paper" ? 12 : 30))
    .text(`${label}: ${year}`);
}

function updateSummary(rows, overview) {
  const peak = d3.max(rows, d => d.yearly_papers) || 0;
  const total = d3.max(rows, d => d.cumulative_papers) || 0;

  d3.select("#career-stat-prize").text(`Year ${overview.prize_paper_career_year}`);
  d3.select("#career-stat-peak").text(peak);
  d3.select("#career-stat-total").text(total);
  d3.select("#career-stat-field").text(overview.field || "--");
}

function createBins(values) {
  const filtered = values.filter(Number.isFinite);
  const bins = d3.bin()
    .domain([0, 60])
    .thresholds(24)(filtered);

  const maxCount = d3.max(bins, d => d.length) || 1;

  return bins.map(d => ({
    x0: d.x0,
    value: d.length / maxCount
  }));
}

function getBinValue(bins, year) {
  const bin = bins.find(d => year >= d.x0 && year < d.x0 + 2.5);
  return bin ? bin.value : 0;
}

function moveTooltip(container, tooltip, event, offsetX, offsetY) {
  const bounds = container.node().getBoundingClientRect();

  tooltip
    .style("left", `${event.clientX - bounds.left + offsetX}px`)
    .style("top", `${event.clientY - bounds.top + offsetY}px`);
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase();
}

function formatName(name) {
  return normalizeName(name)
    .split(",")
    .map(part => part.trim())
    .filter(Boolean)
    .reverse()
    .join(" ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}
