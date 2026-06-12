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
    // 1. 鍒濆鍖栧湴鍥剧敾甯?
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

    svgMap.append("rect").attr("class", "map-background").attr("width", width).attr("height", height);

    const mapZoomGroup = svgMap.append("g"); 
    const zoom = d3.zoom()
        .scaleExtent([1, 8]) 
        .on("zoom", (event) => {
            mapZoomGroup.attr("transform", event.transform);
        });
    svgMap.call(zoom);

    // 鍒濆鍖栨笎鍙樺浘渚嬪鍣?
    const legendWidth = 12;
    const legendHeight = 170;
    const legendG = svgMap.append("g")
        .attr("class", "map-legend")
        .attr("transform", `translate(28, ${height / 2 - legendHeight / 2})`);

    const defs = svgMap.append("defs");
    // 銆愪慨鏀圭偣銆戝浘渚嬬殑绾挎€ф笎鍙樼Щ闄や簡纭紪鐮佺殑鍒濆 stops锛屾敼涓哄湪鏇存柊鍑芥暟涓姩鎬佹覆鏌?
    const linearGradient = defs.append("linearGradient")
        .attr("id", "map-gradient")
        .attr("x1", "0%").attr("y1", "100%")
        .attr("x2", "0%").attr("y2", "0%");

    legendG.append("rect")
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .style("fill", "url(#map-gradient)")
        .style("stroke", "#cbd5e1")
        .style("stroke-width", 0.5);

    const legendAxisG = legendG.append("g")
        .attr("class", "legend-axis")
        .attr("transform", `translate(${legendWidth}, 0)`);

    // ==========================================
    // 2. 鍒濆鍖栨帓琛屾鐢诲竷
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

    function cleanCountryCode(rawCode) {
        let code = (rawCode || "").trim();
        if (code === "United States") code = "US";
        if (code.toLowerCase() === "nan") return null;
        return code.toUpperCase() || null;
    }

    Promise.all([
        d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"),
        d3.json("data_final/section3/country_map.json")
    ]).then(([worldData, dataset]) => {
        
        const combinedData = (dataset.countries || []).map(d => {
            const cc = cleanCountryCode(d.code);
            return {
                code: cc,
                name: countryNameMap[cc] || cc,
                m1: +d.m1 || 0,
                m2: +d.m2 || 0,
                m3: +d.m3 || 0,
                institutions: Array.isArray(d.institutions) ? d.institutions : [],
                laureates: Array.isArray(d.laureates) ? d.laureates : [],
                papers: Array.isArray(d.papers) ? d.papers : []
            };
        }).filter(d => d.code && (d.m1 > 0 || d.m2 > 0 || d.m3 > 0));

        const countryMetrics = new Map(combinedData.map(d => [d.code, d]));

        d3.select("#metric-country-count").text(combinedData.length);

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
            .attr("fill", "var(--bg-card)")
            .attr("stroke", "var(--chart-axis)")
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

        let currentMetric = "m1"; 

        d3.select("#country-sort-select").on("change", function() {
            currentMetric = this.value;
            
            // 銆愭柊澧炪€戝垏鎹㈡寚鏍囨椂锛屽己鍒舵敹璧峰苟闅愯棌搴曢儴鐨勫浗瀹剁鐮旀。妗堥潰鏉?
            d3.select("#country-detail-panel").style("display", "none");
            
            updateDashboard();
        });

        function updateDashboard() {
            const maxVal = d3.max(combinedData, d => d[currentMetric]) || 1;
            
            // 銆愪慨鏀圭偣銆戞墜鍔ㄦ寚瀹氱函姝ｇ殑钃濊壊绯绘笎鍙橈紝閬垮厤鍐呯疆鑹查樁鍙戠传鎴栧彂缁?
            let currentInterpolator;
            if (currentMetric === "m1") {
                // 娣遍們娴疯摑 (Ocean Blue: 娴呴潚 -> 婀栬摑)
                currentInterpolator = isEyeTheme()
                    ? d3.interpolate("#355f68", "#9bd8d8")
                    : d3.interpolate("#f0f9ff", "#0369a1"); 
            } else if (currentMetric === "m2") {
                // 缁忓吀绉戞妧钃?(Tech Blue: 娴呰摑 -> 瀹濊摑)
                currentInterpolator = isEyeTheme()
                    ? d3.interpolate("#4f4967", "#c5b5e3")
                    : d3.interpolate("#eff6ff", "#1d4ed8");  
            } else {
                // 楂樼骇钘忛潚/鐏拌摑 (Slate/Navy Blue: 娴呯伆鐧?-> 娣辫棌闈?
                currentInterpolator = isEyeTheme()
                    ? d3.interpolate("#59424f", "#e3a7ad")
                    : d3.interpolate("#f8fafc", "#426b8f");  
            }

            const colorScale = d3.scaleSequential(currentInterpolator).domain([0, Math.log1p(maxVal)]); 
            // 鎻愬彇鍑烘偓娴椂鐨勯珮浜鑹诧紙鍙栧綋鍓嶆笎鍙樻潯鐨勬渶娣辫壊锛?
            const activeHoverColor = currentInterpolator(1);

            // 銆愪慨鏀圭偣 2銆戝姩鎬佹洿鏂板彸涓嬭鍥句緥鐨勬笎鍙樻潯棰滆壊
            const stops = linearGradient.selectAll("stop").data(d3.range(0, 1.05, 0.05));
            stops.enter().append("stop")
                .merge(stops)
                .transition().duration(750) // 鍚屾娣诲姞杩囨浮鍔ㄧ敾
                .attr("offset", d => `${d * 100}%`)
                .attr("stop-color", d => currentInterpolator(d));

            // 鏇存柊鍦板浘棰滆壊
            mapPaths.transition("color").duration(750).attr("fill", d => {
                const cc = nameToAlpha2[d.properties.name];
                if (!cc || !countryMetrics.has(cc)) return cssVar("--bg-card"); 
                const val = countryMetrics.get(cc)[currentMetric];
                return val === 0 ? cssVar("--bg-card") : colorScale(Math.log1p(val));
            });

            // 鏇存柊鍙充笅瑙掑鏁板浘渚嬪潗鏍囪酱
            const axisScale = d3.scaleSymlog()
                .constant(1)
                .domain([0, maxVal])
                .range([legendHeight, 0]);

            // 銆愪慨鏀圭偣銆戝€熺敤绾挎€ф瘮渚嬪昂鐨?ticks 鏂规硶锛岃嚜鍔ㄧ敓鎴?3~4 涓鏁寸殑鏁板€硷紙濡?100, 200锛?
            // 杩囨护鎺夊甫鏈夊皬鏁扮殑鏁板€硷紝骞朵笖鎶婂ぇ浜庡綋鍓嶆渶澶у€肩殑婧㈠嚭鍒诲害涔熻繃婊ゆ帀
            let tickValues = d3.scaleLinear().domain([0, maxVal]).ticks(4)
                               .filter(Number.isInteger)
                               .filter(v => v <= maxVal);

            const legendAxis = d3.axisRight(axisScale)
                .tickValues(tickValues) 
                .tickFormat(d3.format(".0f"));

            legendAxisG.transition("layout").duration(600).call(legendAxis);
            legendAxisG.selectAll("text").style("font-size", "12px").style("fill", "var(--chart-label)");
            legendAxisG.selectAll("path, line").style("stroke", "var(--chart-axis)");

            // 鏇存柊鍙充晶鍥藉鎺掕姒?Top 10
            const sortedList = [...combinedData].sort((a, b) => b[currentMetric] - a[currentMetric]);
            const top10 = sortedList.slice(0, 10);

            xRank.domain([0, d3.max(top10, d => d[currentMetric]) || 1]);
            yRank.domain(top10.map(d => d.name));

            xRankAxisG.transition("layout").duration(600).call(d3.axisBottom(xRank).ticks(4));
            xRankAxisG.selectAll("text").style("font-size", "13px").style("fill", "var(--chart-label)");
            yRankAxisG.transition("layout").duration(600).call(d3.axisLeft(yRank))
                .selectAll("text").style("font-size", "14px").style("fill", "var(--chart-label)");

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
                .attr("fill", d => colorScale(Math.log1p(d[currentMetric]))); 
            
            barsEnter.merge(bars)
                .transition("layout").duration(600)
                .attr("y", d => yRank(d.name))
                .attr("height", yRank.bandwidth())
                .attr("width", d => xRank(d[currentMetric]))
                .attr("fill", d => colorScale(Math.log1p(d[currentMetric]))); 

            // --- 缁戝畾浜や簰 ---
            mapPaths.on("mouseover", function(event, d) {
                const cc = nameToAlpha2[d.properties.name];
                if (!cc || !countryMetrics.has(cc)) return;
                const cData = countryMetrics.get(cc);
                if (cData[currentMetric] === 0) return; 

                d3.select(this).raise().attr("stroke", "var(--chart-highlight)").attr("stroke-width", 1.5);
                // 銆愪慨鏀圭偣 3銆慔over鑹蹭篃浣跨敤褰撳墠娓愬彉鐨勬渶娣辫壊
                d3.selectAll(`.rank-bar-${cc}`).transition("hover").duration(150).attr("fill", activeHoverColor);
                showTooltip(event, cData);
            })
            .on("mousemove", function(event) {
                tooltip.style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 15) + "px");
            })
            .on("mouseout", function(event, d) {
                const cc = nameToAlpha2[d.properties.name];
                d3.select(this).attr("stroke", "var(--chart-axis)").attr("stroke-width", 0.5);
                
                if (cc && countryMetrics.has(cc)) {
                    const cData = countryMetrics.get(cc);
                    d3.selectAll(`.rank-bar-${cc}`).transition("hover").duration(150)
                      .attr("fill", colorScale(Math.log1p(cData[currentMetric])));
                }
                tooltip.style("opacity", 0).style("display", "none");
            })
            .on("click", function(event, d) {
                const cc = nameToAlpha2[d.properties.name];
                if (!cc || !countryMetrics.has(cc)) return;
                renderCountryDetail(cc, countryMetrics.get(cc));
            });

            barsEnter.merge(bars).on("mouseover", function(event, d) {
                // 銆愪慨鏀圭偣 3銆戝悓鐞嗘洿鏂版煴鐘跺浘鐨?Hover 鑹?
                d3.select(this).transition("hover").duration(150).attr("fill", activeHoverColor); 
                d3.selectAll(`.map-path-${d.code}`).raise().attr("stroke", "var(--chart-highlight)").attr("stroke-width", 1.5);
                showTooltip(event, d); 
            })
            .on("mousemove", function(event) {
                tooltip.style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 15) + "px");
            })
            .on("mouseout", function(event, d) {
                d3.select(this).transition("hover").duration(150).attr("fill", colorScale(Math.log1p(d[currentMetric])));
                d3.selectAll(`.map-path-${d.code}`).attr("stroke", "var(--chart-axis)").attr("stroke-width", 0.5);
                tooltip.style("opacity", 0).style("display", "none");
            })
            .on("click", function(event, d) {
                renderCountryDetail(d.code, d);
            });
        }

        updateDashboard();
        window.addEventListener("themechange", updateDashboard);

        function showTooltip(event, d) {
            const activeMetricName = metricConfig[currentMetric];
            tooltip.style("display", "block").style("opacity", 1)
                   .html(`
                       <div class="tooltip-title" style="font-size: 14px; margin-bottom: 8px;"> ${d.name} (${d.code})</div>
                       <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 4px;">当前指标: <span style="color: #fff; font-weight: bold;">${activeMetricName}</span></div>
                       <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.2);">
                           <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                               <span style="color: #cbd5e1;">诺奖关联机构数</span>
                               <strong style="color: ${currentMetric === 'm1' ? '#ffcc00' : '#fff'};">${d.m1}</strong>
                           </div>
                           <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                               <span style="color: #cbd5e1;">诺奖关联论文数</span>
                               <strong style="color: ${currentMetric === 'm2' ? '#ffcc00' : '#fff'};">${d.m2}</strong>
                           </div>
                           <div style="display: flex; justify-content: space-between;">
                               <span style="color: #cbd5e1;">诺奖获奖科学家数</span>
                               <strong style="color: ${currentMetric === 'm3' ? '#ffcc00' : '#fff'};">${d.m3}</strong>
                           </div>
                       </div>
                   `);
        }

        // ==========================================
        // 6. 鍥藉鏁版嵁涓嬮捇娓叉煋鍑芥暟
        // ==========================================
        function renderCountryDetail(cc, countryData) {
            d3.select("#country-detail-panel").style("display", "block");
            const countryName = (countryData && countryData.name) || cc;
            d3.select("#detail-country-name").text(countryName);
            const container = d3.select("#country-detail-content");
            container.html(""); 

            const instsForCountry = [...((countryData && countryData.institutions) || [])]
                .sort((a, b) => (+b.prize_paper_count || 0) - (+a.prize_paper_count || 0));

            let instHtml = instsForCountry.length ? instsForCountry.map(inst => `
                <div class="country-detail-item">
                    <div class="country-detail-name">
                         ${inst.name || inst.id}
                    </div>
                    <div class="country-detail-meta">
                        关联诺奖论文: <span class="country-detail-value">${inst.prize_paper_count || 0}</span> 篇 | 
                        诺奖得主: <span class="country-detail-value">${inst.associated_laureate_count || 0}</span> 位
                    </div>
                </div>
            `).join("") : `<div class="country-detail-empty">该国暂无直接登录的诺奖关联机构</div>`;

            const laureateArray = (countryData && countryData.laureates) || [];
            const paperArray = (countryData && countryData.papers) || [];

            let laureateHtml = laureateArray.length ? laureateArray.map(l => `
                <div class="country-detail-item country-detail-row">
                    <div class="country-detail-name"> ${l.name}</div>
                    ${l.year ? `<div class="country-detail-year">获奖年份：${l.year}</div>` : ""}
                </div>
            `).join("") : `<div class="country-detail-empty">该国暂无诺奖得主直属记录</div>`;

            let paperHtml = paperArray.length ? paperArray.map(p => `
                <div class="country-detail-item country-detail-paper">
                    <div class="country-detail-name">
                         ${p.title}
                    </div>
                    <div class="country-detail-meta">
                        获奖者 <strong>${p.laureate}</strong> 
                        ${p.year ? `<span class="country-detail-year">获奖年份：${p.year}</span>` : ""}
                    </div>
                </div>
            `).join("") : `<div class="country-detail-empty">该国暂无代表性获奖论文数据</div>`;

            container.html(`
                <div class="country-detail-column">
                    <div class="country-detail-title"> 顶尖关联机构 <span class="country-detail-badge">${instsForCountry.length}</span></div>
                    ${instHtml}
                </div>
                <div class="country-detail-column">
                    <div class="country-detail-title"> 诺奖得主名录 <span class="country-detail-badge">${laureateArray.length}</span></div>
                    ${laureateHtml}
                </div>
                <div class="country-detail-column">
                    <div class="country-detail-title"> 代表获奖论文 <span class="country-detail-badge">${paperArray.length}</span></div>
                    ${paperHtml}
                </div>
            `);

            document.getElementById("country-detail-panel").scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

    }).catch(err => {
        console.error("Map Data Loading Error:", err);
        mapContainer.html(`<div style="color:red; padding: 20px;">鍦板浘鏁版嵁鍔犺浇澶辫触锛岃妫€鏌ョ綉缁滃拰鏁版嵁璺緞銆?/div>`);
    });
}

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function isEyeTheme() {
    return document.documentElement.dataset.theme === "dark";
}
