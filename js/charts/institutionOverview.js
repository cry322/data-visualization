// js/charts/institutionOverview.js

import { getFieldRamp } from "../utils/dataLoader.js";

const d3 = window.d3;

export function initInstitutionOverview() {
    const container = d3.select("#institution-overview-chart");
    if (container.empty()) return;
    container.html(""); 

    const margin = { top: 30, right: 60, bottom: 40, left: 280 }; 
    const width = 960 - margin.left - margin.right;
    const height = 750 - margin.top - margin.bottom;

    const svg = container
        .append("svg")
        .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
        .attr("width", "100%")
        .attr("height", "100%")
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    let currentMetric = "prize_paper_count"; 
    let currentField = "all";          
    let selectedInstitutionId = null; 

    const metricNameMap = {
        "prize_paper_count": "参与获奖论文数量",
        "associated_laureate_count": "关联获奖者数量",
        "associated_scientist_count": "关联科学家数量",
        "institution_total_works_count": "机构总发文量",
        "median_prize_paper_cited_by_count": "关键论文被引中位数",
        "avg_citations_per_work": "机构发文平均被引"
    };

    const fieldNameMap = {
        "all": "全部学科",
        "Physics": "Physics",
        "Chemistry": "Chemistry",
        "Medicine": "Medicine"
    };

    d3.selectAll(".institution-tooltip").remove();
    const tooltip = d3.select("body").append("div")
        .attr("class", "chart-tooltip institution-tooltip")
        .style("display", "none")
        .style("opacity", 0) 
        .style("position", "absolute")
        .style("z-index", "9999");

    d3.json("data_final/section3/institution_overview.json").then(dataset => {
        
        let validSummary = (dataset.institutions || []).filter(d => d.id).map(d => ({
            id: d.id,
            name: (d.name || d.id).trim(),
            country: d.country ? d.country.trim().toUpperCase() : "未知",
            prize_paper_count: +d.prize_paper_count || 0,
            associated_laureate_count: +d.associated_laureate_count || 0,
            associated_scientist_count: +d.associated_scientist_count || 0,
            institution_total_works_count: +d.institution_total_works_count || 0,
            median_prize_paper_cited_by_count: +d.median_prize_paper_cited_by_count || 0,
            avg_citations_per_work: +d.avg_citations_per_work || 0,
            fields: Array.isArray(d.fields) ? d.fields : [],
            papers: Array.isArray(d.papers) ? d.papers : []
        }));

        const fieldMap = new Map(
            Object.entries(dataset.exactFieldInstitutionIds || {})
                .map(([field, ids]) => [field, new Set(ids)])
        ); 
        const x = d3.scaleLinear().range([0, width]);
        const y = d3.scaleBand().range([0, height]).padding(0.25);

        const xAxisG = svg.append("g").attr("transform", `translate(0,${height})`);
        const yAxisG = svg.append("g").attr("class", "y-axis");

        const xAxisLabel = svg.append("text")
            .attr("class", "x-axis-label")
            .attr("x", width)
            .attr("y", height + margin.bottom - 5)
            .style("text-anchor", "end")
            .style("font-size", "17px")
            .style("fill", "var(--chart-label)")
            .style("font-weight", "600");

        
        d3.select("#institution-sort-select").on("change", function() {
            currentMetric = this.value;
            selectedInstitutionId = null; 
            d3.select("#institution-detail-content").html(`<div class="placeholder">机构详情面板位置</div>`);
            updateChart();
        });

        
        d3.select("#institution-field-filter").on("change", function() {
            currentField = this.value;
            selectedInstitutionId = null;
            d3.select("#institution-detail-content").html(`<div class="placeholder">机构详情面板位置</div>`);
            updateChart();
        });

        updateChart();
        window.addEventListener("themechange", updateChart);

        function updateChart() {
            let filteredData = [...validSummary];

            if (currentField !== "all" && fieldMap.has(currentField)) {
                const validIds = fieldMap.get(currentField);
                filteredData = filteredData.filter(d => validIds.has(d.id));
            }

            filteredData = filteredData.filter(d => d[currentMetric] > 0);
            filteredData.sort((a, b) => b[currentMetric] - a[currentMetric]);
            const top20 = filteredData.slice(0, 20);

            d3.select("#metric-institution-count").text(filteredData.length);
            d3.select("#metric-paper-count").text(d3.sum(filteredData, d => d.prize_paper_count));

            const maxMetricVal = d3.max(top20, d => d[currentMetric]) || 1;
            x.domain([0, maxMetricVal]);
            y.domain(top20.map(d => d.id));

            let colorInterpolator;
            if (currentField === "Physics" || currentField === "Chemistry" || currentField === "Medicine") {
                const [startColor, endColor] = getFieldRamp(currentField);
                colorInterpolator = d3.interpolate(startColor, endColor);
            } else {
                const eyeTheme = document.documentElement.dataset.theme === "dark";
                colorInterpolator = eyeTheme ? d3.interpolate("#4b5668", "#c6d2dd") : d3.interpolate("#edf1f5", "#66788d");   
            }
            
            const colorScale = d3.scaleSequential(colorInterpolator)
                                 .domain([0, maxMetricVal * 1.1]);

            xAxisG.transition("axis").duration(600).call(d3.axisBottom(x).ticks(6));
            xAxisG.selectAll("text").style("font-size", "15px").style("fill", "var(--chart-label)");
            xAxisLabel.text(metricNameMap[currentMetric]);

            const nameMap = new Map(top20.map(d => [d.id, d.name]));
            yAxisG.transition("axis").duration(600).call(
                d3.axisLeft(y).tickFormat(id => {
                    let n = nameMap.get(id) || id;
                    return n.length > 32 ? n.substring(0, 32) + "..." : n;
                })
            ).selectAll("text")
             .style("font-size", "14px")
             .style("fill", "var(--chart-label)");

            const bars = svg.selectAll(".bar").data(top20, d => d.id);

            bars.exit()
                .transition("exit").duration(400)
                .attr("width", 0)
                .style("opacity", 0)
                .remove();

            const barsEnter = bars.enter()
                .append("rect")
                .attr("class", "bar")
                .attr("y", d => y(d.id)) 
                .attr("x", 0)
                .attr("height", y.bandwidth())
                .attr("width", 0) 
                .attr("rx", 4)
                .style("cursor", "pointer");

            barsEnter.merge(bars)
                .on("mouseover", function(event, d) {
                    d3.select(this).transition("hover").duration(150).attr("fill", "var(--chart-highlight)");
                    
                    const displayField = fieldNameMap[currentField] || currentField;
                    const displayMetric = metricNameMap[currentMetric] || currentMetric;
                    
                    const rawValue = d[currentMetric];
                    const displayValue = Number.isInteger(rawValue) ? rawValue : rawValue.toFixed(2);

                    tooltip.style("display", "block")
                           .style("opacity", 1) 
                           .html(`
                               <div class="tooltip-title" style="font-size: 14px; margin-bottom: 8px;"> ${d.name}</div>
                               <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 4px;">
                                   筛选学科: <span style="color: #fff; font-weight: bold;">${displayField}</span>
                               </div>
                               <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 4px;">
                                   排序指标: <span style="color: #fff; font-weight: bold;">${displayMetric}</span>
                               </div>
                               <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.2);">
                                   当前指标数值: <strong style="color: #ffcc00; font-size: 16px;">${displayValue}</strong>
                               </div>
                           `);
                })
                .on("mousemove", function(event) {
                    tooltip.style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 15) + "px");
                })
                .on("mouseout", function(event, d) {
                    
                    const targetColor = (d.id === selectedInstitutionId) ? "var(--chart-highlight)" : colorScale(d[currentMetric]);
                    d3.select(this).transition("hover").duration(150).attr("fill", targetColor);
                    tooltip.style("opacity", 0).style("display", "none");
                })
                .on("click", function(event, d) {
                    
                    if (selectedInstitutionId === d.id) {
                        
                        selectedInstitutionId = null;
                        
                        svg.selectAll(".bar").transition("click").duration(200)
                            .style("opacity", 1)
                            .attr("fill", d => colorScale(d[currentMetric]));
                        
                        // 再次点击当前柱子时清空详情面板。
                        d3.select("#institution-detail-content")
                            .html(`<div class="placeholder">机构详情面板位置</div>`);
                    } else {
                        // 点击其他柱子时切换选中机构。
                        selectedInstitutionId = d.id;
                        
                        // 弱化未选中柱子，突出当前机构。
                        svg.selectAll(".bar").transition("click").duration(200)
                            .style("opacity", barData => barData.id === selectedInstitutionId ? 1 : 0.4)
                            .attr("fill", barData => barData.id === selectedInstitutionId ? "var(--chart-highlight)" : colorScale(barData[currentMetric]));
                        
                        // 渲染右侧详情。
                        renderDetailPanel(d);
                    }
                })
                // 重绘时根据 selectedInstitutionId 同步选中状态和透明度。
                .transition("layout").duration(600)
                .attr("y", d => y(d.id))
                .attr("height", y.bandwidth())
                .attr("width", d => x(d[currentMetric]))
                .attr("fill", d => d.id === selectedInstitutionId ? "var(--chart-highlight)" : colorScale(d[currentMetric]))
                .style("opacity", d => selectedInstitutionId === null ? 1 : (d.id === selectedInstitutionId ? 1 : 0.4)); 

            const labels = svg.selectAll(".bar-label").data(top20, d => d.id);

            labels.exit()
                  .transition("exit").duration(400)
                  .style("opacity", 0)
                  .remove();

            const labelsEnter = labels.enter()
                  .append("text")
                  .attr("class", "bar-label")
                  .attr("y", d => y(d.id) + y.bandwidth() / 2) 
                  .attr("x", 0)
                  .attr("dy", ".35em") 
                  .style("font-size", "14px")
                  .style("fill", "var(--chart-label)")
                  .style("font-weight", "600")
                  .style("opacity", 0)
                  .style("pointer-events", "none");

            labelsEnter.merge(labels)
                  .transition("layout").duration(600)
                  .attr("y", d => y(d.id) + y.bandwidth() / 2)
                  .attr("x", d => x(d[currentMetric]) + 6) 
                  .text(d => {
                      const val = d[currentMetric];
                      return Number.isInteger(val) ? val : val.toFixed(2);
                  })
                  // 数值标签透明度与柱子保持一致。
                  .style("opacity", d => selectedInstitutionId === null ? 1 : (d.id === selectedInstitutionId ? 1 : 0.4));
        }

        // ==========================================
        // 右侧详情面板渲染
        // ==========================================
        function renderDetailPanel(inst) {
            const detailContainer = d3.select("#institution-detail-content");
            detailContainer.html(""); 

            const fieldsSet = new Set(inst.fields && inst.fields.length ? inst.fields : ["未明确分类"]);
            const fieldsBadges = Array.from(fieldsSet).map(f => 
                `<span class="institution-field-badge">${f}</span>`
            ).join("");

            const paperArray = inst.papers || [];
            
            let listHtml = "";
            if (paperArray.length > 0) {
                listHtml = paperArray.map((p, i) => `
                    <div class="institution-paper-item">
                        <div class="institution-paper-title">
                            ${p.title}
                        </div>
                        <div class="institution-paper-meta">
                            关联获奖者: <strong>${p.laureate}</strong>
                            ${p.year ? `<span class="country-detail-year">获奖年份：${p.year}</span>` : ""}
                        </div>
                    </div>
                `).join("");
            } else {
                listHtml = `<div class="institution-empty">该机构暂无具体的代表性文献及获奖者关联名录。</div>`;
            }

            detailContainer.html(`
                <div class="institution-detail-shell">
                    <h4 class="institution-detail-title">${inst.name}</h4>
                    <div class="institution-detail-meta">
                        <span>机构代码: <code>${inst.id}</code></span>
                        <span>国家/地区: <strong>${inst.country}</strong></span>
                    </div>
                    
                    <div class="institution-stat-grid">
                        <div class="institution-stat-card">
                            <div class="sankey-stat-value">${inst.prize_paper_count}</div>
                            <div class="sankey-stat-label">参与获奖论文</div>
                        </div>
                        <div class="institution-stat-card">
                            <div class="sankey-stat-value">${inst.institution_total_works_count}</div>
                            <div class="sankey-stat-label">机构总发文量</div>
                        </div>
                        <div class="institution-stat-card">
                            <div class="sankey-stat-value">${inst.associated_laureate_count}</div>
                            <div class="sankey-stat-label">关联获奖者</div>
                        </div>
                        <div class="institution-stat-card">
                            <div class="sankey-stat-value">${inst.associated_scientist_count}</div>
                            <div class="sankey-stat-label">关联科学家</div>
                        </div>
                    </div>

                    <div style="margin-bottom:14px;">
                        <div class="institution-mini-title">核心研究主题</div>
                        <div>${fieldsBadges}</div>
                    </div>

                    <div>
                        <div class="institution-mini-title">参与获奖论文及获奖者名录 <span class="country-detail-badge">${paperArray.length}</span></div>
                        <div class="institution-paper-list">
                            ${listHtml}
                        </div>
                    </div>
                </div>
            `);
        }

    }).catch(err => {
        console.error("Institution summary data loading error:", err);
        container.html(`<div style="color:red; padding: 20px;">数据加载失败，请确保本地使用 Live Server 启动。</div>`);
    });
}

