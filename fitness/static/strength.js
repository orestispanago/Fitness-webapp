// ECharts spike: default ECharts styling (see SPEC.md for the Chart.js version)

// [date, value] pairs from one key of each trend point ("min", "avg")
function buildTrendSeries(points, key) {
  const series = [];
  for (const point of points) {
    series.push([point.x, point[key]]);
  }
  return series;
}

// [date, max - min] pairs, stacked on the lightest set to draw the band
function buildBandHeights(points) {
  const series = [];
  for (const point of points) {
    series.push([point.x, point.max - point.min]);
  }
  return series;
}

function formatTrendTooltip(points, params) {
  const point = points[params[0].dataIndex];
  return [
    point.x,
    `Max ${point.max} kg`,
    `Average ${point.avg} kg`,
    `Min ${point.min} kg`,
  ].join("<br>");
}

// The session that first reached the current heaviest set, or null if no
// session beat the first one
function findRecordPoint(points) {
  let record = null;
  let best = points[0].max;
  for (const point of points.slice(1)) {
    if (point.max > best) {
      best = point.max;
      record = point;
    }
  }
  return record;
}

// One exercise per chart: the average set as a line, with a band from the
// lightest to the heaviest set behind it and the PR in the subtitle
function plotExerciseTrendChart(element) {
  const points = JSON.parse(element.dataset.points);
  const subtitle = buildDatedSubtitle(
    findRecordPoint(points),
    (point) => `PR ${point.max} kg`,
  );
  const chart = echarts.init(element);
  chart.setOption({
    title: { text: element.dataset.title, subtext: subtitle.text },
    tooltip: {
      trigger: "axis",
      formatter: (params) => formatTrendTooltip(points, params),
    },
    // At least a month between ticks, so day and month labels don't collide
    xAxis: { type: "time", minInterval: 28 * 24 * 3600 * 1000 },
    // Smaller bottom margin than the default, for a taller plot
    grid: { top: 60, bottom: 30 },
    // About 3 intervals rather than 5, so labels don't crowd
    yAxis: { type: "value", scale: true, splitNumber: 3 },
    series: [
      {
        name: "Lightest set",
        type: "line",
        data: buildTrendSeries(points, "min"),
        stack: "band",
        symbol: "none",
        lineStyle: { opacity: 0 },
      },
      {
        name: "Heaviest set",
        type: "line",
        data: buildBandHeights(points),
        stack: "band",
        symbol: "none",
        lineStyle: { opacity: 0 },
        areaStyle: {},
      },
      {
        name: "Average set",
        type: "line",
        data: buildTrendSeries(points, "avg"),
      },
    ],
  });
  return chart;
}

const charts = [];
for (const element of document.querySelectorAll(".exercise-chart")) {
  charts.push(plotExerciseTrendChart(element));
}

// ECharts doesn't follow its container's size by itself
window.addEventListener("resize", () => {
  for (const chart of charts) {
    chart.resize();
  }
});
