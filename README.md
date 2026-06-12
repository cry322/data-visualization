# Nobel Prize Visualization

本项目用于展示诺奖论文、获奖科学家的职业轨迹、论文等待时间、机构影响力、机构合作网络与知识迁移等可视化结果。

为了便于 GitHub 部署，原始大数据文件保留在本地 `data/` 目录中，不进入 Git；页面实际读取的是 `data_final/` 中按图表整理后的精简数据。

## 项目结构

```text
data-visualization/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── main.js
│   ├── charts/
│   └── utils/
├── data_final/
│   ├── section1/
│   ├── section2/
│   ├── section3/
│   └── section4/
└── data/              # 本地原始数据，不提交到 Git
```

## 页面模块说明

### 1. 职业阶段与认可

展示获奖科学家的职业阶段、论文发表与获奖时间线。

主要数据：
- `data_final/section1/career_overview.csv`：约 536 行，用于总体概览。
- `data_final/section1/career_detail.csv`：约 17,407 行，用于个人职业轨迹细节。

核心字段包括获奖人 ID、姓名、学科、发表年份、获奖年份、职业阶段、论文数量等。

### 2. 等待时间图

展示诺奖论文从发表到获奖之间的等待时间，并支持学科筛选和 Y 轴指标切换。

主要数据：
- `data_final/section2/wait_time.json`：约 790 条获奖论文散点。

核心字段包括获奖人、学科、发表年份、获奖年份、等待时间、论文标题、机构、国家、期刊/source，以及预先计算好的 `prePrizePublicationCount` 和 `careerAgeAtPaper`。

### 3. 机构与国家影响力

包括机构影响力概览和国家地图两部分。

主要数据：
- `data_final/section3/institution_overview.json`：约 318 个机构。
- `data_final/section3/country_map.json`：约 32 个国家/地区。

机构图核心字段包括机构名称、国家、获奖论文数、关联获奖者数、关联科学家数、总发文量、总被引量、学科标签和关联论文列表。

国家地图核心字段包括国家代码、机构数、论文数、获奖者数，以及详情面板所需的机构和获奖者列表。

### 4. 机构合作与知识迁移

包括机构合作网络、机构-学科桑基图，以及主题迁移相关图。

主要数据：
- `data_final/section4/institution_network.json`：约 318 个机构节点，约 51,194 条机构合作边。
- `data_final/section4/institution_sankey.json`：约 571 行机构-学科关系数据。
- `data_final/section4/topic_migration_field_domain_agg.csv`：约 773 行，用于 field 层级桑基图。
- `data_final/section4/topic_migration_subfield_domain_agg.csv`：约 10,828 行，用于 subfield 层级弧线图。

核心字段包括机构 ID、机构名称、国家、合作权重、学科、领域迁移方向、迁移次数和占比等。


## 本地运行

在项目根目录启动静态服务器：

```bash
python -m http.server 8000
```

然后在浏览器打开：

```text
http://localhost:8000
```
