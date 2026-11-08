// 448 -> "7:28"
function formatPace(secondsPerKm) {
  const rounded = Math.round(secondsPerKm);
  const minutes = Math.floor(rounded / 60);
  const seconds = String(rounded % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

// [date, value] pairs from {x, y} points
function buildPairs(points) {
  const pairs = [];
  for (const point of points) {
    pairs.push([point.x, point.y]);
  }
  return pairs;
}

function formatPaceTooltip(params) {
  const pair = params[0].value;
  return `${pair[0]}<br>Pace: ${formatPace(pair[1])} /km`;
}

function plotPaceChart() {
  const element = document.getElementById("pace-chart");
  const subtitle = buildSubtitle(element, (value) => `${formatPace(value)} /km`);
  const chart = echarts.init(element);
  chart.setOption({
    title: { text: element.dataset.title, subtext: subtitle.text },
    // Kept inside the chart, so it doesn't run off a phone screen
    tooltip: { trigger: "axis", formatter: formatPaceTooltip, confine: true },
    // At least a month between ticks, so day and month labels don't collide
    xAxis: { type: "time", minInterval: 28 * 24 * 3600 * 1000 },
    // Smaller bottom margin than the default, for a taller plot
    grid: { top: 60, bottom: 30 },
    yAxis: {
      type: "value",
      scale: true,
      // About 3 intervals rather than 5, so labels don't crowd
      splitNumber: 3,
      axisLabel: { formatter: (value) => formatPace(value) },
    },
    series: [{
      name: "Pace",
      type: "line",
      data: buildPairs(JSON.parse(element.dataset.points)),
    }],
  });
  return chart;
}

// Run types in legend order (see SPEC.md); free runs (null) last
const RUN_TYPES = ["Base-HR", "Threshold", "Base", "Sprint", "Recovery", "Threshold-HR"];
const FREE_RUN_LABEL = "Free run";
// Runs here (or without a location) are circles, elsewhere triangles
const HOME_LOCATION = "Jeddah";

function getRunShape(run) {
  let shape = "triangle";
  if (run.location === null || run.location === HOME_LOCATION) {
    shape = "circle";
  }
  return shape;
}

function getRunTypeLabel(type) {
  let label = type;
  if (type === null) {
    label = FREE_RUN_LABEL;
  }
  return label;
}

// Run types in legend order: RUN_TYPES, then types missing from it (in
// order of first appearance), then free runs (null)
function listRunTypes(runs) {
  const types = RUN_TYPES.slice();
  for (const run of runs) {
    if (run.type !== null && !types.includes(run.type)) {
      types.push(run.type);
    }
  }
  types.push(null);
  return types;
}

// {type: [run, ...]}; free runs (no type) under the key "null"
function groupRunsByType(runs) {
  const groups = {};
  for (const run of runs) {
    const key = String(run.type);
    if (groups[key] === undefined) {
      groups[key] = [];
    }
    groups[key].push(run);
  }
  return groups;
}

// One scatter series per run type; the whole run rides along for the tooltip
function buildRunTypeSeries(type, runs) {
  const data = [];
  for (const run of runs) {
    data.push({ value: [run.x, run.y], symbol: getRunShape(run), run: run });
  }
  return {
    name: `${getRunTypeLabel(type)} (${runs.length})`,
    type: "scatter",
    data: data,
  };
}

// One series per run type that has runs, in listRunTypes order
function buildRunTypeSeriesList(runs) {
  const groups = groupRunsByType(runs);
  const seriesList = [];
  for (const type of listRunTypes(runs)) {
    const typeRuns = groups[String(type)];
    if (typeRuns === undefined) {
      continue;
    }
    seriesList.push(buildRunTypeSeries(type, typeRuns));
  }
  return seriesList;
}

// The date, the weather when the run has a report, then the run
function formatRunTooltip(params) {
  const run = params.data.run;
  const lines = [run.x];
  if (run.temp !== null) {
    lines.push(`${Math.round(run.temp)} °C, feels ${Math.round(run.feels)} °C, ` +
      `${run.humidity}% RH`);
  }
  lines.push(run.name);
  lines.push(`${run.y} m/beat`);
  lines.push(`${formatPace(run.pace)} / km at ${run.hr} bpm`);
  return lines.join("<br>");
}

function plotMetresPerBeatChart() {
  const element = document.getElementById("metres-per-beat-chart");
  const runs = JSON.parse(element.dataset.points);
  // Line joining all runs in date order; no tooltip or legend entry
  const path = {
    type: "line",
    data: buildPairs(runs),
    symbol: "none",
    silent: true,
    tooltip: { show: false },
  };
  const seriesList = [path];
  for (const series of buildRunTypeSeriesList(runs)) {
    seriesList.push(series);
  }
  const chart = echarts.init(element);
  chart.setOption({
    baseOption: {
      title: { text: element.dataset.title, subtext: buildSubtitle(element).text },
      tooltip: { formatter: formatRunTooltip, confine: true },
      // Compact legend below the plot
      legend: {
        bottom: 0,
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 8,
        textStyle: { fontSize: 11 },
      },
      xAxis: {
        type: "time",
        // At least a month between ticks, so day and month labels don't collide
        minInterval: 28 * 24 * 3600 * 1000,
        // Vertical crosshair at the nearest run's date
        axisPointer: { show: true, snap: true },
      },
      grid: { top: 60 },
      // About 3 intervals rather than 5, so labels don't crowd
      yAxis: { type: "value", scale: true, splitNumber: 3 },
      series: seriesList,
    },
    // ECharts reserves no room for the legend: 2 rows on a phone, 1 wider
    media: [
      { query: { maxWidth: 500 }, option: { grid: { bottom: 70 } } },
      { option: { grid: { bottom: 55 } } },
    ],
  });
  return chart;
}

const charts = [plotPaceChart(), plotMetresPerBeatChart()];

// ECharts doesn't follow its container's size by itself
window.addEventListener("resize", () => {
  for (const chart of charts) {
    chart.resize();
  }
});
