// 448 -> "7:28"
function formatPace(secondsPerKm) {
  const rounded = Math.round(secondsPerKm);
  const minutes = Math.floor(rounded / 60);
  const seconds = String(rounded % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function plotPaceChart() {
  const canvas = document.getElementById("pace-chart");
  const scales = buildDailyScales("min/km");
  scales.y.ticks = { callback: (value) => formatPace(value) };
  return new Chart(canvas, {
    type: "line",
    data: {
      datasets: [{
        label: "Pace",
        data: JSON.parse(canvas.dataset.points),
      }],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: scales,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `Pace: ${formatPace(context.parsed.y)} /km`,
          },
        },
      },
    },
  });
}

// Colour per run_type (see SPEC.md); types missing here show in grey
const RUN_TYPE_COLORS = {
  // Same blue as the base-HR pace and decoupling lines
  "Base-HR": SERIES_BLUE,
  Threshold: "#eb6834",
  Base: "#1baf7a",
  Sprint: "#eda100",
  Recovery: "#e87ba4",
  "Threshold-HR": "#6250d6",
};
const OTHER_RUN_COLOR = "#8a8985";
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

// Triangles cover less area than circles of the same radius
function getRunRadius(run) {
  let radius = 7;
  if (getRunShape(run) === "triangle") {
    radius = 9;
  }
  return radius;
}

function getRunTypeColor(type) {
  return RUN_TYPE_COLORS[type] || OTHER_RUN_COLOR;
}

function getRunTypeLabel(type) {
  let label = type;
  if (type === null) {
    label = FREE_RUN_LABEL;
  }
  return label;
}

// Run types in legend order: the colour map's order, then types missing
// from it (in order of first appearance), then free runs (null)
function listRunTypes(runs) {
  const types = Object.keys(RUN_TYPE_COLORS);
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

function buildRunTypeDataset(type, runs) {
  const radii = [];
  const hoverRadii = [];
  const shapes = [];
  for (const run of runs) {
    radii.push(getRunRadius(run));
    hoverRadii.push(getRunRadius(run) + 2);
    shapes.push(getRunShape(run));
  }
  return {
    label: `${getRunTypeLabel(type)} (${runs.length})`,
    data: runs,
    backgroundColor: getRunTypeColor(type),
    borderColor: "#fff",
    borderWidth: 2,
    pointRadius: radii,
    pointHoverRadius: hoverRadii,
    pointStyle: shapes,
  };
}

// One dataset per run type that has runs, in listRunTypes order
function buildRunTypeDatasets(runs) {
  const groups = groupRunsByType(runs);
  const datasets = [];
  for (const type of listRunTypes(runs)) {
    const typeRuns = groups[String(type)];
    if (typeRuns === undefined) {
      continue;
    }
    datasets.push(buildRunTypeDataset(type, typeRuns));
  }
  return datasets;
}

function formatRunTooltip(context) {
  const run = context.raw;
  return `${run.name} · ${run.y} m/beat · ` +
    `${formatPace(run.pace)} /km at ${run.hr} bpm`;
}

function plotMetresPerBeatChart() {
  const canvas = document.getElementById("metres-per-beat-chart");
  const runs = JSON.parse(canvas.dataset.points);
  // Thin grey line joining all runs in date order, behind the dots
  const path = {
    type: "line",
    label: "path",
    data: runs,
    borderColor: GREYS.guide,
    borderWidth: 1,
    pointRadius: 0,
    pointHoverRadius: 0,
    order: 1,
  };
  const datasets = [path];
  for (const dataset of buildRunTypeDatasets(runs)) {
    datasets.push(dataset);
  }
  return new Chart(canvas, {
    type: "scatter",
    data: { datasets: datasets },
    options: {
      maintainAspectRatio: false,
      scales: buildDailyScales("metres per heartbeat"),
      plugins: {
        legend: {
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            // No legend entry for the path
            filter: (item) => item.datasetIndex > 0,
          },
        },
        tooltip: {
          filter: (item) => item.datasetIndex > 0,
          callbacks: { label: formatRunTooltip },
        },
      },
    },
  });
}

plotPaceChart();
plotDailyLineChart(
  "decoupling-chart", "Aerobic decoupling", "% efficiency lost",
);
plotMetresPerBeatChart();
