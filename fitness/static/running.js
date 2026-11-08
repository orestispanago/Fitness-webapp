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

// Highlighted runs, in legend order; the rest show only as grey points
const HIGHLIGHTS = ["Base-HR", "Threshold-HR", "Laganas"];
const ALL_RUNS_COLOR = "#b0b0b0";

// The highlight a run belongs to (its type, else its location), or null
function getRunHighlight(run) {
  let highlight = null;
  if (HIGHLIGHTS.includes(run.type)) {
    highlight = run.type;
  } else if (HIGHLIGHTS.includes(run.location)) {
    highlight = run.location;
  }
  return highlight;
}

// Grey line and points through all runs; it alone carries the tooltip, so
// the tooltip shows one run per date, as on the pace chart
function buildAllRunsSeries(runs) {
  const data = [];
  for (const run of runs) {
    data.push({ value: [run.x, run.y], run: run });
  }
  return {
    name: "All runs",
    type: "line",
    data: data,
    color: ALL_RUNS_COLOR,
    lineStyle: { width: 1 },
  };
}

// The runs of one highlight as coloured points on top of the grey ones
function buildHighlightSeries(runs, highlight) {
  const data = [];
  for (const run of runs) {
    if (getRunHighlight(run) === highlight) {
      data.push([run.x, run.y]);
    }
  }
  return {
    name: `${highlight} (${data.length})`,
    type: "scatter",
    data: data,
    tooltip: { show: false },
    z: 3,
  };
}

// The date, the weather when the run has a report, then the run
function formatRunTooltip(params) {
  let run = null;
  for (const item of params) {
    if (item.seriesIndex === 0) {
      run = item.data.run;
    }
  }
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
  const seriesList = [buildAllRunsSeries(runs)];
  for (const highlight of HIGHLIGHTS) {
    seriesList.push(buildHighlightSeries(runs, highlight));
  }
  const chart = echarts.init(element);
  chart.setOption({
    baseOption: {
      title: { text: element.dataset.title, subtext: buildSubtitle(element).text },
      tooltip: { trigger: "axis", formatter: formatRunTooltip, confine: true },
      // Compact legend below the plot
      legend: {
        bottom: 0,
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 8,
        textStyle: { fontSize: 11 },
      },
      // At least a month between ticks, so day and month labels don't collide
      xAxis: { type: "time", minInterval: 28 * 24 * 3600 * 1000 },
      grid: { top: 60 },
      // About 3 intervals rather than 5, so labels don't crowd
      yAxis: { type: "value", scale: true, splitNumber: 3 },
      series: seriesList,
    },
    // ECharts reserves no room for the legend: 2 rows on a phone, 1 wider
    media: [
      { query: { maxWidth: 500 }, option: { grid: { bottom: 75 } } },
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
