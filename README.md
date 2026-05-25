# Nobel Prize Visualization

本项目为数据可视化第一小分队的初始框架，目标先搭建页面与布局，方便团队成员按模块分工补充图表内容。

## 项目结构

```
data-visualization/
├── index.html
├── README.md
├── css/
│   └── style.css
├── js/
│   ├── main.js
│   ├── charts/
│   │   ├── overview.js
│   │   ├── waitTime.js
│   │   └── specialAuthors.js
│   └── utils/
│       └── dataLoader.js
├── data/
└── assets/
```

## 页面模块说明

1. **职业生涯阶段与认可**
   - 左侧：宏观总览（学科筛选）
   - 右侧：科学家个体生涯轨迹与列表切换
   - 该模块的交互核心是“左宏观控制右微观”。

2. **等待时间影响因素探索**
   - 下拉框筛选：职业年龄、机构国家、期刊类型
   - 展示 wait_time 的不同影响因素子图

3. **特殊作者模块**
   - 预留特殊作者轨迹或作者分类展示位置
   - 适用于标志性人物、团队或特殊贡献分析

## 本地运行

在项目根目录运行：

```bash
python -m http.server 8000
```

然后打开：

```
http://localhost:8000
```

## 分工操作

- **成员 A**：负责 `js/charts/overview.js`、`#career-overview` 和 `#career-detail` 区块的布局与交互。前端页面中的 `career-field-filter` 与 `career-scientist-select` 是该模块的控制入口。
- **成员 B**：负责 `js/charts/waitTime.js`、`#section-waittime` 下的因子图表布局和下拉框筛选逻辑。可在 `waittime-age-filter`、`waittime-country-filter`、`waittime-journal-filter` 中补充交互。
- **成员 C**：负责 `js/charts/specialAuthors.js`、`#section-special` 的特殊作者展示区。

## 开发提示

- 目前页面只搭建了框架与占位区域，未填充真实数据、坐标轴或颜色设计。
- 具体图表可根据团队分工先在 `js/charts/` 中补充独立渲染函数，最后由 `js/main.js` 统一初始化。
- 若后续增加数据目录，请将原始 CSV/JSON 放入 `data/` 目录，并使用 `js/utils/dataLoader.js` 读取。
