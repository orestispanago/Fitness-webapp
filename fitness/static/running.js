// 448 -> "7:28"
function formatPace(secondsPerKm) {
  const rounded = Math.round(secondsPerKm);
  const minutes = Math.floor(rounded / 60);
  const seconds = String(rounded % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatPaceTooltip(params) {
  const pace = params[0].value[1];
  return `${params[0].axisValueLabel}<br>Pace: ${formatPace(pace)} /km`;
}

function plotPaceChart() {
  const element = document.getElementById("pace-chart");
  const subtitle = buildSubtitle(element, (value) => `${formatPace(value)} /km`);
  const option = buildChartOption(element, subtitle.text);
  option.tooltip.formatter = formatPaceTooltip;
  option.yAxis.axisLabel = { formatter: (value) => formatPace(value) };
  option.series = [{
    name: "Pace",
    type: "line",
    data: buildPairs(JSON.parse(element.dataset.points)),
    // Small filled dots on a thinner line, as on VO2max (see SPEC.md)
    symbol: "circle",
    symbolSize: 3,
    lineStyle: { width: 1.5 },
  }];
  return plotChart(element, option);
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
    // Small filled dots on a 1.5 px line, as on VO2max (see SPEC.md)
    symbol: "circle",
    symbolSize: 3,
    lineStyle: { width: 1.5 },
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
    // Smaller than ECharts' 10 px default (see SPEC.md)
    symbolSize: 5,
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
  const lines = [params[0].axisValueLabel];
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
  const option = buildChartOption(element, buildSubtitle(element).text);
  option.tooltip.formatter = formatRunTooltip;
  // Compact legend below the plot
  option.legend = {
    bottom: 0,
    itemWidth: 10,
    itemHeight: 10,
    itemGap: 8,
    textStyle: { fontSize: 11 },
  };
  // Bottom margin set by width below
  option.grid = { top: 60 };
  option.series = [buildAllRunsSeries(runs)];
  for (const highlight of HIGHLIGHTS) {
    option.series.push(buildHighlightSeries(runs, highlight));
  }
  return plotChart(element, {
    baseOption: option,
    // ECharts reserves no room for the legend: 2 rows on a phone, 1 wider
    media: [
      { query: { maxWidth: 500 }, option: { grid: { bottom: 75 } } },
      { option: { grid: { bottom: 55 } } },
    ],
  });
}

plotPaceChart();
plotMetresPerBeatChart();
