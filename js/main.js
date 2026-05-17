document.addEventListener("DOMContentLoaded", async () => {
  console.log("Nobel visualization project loaded.");

  const sampleData = [
    {
      field: "Physics",
      laureate: "Scientist A",
      title: "Prize-winning Paper A",
      pubYear: 1920,
      prizeYear: 1945,
      waitTime: 25
    },
    {
      field: "Chemistry",
      laureate: "Scientist B",
      title: "Prize-winning Paper B",
      pubYear: 1955,
      prizeYear: 1970,
      waitTime: 15
    },
    {
      field: "Medicine",
      laureate: "Scientist C",
      title: "Prize-winning Paper C",
      pubYear: 1980,
      prizeYear: 2005,
      waitTime: 25
    }
  ];

  drawTimeline(sampleData);

  d3.selectAll(".controls button").on("click", function () {
    d3.selectAll(".controls button").classed("active", false);
    d3.select(this).classed("active", true);

    const field = d3.select(this).attr("data-field");

    const filteredData =
      field === "all"
        ? sampleData
        : sampleData.filter(d => d.field === field);

    drawTimeline(filteredData);
  });
});
