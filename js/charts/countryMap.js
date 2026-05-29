// js/charts/countryMap.js

import * as topojson from "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm";

const d3 = window.d3;

export function initCountryMap() {
    const mapContainer = d3.select("#country-map-chart");
    const rankContainer = d3.select("#country-ranking-chart");

    if (mapContainer.empty()) return;
    mapContainer.html(""); 
    if (!rankContainer.empty()) rankContainer.html("");

    // ==========================================
    // 1. 初始化地图画布
    // ==========================================
    const width = mapContainer.node().getBoundingClientRect().width || 800;
    const height = 450;

    const svgMap = mapContainer.append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("width", "100%")
        .attr("height", "100%");

    const projection = d3.geoNaturalEarth1()
        .scale(width / 5.5)
        .translate([width / 2, height / 2]);
    const path = d3.geoPath().projection(projection);

    svgMap.append("rect").attr("width", width).attr("height", height).attr("fill", "#f8f9fa");

    const mapZoomGroup = svgMap.append("g"); 
    const zoom = d3.zoom()
        .scaleExtent([1, 8]) 
        .on("zoom", (event) => {
            mapZoomGroup.attr("transform", event.transform);
        });
    svgMap.call(zoom);

    // ==========================================
    // 2. 初始化排行榜画布
    // ==========================================
    const marginRank = { top: 20, right: 30, bottom: 40, left: 70 };
    const widthRank = rankContainer.node() ? rankContainer.node().getBoundingClientRect().width || 400 : 400;
    const heightRank = 450;
    const innerWidthRank = widthRank - marginRank.left - marginRank.right;
    const innerHeightRank = heightRank - marginRank.top - marginRank.bottom;

    const svgRank = rankContainer.empty() ? null : rankContainer.append("svg")
        .attr("viewBox", `0 0 ${widthRank} ${heightRank}`)
        .attr("width", "100%")
        .attr("height", "100%")
        .append("g")
        .attr("transform", `translate(${marginRank.left},${marginRank.top})`);

    let xRank, yRank, xRankAxisG, yRankAxisG;
    if (svgRank) {
        xRank = d3.scaleLinear().range([0, innerWidthRank]);
        yRank = d3.scaleBand().range([0, innerHeightRank]).padding(0.25);
        xRankAxisG = svgRank.append("g").attr("transform", `translate(0,${innerHeightRank})`);
        yRankAxisG = svgRank.append("g").attr("class", "y-axis");
    }

    // 国家代码与中文映射
    const countryNameMap = {
        "US": "美国", "GB": "英国", "DE": "德国", "FR": "法国", "SE": "瑞典", 
        "CH": "瑞士", "JP": "日本", "NL": "荷兰", "RU": "俄罗斯", "CA": "加拿大", 
        "IT": "意大利", "AT": "奥地利", "DK": "丹麦", "AU": "澳大利亚", "IL": "以色列",
        "BE": "比利时", "NO": "挪威", "PL": "波兰", "ES": "西班牙", "CN": "中国",
        "AR": "阿根廷", "IN": "印度", "ZA": "南非", "FI": "芬兰", "IE": "爱尔兰",
        "HU": "匈牙利", "CZ": "捷克", "PT": "葡萄牙", "NZ": "新西兰", "GR": "希腊",
        "BR": "巴西", "KR": "韩国", "TW": "中国台湾", "TR": "土耳其", "MX": "墨西哥",
        "UA": "乌克兰", "MY": "马来西亚", "CL": "智利", "BI": "布隆迪", "TZ": "坦桑尼亚"
    };

    const nameToAlpha2 = {
        "United States of America": "US", "United Kingdom": "GB", "Germany": "DE",
        "France": "FR", "Sweden": "SE", "Switzerland": "CH", "Japan": "JP",
        "Netherlands": "NL", "Russia": "RU", "Canada": "CA", "Italy": "IT",
        "Austria": "AT", "Denmark": "DK", "Australia": "AU", "Belgium": "BE",
        "Norway": "NO", "Israel": "IL", "Poland": "PL", "Spain": "ES",
        "China": "CN", "Argentina": "AR", "India": "IN", "South Africa": "ZA",
        "Finland": "FI", "Ireland": "IE", "Hungary": "HU", "Czechia": "CZ",
        "Portugal": "PT", "New Zealand": "NZ", "Greece": "GR", "Brazil": "BR",
        "South Korea": "KR", "Taiwan": "TW", "Turkey": "TR", "Mexico": "MX",
        "Ukraine": "UA", "Malaysia": "MY", "Chile": "CL", "Burundi": "BI", 
        "United Republic of Tanzania": "TZ", "Tanzania": "TZ" 
    };

    const metricConfig = {
        "m1": "诺奖关联机构数",
        "m2": "诺奖关联论文数",
        "m3": "诺奖获奖科学家数"
    };

    // ==========================================
    // 3. 数据清洗助手函数
    // ==========================================
    function cleanCountryCode(rawCode) {
        let code = (rawCode || "").trim();
        if (code === "United States") code = "US";
        if (code.toLowerCase() === "nan") return null;
        return code.toUpperCase() || null;
    }

    // ==========================================
    // 4. 加载数据并渲染
    // ==========================================
    Promise.all([
        d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"),
        d3.csv("data/nobel_prize_institution_summary.csv"),
        d3.csv("data/nobel_prize_author_country.csv") 
    ]).then(([worldData, summaryData, authorCountryData]) => {
        
        const countryMetrics = new Map();

        function initCountryMap(cc) {
            if (!countryMetrics.has(cc)) {
                countryMetrics.set(cc, { 
                    code: cc, 
                    name: countryNameMap[cc] || cc, 
                    m1: 0, 
                    uniquePapersSet: new Set(),         
                    laureateSet: new Set()              
                });
            }
            return countryMetrics.get(cc);
        }

        // --- M1: 机构数目 ---
        summaryData.forEach(d => {
            const cc = cleanCountryCode(d.country_code);
            if (!cc) return;
            let cm = initCountryMap(cc);
            cm.m1 += 1; 
        });

        // --- M2 & M3: 精确去重 ---
        authorCountryData.forEach(d => {
            const cc = cleanCountryCode(d.country_code);
            if (!cc) return;
            let cm = initCountryMap(cc);

            const paperId = (d.openalex_paper_id || "").trim();
            const laureateIdentifier = (d.laureate_name || d.laureate_id || "").trim(); 

            if (paperId) cm.uniquePapersSet.add(paperId);
            if (laureateIdentifier) cm.laureateSet.add(laureateIdentifier.toLowerCase());
        });

        let combinedData = [];
        countryMetrics.forEach(cm => {
            cm.m2 = cm.uniquePapersSet.size;
            cm.m3 = cm.laureateSet.size; 
            
            if (cm.m1 > 0 || cm.m2 > 0 || cm.m3 > 0) combinedData.push(cm);
        });

        d3.select("#metric-country-count").text(combinedData.length);

        // --- 绘制地图板块 ---
        const countries = topojson.feature(worldData, worldData.objects.countries).features;
        const mapPaths = mapZoomGroup.append("g")
            .selectAll("path")
            .data(countries)
            .enter().append("path")
            .attr("d", path)
            .attr("class", d => {
                const cc = nameToAlpha2[d.properties.name];
                return cc ? `map-path map-path-${cc}` : "map-path"; 
            })
            .attr("fill", "#ffffff")
            .attr("stroke", "#cbd5e1")
            .attr("stroke-width", 0.5)
            .style("cursor", "pointer") 
            .style("transition", "stroke 0.2s, stroke-width 0.2s"); 

        d3.selectAll(".country-tooltip").remove();
        const tooltip = d3.select("body").append("div")
            .attr("class", "chart-tooltip country-tooltip")
            .style("display", "none")
            .style("opacity", 0)
            .style("position", "absolute")
            .style("z-index", "9999");

        // ==========================================
        // 5. 更新图表与事件绑定
        // ==========================================
        let currentMetric = "m1"; 

        d3.select("#country-sort-select").on("change", function() {
            currentMetric = this.value;
            updateDashboard();
        });

        function updateDashboard() {
            const maxVal = d3.max(combinedData, d => d[currentMetric]) || 1;
            const colorScale = d3.scaleSequential(d3.interpolateReds).domain([0, Math.sqrt(maxVal)]); 

            mapPaths.transition("color").duration(750).attr("fill", d => {
                const cc = nameToAlpha2[d.properties.name];
                if (!cc || !countryMetrics.has(cc)) return "#ffffff"; 
                const val = countryMetrics.get(cc)[currentMetric];
                return val === 0 ? "#ffffff" : colorScale(Math.sqrt(val));
            });

            const sortedList = [...combinedData].sort((a, b) => b[currentMetric] - a[currentMetric]);
            const top10 = sortedList.slice(0, 10);

            xRank.domain([0, d3.max(top10, d => d[currentMetric]) || 1]);
            yRank.domain(top10.map(d => d.name));

            xRankAxisG.transition("layout").duration(600).call(d3.axisBottom(xRank).ticks(4));
            yRankAxisG.transition("layout").duration(600).call(d3.axisLeft(yRank))
                .selectAll("text").style("font-size", "12px").style("fill", "#334155");

            const bars = svgRank.selectAll(".rank-bar").data(top10, d => d.code);

            bars.exit().transition("exit").duration(400).attr("width", 0).remove();

            const barsEnter = bars.enter().append("rect")
                .attr("class", d => `rank-bar rank-bar-${d.code}`) 
                .attr("y", d => yRank(d.name))
                .attr("x", 0)
                .attr("height", yRank.bandwidth())
                .attr("width", 0)
                .attr("rx", 3)
                .style("cursor", "pointer")
                .attr("fill", "#e15759"); 
            
            barsEnter.merge(bars)
                .transition("layout").duration(600)
                .attr("y", d => yRank(d.name))
                .attr("height", yRank.bandwidth())
                .attr("width", d => xRank(d[currentMetric]));

            // --- 绑定交互 ---
            mapPaths.on("mouseover", function(event, d) {
                const cc = nameToAlpha2[d.properties.name];
                if (!cc || !countryMetrics.has(cc)) return;
                const cData = countryMetrics.get(cc);
                if (cData[currentMetric] === 0) return; 

                d3.select(this).raise().attr("stroke", "#0f172a").attr("stroke-width", 1.5);
                d3.selectAll(`.rank-bar-${cc}`).transition("hover").duration(150).attr("fill", "#991b1b");
                showTooltip(event, cData);
            })
            .on("mousemove", function(event) {
                tooltip.style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 15) + "px");
            })
            .on("mouseout", function(event, d) {
                const cc = nameToAlpha2[d.properties.name];
                d3.select(this).attr("stroke", "#cbd5e1").attr("stroke-width", 0.5);
                d3.selectAll(`.rank-bar-${cc}`).transition("hover").duration(150).attr("fill", "#e15759");
                tooltip.style("opacity", 0).style("display", "none");
            })
            .on("click", function(event, d) {
                const cc = nameToAlpha2[d.properties.name];
                if (!cc || !countryMetrics.has(cc)) return;
                renderCountryDetail(cc, countryMetrics.get(cc).name, summaryData, authorCountryData);
            });

            barsEnter.merge(bars).on("mouseover", function(event, d) {
                d3.select(this).transition("hover").duration(150).attr("fill", "#991b1b");
                d3.selectAll(`.map-path-${d.code}`).raise().attr("stroke", "#0f172a").attr("stroke-width", 1.5);
                showTooltip(event, d); 
            })
            .on("mousemove", function(event) {
                tooltip.style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 15) + "px");
            })
            .on("mouseout", function(event, d) {
                d3.select(this).transition("hover").duration(150).attr("fill", "#e15759");
                d3.selectAll(`.map-path-${d.code}`).attr("stroke", "#cbd5e1").attr("stroke-width", 0.5);
                tooltip.style("opacity", 0).style("display", "none");
            })
            .on("click", function(event, d) {
                renderCountryDetail(d.code, d.name, summaryData, authorCountryData);
            });
        }

        updateDashboard();

        function showTooltip(event, d) {
            const activeMetricName = metricConfig[currentMetric];
            tooltip.style("display", "block").style("opacity", 1)
                   .html(`
                       <div class="tooltip-title" style="font-size: 14px; margin-bottom: 8px;">🌍 ${d.name} (${d.code})</div>
                       <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 4px;">当前渲染指标: <span style="color: #fff; font-weight: bold;">${activeMetricName}</span></div>
                       <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.2);">
                           <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                               <span style="color: #cbd5e1;">诺奖关联机构数:</span>
                               <strong style="color: ${currentMetric === 'm1' ? '#ffcc00' : '#fff'};">${d.m1}</strong>
                           </div>
                           <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                               <span style="color: #cbd5e1;">诺奖关联论文数:</span>
                               <strong style="color: ${currentMetric === 'm2' ? '#ffcc00' : '#fff'};">${d.m2}</strong>
                           </div>
                           <div style="display: flex; justify-content: space-between;">
                               <span style="color: #cbd5e1;">诺奖获奖科学家数:</span>
                               <strong style="color: ${currentMetric === 'm3' ? '#ffcc00' : '#fff'};">${d.m3}</strong>
                           </div>
                       </div>
                   `);
        }

        // ==========================================
        // 6. 国家数据下钻渲染函数 (已加“获奖年份：”标注)
        // ==========================================
        function renderCountryDetail(cc, countryName, rawSummary, rawAuthorCountry) {
            d3.select("#country-detail-panel").style("display", "block");
            d3.select("#detail-country-name").text(countryName);
            const container = d3.select("#country-detail-content");
            container.html(""); 

            // 6.1 获取并处理该国机构列表
            const instsForCountry = rawSummary
                .filter(d => cleanCountryCode(d.country_code) === cc)
                .sort((a, b) => (+b.prize_paper_count || 0) - (+a.prize_paper_count || 0));

            let instHtml = instsForCountry.length ? instsForCountry.map(inst => `
                <div style="padding: 8px 0; border-bottom: 1px dashed rgba(129,115,97,0.15);">
                    <div style="font-size: 13px; font-weight: 600; color: #1e293b; margin-bottom: 3px;">
                        🏢 ${inst.institution_display_name || inst.institution_id}
                    </div>
                    <div style="font-size: 11px; color: #64748b;">
                        关联诺奖论文: <span style="color: #e15759; font-weight: bold;">${inst.prize_paper_count || 0}</span> 篇 | 
                        诺奖得主: <span style="color: #e15759; font-weight: bold;">${inst.associated_laureate_count || 0}</span> 位
                    </div>
                </div>
            `).join("") : `<div style="padding: 15px; color: #94a3b8; font-size: 12px; text-align: center; font-style: italic;">该国暂无直接登录的诺奖关联机构</div>`;

            // 6.2 获取该国的论文和诺奖得主
            const papersForCountry = rawAuthorCountry.filter(d => cleanCountryCode(d.country_code) === cc);
            const uniquePapers = new Map();
            const uniqueLaureates = new Map();

            papersForCountry.forEach(row => {
                if (row.nobel_title && row.laureate_name) {
                    const titleStr = row.nobel_title.trim().replace(/\b\w/g, char => char.toUpperCase());
                    let lName = row.laureate_name.trim().replace(/\b\w/g, char => char.toUpperCase());
                    const year = row.prize_year || "";

                    const paperKey = titleStr + "|||" + lName;
                    if (!uniquePapers.has(paperKey)) {
                        uniquePapers.set(paperKey, { title: titleStr, laureate: lName, year: year });
                    }

                    const laureateId = (row.laureate_id || lName).toLowerCase();
                    if (!uniqueLaureates.has(laureateId)) {
                        uniqueLaureates.set(laureateId, { name: lName, year: year });
                    }
                }
            });

            const paperArray = Array.from(uniquePapers.values());
            const laureateArray = Array.from(uniqueLaureates.values());

            // 拼接得主 HTML (加了获奖年份标签)
            let laureateHtml = laureateArray.length ? laureateArray.map(l => `
                <div style="padding: 8px 0; border-bottom: 1px dashed rgba(129,115,97,0.15); display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-size: 13px; font-weight: 600; color: #1e293b;">👤 ${l.name}</div>
                    ${l.year ? `<div style="font-size: 10px; color: #64748b; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">获奖年份：${l.year}</div>` : ""}
                </div>
            `).join("") : `<div style="padding: 15px; color: #94a3b8; font-size: 12px; text-align: center; font-style: italic;">该国暂无诺奖得主直属记录</div>`;

            // 拼接论文 HTML (加了获奖年份标签)
            let paperHtml = paperArray.length ? paperArray.map(p => `
                <div style="padding: 10px 0; border-bottom: 1px dashed rgba(129,115,97,0.15);">
                    <div style="font-size: 12px; font-weight: 600; color: #1e293b; line-height: 1.4; margin-bottom: 4px;">
                        📄 ${p.title}
                    </div>
                    <div style="font-size: 11px; color: #64748b;">
                        获奖者: <strong style="color: #426b8f;">${p.laureate}</strong> 
                        ${p.year ? `<span style="margin-left:6px; background:#e2e8f0; padding:1px 5px; border-radius:4px; font-size:10px;">获奖年份：${p.year}</span>` : ""}
                    </div>
                </div>
            `).join("") : `<div style="padding: 15px; color: #94a3b8; font-size: 12px; text-align: center; font-style: italic;">该国暂无代表性获奖论文数据</div>`;

            // 6.3 将三列内容注入到容器中
            const colStyle = "background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; max-height: 380px; overflow-y: auto; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);";
            const headerStyle = "font-size: 14px; font-weight: 800; color: #0f172a; margin-bottom: 12px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; position: sticky; top: -16px; background: #f8fafc; z-index: 10;";

            container.html(`
                <div style="${colStyle}">
                    <div style="${headerStyle}">🏫 顶尖关联机构 (${instsForCountry.length})</div>
                    ${instHtml}
                </div>
                <div style="${colStyle}">
                    <div style="${headerStyle}">🏅 诺奖得主名录 (${laureateArray.length})</div>
                    ${laureateHtml}
                </div>
                <div style="${colStyle}">
                    <div style="${headerStyle}">📚 代表获奖论文 (${paperArray.length})</div>
                    ${paperHtml}
                </div>
            `);

            document.getElementById("country-detail-panel").scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

    }).catch(err => {
        console.error("Map Data Loading Error:", err);
        mapContainer.html(`<div style="color:red; padding: 20px;">地图数据加载失败，请检查网络和数据路径。</div>`);
    });
}