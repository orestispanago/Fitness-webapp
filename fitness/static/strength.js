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
    params[0].axisValueLabel,
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
  const option = buildChartOption(element, subtitle.text);
  option.tooltip = {
    trigger: "axis",
    formatter: (params) => formatTrendTooltip(points, params),
  };
  option.series = [
    {
      name: "Lightest set",
      type: "line",
      data: buildPairs(points, "min"),
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
      data: buildPairs(points, "avg"),
    },
  ];
  return plotChart(element, option);
}

for (const element of document.querySelectorAll(".exercise-chart")) {
  plotExerciseTrendChart(element);
}
