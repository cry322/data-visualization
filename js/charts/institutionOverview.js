// js/charts/institutionOverview.js

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
    let selectedInstitutionId = null; // 【新增】用于跟踪当前点击选中的机构 ID

    const metricNameMap = {
        "prize_paper_count": "参与获奖论文数量",
        "associated_laureate_count": "关联获奖者数量",
        "associated_scientist_count": "关联科学家数量",
        "institution_total_works_count": "机构总发文量",
        "median_prize_paper_cited_by_count": "获奖论文被引中位数",
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

    Promise.all([
        d3.csv("data/nobel_prize_institution_summary.csv"),
        d3.csv("data/nobel_prize_institution_field_outputs.csv"),
        d3.csv("data/nobel_prize_author_country.csv")
    ]).then(([summaryData, fieldData, authorCountryData]) => {
        
        let validSummary = summaryData.filter(d => d.institution_id).map(d => {
            const totalWorks = +d.institution_total_works_count || 0;
            const totalCited = +d.institution_total_cited_by_count || 0;
            const avgCitations = totalWorks > 0 ? (totalCited / totalWorks) : 0;

            return {
                id: d.institution_id,
                name: (d.institution_display_name || d.institution_id).trim(),
                country: d.country_code ? d.country_code.trim().toUpperCase() : "未知",
                prize_paper_count: +d.prize_paper_count || 0,
                associated_laureate_count: +d.associated_laureate_count || 0,
                associated_scientist_count: +d.associated_scientist_count || 0,
                institution_total_works_count: totalWorks,
                median_prize_paper_cited_by_count: +d.median_prize_paper_cited_by_count || 0,
                avg_citations_per_work: avgCitations 
            };
        });

        const fieldMap = new Map(); 
        const institutionFieldsMap = new Map(); 

        fieldData.forEach(f => {
            if (f.mapping_methods && f.mapping_methods.includes("field_exact")) {
                if (!fieldMap.has(f.nobel_field)) fieldMap.set(f.nobel_field, new Set());
                fieldMap.get(f.nobel_field).add(f.institution_id);
            }
            if (f.institution_id && f.nobel_field) {
                if (!institutionFieldsMap.has(f.institution_id)) {
                    institutionFieldsMap.set(f.institution_id, new Set());
                }
                institutionFieldsMap.get(f.institution_id).add(f.nobel_field);
            }
        });

        const x = d3.scaleLinear().range([0, width]);
        const y = d3.scaleBand().range([0, height]).padding(0.25);

        const xAxisG = svg.append("g").attr("transform", `translate(0,${height})`);
        const yAxisG = svg.append("g").attr("class", "y-axis");

        const xAxisLabel = svg.append("text")
            .attr("class", "x-axis-label")
            .attr("x", width)
            .attr("y", height + margin.bottom - 5)
            .style("text-anchor", "end")
            .style("font-size", "13px")
            .style("fill", "#64748b")
            .style("font-weight", "600");

        // 【修改】当切换排序指标时，重置选中状态与右侧面板
        d3.select("#institution-sort-select").on("change", function() {
            currentMetric = this.value;
            selectedInstitutionId = null; 
            d3.select("#institution-detail-content").html(`<div class="placeholder">机构详情面板位置</div>`);
            updateChart();
        });

        // 【修改】当切换学科时，重置选中状态与右侧面板
        d3.select("#institution-field-filter").on("change", function() {
            currentField = this.value;
            selectedInstitutionId = null;
            d3.select("#institution-detail-content").html(`<div class="placeholder">机构详情面板位置</div>`);
            updateChart();
        });

        updateChart();

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
            if (currentField === "Physics") {
                colorInterpolator = d3.interpolatePurples; 
            } else if (currentField === "Chemistry") {
                colorInterpolator = d3.interpolateGreens; 
            } else if (currentField === "Medicine") {
                colorInterpolator = d3.interpolateOranges;  
            } else {
                colorInterpolator = d3.interpolateBlues;   
            }
            
            const colorScale = d3.scaleSequential(colorInterpolator)
                                 .domain([0, maxMetricVal * 1.1]);

            xAxisG.transition("axis").duration(600).call(d3.axisBottom(x).ticks(6));
            xAxisLabel.text(`➤ ${metricNameMap[currentMetric]}`);

            const nameMap = new Map(top20.map(d => [d.id, d.name]));
            yAxisG.transition("axis").duration(600).call(
                d3.axisLeft(y).tickFormat(id => {
                    let n = nameMap.get(id) || id;
                    return n.length > 32 ? n.substring(0, 32) + "..." : n;
                })
            ).selectAll("text")
             .style("font-size", "12px")
             .style("fill", "#334155");

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
                    d3.select(this).transition("hover").duration(150).attr("fill", "#e15759");
                    
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
                    // 【修改】移出时判断：若当前柱子是被选中的那个，保持红色；否则恢复成对应的标尺渐变色
                    const targetColor = (d.id === selectedInstitutionId) ? "#e15759" : colorScale(d[currentMetric]);
                    d3.select(this).transition("hover").duration(150).attr("fill", targetColor);
                    tooltip.style("opacity", 0).style("display", "none");
                })
                .on("click", function(event, d) {
                    // 【修改】实现开关（Toggle）切换逻辑
                    if (selectedInstitutionId === d.id) {
                        // 1. 如果点击的是当前已选中的柱子 -> 取消选择
                        selectedInstitutionId = null;
                        
                        // 恢复所有柱子的正常透明度与色彩
                        svg.selectAll(".bar").transition("click").duration(200)
                            .style("opacity", 1)
                            .attr("fill", d => colorScale(d[currentMetric]));
                        
                        // 右侧详情面板退回空白占位状态
                        d3.select("#institution-detail-content")
                            .html(`<div class="placeholder">机构详情面板位置</div>`);
                    } else {
                        // 2. 如果点击的是其他柱子 -> 变更选中项
                        selectedInstitutionId = d.id;
                        
                        // 其他柱子变淡，当前柱子高亮为红色
                        svg.selectAll(".bar").transition("click").duration(200)
                            .style("opacity", barData => barData.id === selectedInstitutionId ? 1 : 0.4)
                            .attr("fill", barData => barData.id === selectedInstitutionId ? "#e15759" : colorScale(barData[currentMetric]));
                        
                        // 渲染右侧内容
                        renderDetailPanel(d, institutionFieldsMap, authorCountryData);
                    }
                })
                // 利用 D3 统一生命周期管理：重绘时根据全局 selectedInstitutionId 自动校准样式
                .transition("layout").duration(600)
                .attr("y", d => y(d.id))
                .attr("height", y.bandwidth())
                .attr("width", d => x(d[currentMetric]))
                .attr("fill", d => d.id === selectedInstitutionId ? "#e15759" : colorScale(d[currentMetric]))
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
                  .style("font-size", "12px")
                  .style("fill", "#475569")
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
                  // 数值的显隐透明度也跟柱子保持一致联动
                  .style("opacity", d => selectedInstitutionId === null ? 1 : (d.id === selectedInstitutionId ? 1 : 0.4));
        }

        // ==========================================
        // 右侧面板排版函数
        // ==========================================
        function renderDetailPanel(inst, fieldsMap, authorCountryData) {
            const detailContainer = d3.select("#institution-detail-content");
            detailContainer.html(""); 

            const fieldsSet = fieldsMap.get(inst.id) || new Set(["未明确分类"]);
            const fieldsBadges = Array.from(fieldsSet).map(f => 
                `<span style="display:inline-block; background:rgba(66,107,143,0.1); color:#426b8f; border:1px solid rgba(66,107,143,0.25); padding:2px 8px; border-radius:12px; font-size:12px; margin-right:6px; margin-bottom:6px; font-weight:600;">${f}</span>`
            ).join("");

            const papersForInst = authorCountryData.filter(row => row.institution_id === inst.id);
            const uniquePapers = new Map(); 

            papersForInst.forEach(row => {
                if (row.nobel_title && row.laureate_name) {
                    const titleStr = row.nobel_title.trim();
                    const formattedTitle = titleStr.replace(/\b\w/g, char => char.toUpperCase());
                    const key = titleStr + "|||" + row.laureate_name.trim();
                    
                    if (!uniquePapers.has(key)) {
                        let lName = row.laureate_name.trim();
                        lName = lName.replace(/\b\w/g, char => char.toUpperCase());
                        
                        uniquePapers.set(key, {
                            title: formattedTitle,
                            laureate: lName,
                            year: row.prize_year || ""
                        });
                    }
                }
            });

            const paperArray = Array.from(uniquePapers.values());
            
            let listHtml = "";
            if (paperArray.length > 0) {
                listHtml = paperArray.map((p, i) => `
                    <div style="padding: 10px; border-bottom: ${i === paperArray.length - 1 ? 'none' : '1px dashed rgba(129,115,97,0.2)'};">
                        <div style="font-size:13px; font-weight:600; color:#16212d; line-height:1.4; margin-bottom:4px;">
                            📄 ${p.title}
                        </div>
                        <div style="font-size:12px; color:#746b60;">
                            🏅 关联获奖者: <span style="color:#e15759; font-weight:700;">${p.laureate}</span>
                            ${p.year ? `<span style="margin-left:6px; background:#f1f5f9; padding:1px 5px; border-radius:4px; font-size:10px;">获奖年份：${p.year}</span>` : ""}
                        </div>
                    </div>
                `).join("");
            } else {
                listHtml = `<div style="padding:20px; color:#a8a094; font-size:13px; text-align:center; font-style:italic;">该机构暂无具体的代表性文献及获奖者关联名录。</div>`;
            }

            detailContainer.html(`
                <div style="animation: fadeIn 0.4s ease-in-out;">
                    <h4 style="margin: 0 0 4px 0; color: #16212d; font-size: 18px; font-weight:700; line-height:1.35;">${inst.name}</h4>
                    <div style="font-size:12px; color:#746b60; margin-bottom:14px; display:flex; gap:12px;">
                        <span>🆔 机构代码: <code>${inst.id}</code></span>
                        <span> 国家/地区: <strong>${inst.country}</strong></span>
                    </div>
                    
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:16px;">
                        <div class="sankey-stat" style="padding:10px; text-align:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px;">
                            <div class="sankey-stat-value" style="font-size:18px; color:#0f172a; font-weight:700;">${inst.prize_paper_count}</div>
                            <div class="sankey-stat-label" style="font-size:11px; color:#64748b;">参与获奖论文</div>
                        </div>
                        <div class="sankey-stat" style="padding:10px; text-align:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px;">
                            <div class="sankey-stat-value" style="font-size:18px; color:#426b8f; font-weight:700;">${inst.institution_total_works_count}</div>
                            <div class="sankey-stat-label" style="font-size:11px; color:#64748b;">机构总发文量</div>
                        </div>
                        <div class="sankey-stat" style="padding:10px; text-align:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px;">
                            <div class="sankey-stat-value" style="font-size:18px; color:#0f172a; font-weight:700;">${inst.associated_laureate_count}</div>
                            <div class="sankey-stat-label" style="font-size:11px; color:#64748b;">关联获奖者</div>
                        </div>
                        <div class="sankey-stat" style="padding:10px; text-align:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px;">
                            <div class="sankey-stat-value" style="font-size:18px; color:#0f172a; font-weight:700;">${inst.associated_scientist_count}</div>
                            <div class="sankey-stat-label" style="font-size:11px; color:#64748b;">关联科学家</div>
                        </div>
                    </div>

                    <div style="margin-bottom:14px;">
                        <div style="font-size:12px; font-weight:700; color:#16212d; margin-bottom:6px; letter-spacing:0.5px; text-transform:uppercase;">核心研究主题</div>
                        <div>${fieldsBadges}</div>
                    </div>

                    <div>
                        <div style="font-size:12px; font-weight:700; color:#16212d; margin-bottom:6px; letter-spacing:0.5px; text-transform:uppercase;">参与获奖论文及获奖者名录 (${paperArray.length})</div>
                        <div style="max-height: 250px; overflow-y: auto; background:rgba(216,222,232,0.15); border:1px solid rgba(129,115,97,0.15); border-radius:8px;">
                            ${listHtml}
                        </div>
                    </div>
                </div>
            `);
        }

    }).catch(err => {
        console.error("Institution summary data loading error:", err);
        container.html(`<div style="color:red; padding: 20px;">数据加载失败，请确保本地使用了 Live Server 启动。</div>`);
    });
}