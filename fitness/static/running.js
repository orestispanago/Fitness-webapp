// 448 -> "7:28"
function formatPace(secondsPerKm) {
  const rounded = Math.round(secondsPerKm);
  const minutes = Math.floor(rounded / 60);
  const seconds = String(rounded % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

const paceCanvas = document.getElementById("pace-chart");
const paceScales = dailyScales("min/km");
paceScales.y.ticks = { callback: (value) => formatPace(value) };

new Chart(paceCanvas, {
  type: "line",
  data: {
    datasets: [{
      label: "Pace",
      data: JSON.parse(paceCanvas.dataset.points),
    }],
  },
  options: {
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    scales: paceScales,
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

dailyLineChart("decoupling-chart", "Aerobic decoupling", "% efficiency lost");

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

function runShape(run) {
  if (run.location === null || run.location === HOME_LOCATION) {
    return "circle";
  }
  return "triangle";
}

// Triangles cover less area than circles of the same radius
function runRadius(run) {
  if (runShape(run) === "triangle") {
    return 9;
  }
  return 7;
}

// One dataset per run type: the colour map's order, then unmapped types,
// then free runs (no type)
function runTypeDatasets(runs) {
  const types = Object.keys(RUN_TYPE_COLORS);
  runs.forEach((run) => {
    if (run.type !== null && !types.includes(run.type)) {
      types.push(run.type);
    }
  });
  types.push(null);
  const datasets = [];
  types.forEach((type) => {
    const data = runs.filter((run) => run.type === type);
    if (data.length === 0) {
      return;
    }
    const label = type === null ? FREE_RUN_LABEL : type;
    datasets.push({
      label: `${label} (${data.length})`,
      data: data,
      backgroundColor: RUN_TYPE_COLORS[type] || OTHER_RUN_COLOR,
      borderColor: "#fff",
      borderWidth: 2,
      pointRadius: data.map(runRadius),
      pointHoverRadius: data.map((run) => runRadius(run) + 2),
      pointStyle: data.map(runShape),
    });
  });
  return datasets;
}

const beatCanvas = document.getElementById("metres-per-beat-chart");
const beatRuns = JSON.parse(beatCanvas.dataset.points);
// Thin grey line joining all runs in date order, behind the dots
const beatPath = {
  type: "line",
  label: "path",
  data: beatRuns,
  borderColor: GREYS.guide,
  borderWidth: 1,
  pointRadius: 0,
  pointHoverRadius: 0,
  order: 1,
};

new Chart(beatCanvas, {
  type: "scatter",
  data: { datasets: [beatPath].concat(runTypeDatasets(beatRuns)) },
  options: {
    maintainAspectRatio: false,
    scales: dailyScales("metres per heartbeat"),
    plugins: {
      legend: {
        labels: {
          usePointStyle: true,
          pointStyle: "circle",
          filter: (item) => item.datasetIndex > 0,
        },
      },
      tooltip: {
        filter: (item) => item.datasetIndex > 0,
        callbacks: {
          label: (context) => {
            const run = context.raw;
            return `${run.name} · ${run.y} m/beat · ` +
              `${formatPace(run.pace)} /km at ${run.hr} bpm`;
          },
        },
      },
    },
  },
});
