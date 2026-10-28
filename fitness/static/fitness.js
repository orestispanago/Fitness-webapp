// Garmin's ACWR statuses; cut-offs observed in the data, not documented
const ACWR_BANDS = [
  {
    from: null,
    to: 0.8,
    label: "LOW",
    color: getStatusColor("blue", 0.12),
  },
  {
    from: 0.8,
    to: 1.5,
    label: "OPTIMAL",
    color: getStatusColor("green", 0.15),
  },
  {
    from: 1.5,
    to: null,
    label: "HIGH",
    color: getStatusColor("red", 0.15),
  },
];

// Cooper Institute VO2max ratings, men aged 30–39, as used by Garmin
const VO2MAX_BANDS = [
  {
    from: null,
    to: 40.5,
    label: "POOR",
    color: getStatusColor("red", 0.12),
  },
  {
    from: 40.5,
    to: 44,
    label: "FAIR",
    color: getStatusColor("orange", 0.12),
  },
  {
    from: 44,
    to: 48.3,
    label: "GOOD",
    color: getStatusColor("yellow", 0.15),
  },
  {
    from: 48.3,
    to: 54,
    label: "EXCELLENT",
    color: getStatusColor("green", 0.15),
  },
  {
    from: 54,
    to: null,
    label: "SUPERIOR",
    color: getStatusColor("blue", 0.12),
  },
];

const WEIGHT_MARKERS = [{ date: "2026-10-07", label: "Creatine 5 g/day" }];

// 419 -> "6:59"
function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = String(minutes % 60).padStart(2, "0");
  return `${hours}:${rest}`;
}

// Garmin's HRV baseline, behind the dots (see SPEC.md): one edge as a
// dataset, filled down to the dataset at index fill (false = no fill)
function buildHrvBandDataset(days, label, key, fill, color) {
  return {
    label: label,
    data: days,
    parsing: { yAxisKey: key },
    borderColor: GREYS.guide,
    borderWidth: 1,
    pointRadius: 0,
    pointHoverRadius: 0,
    backgroundColor: color,
    fill: fill,
    order: 2,
  };
}

// Dashed LOW limit, the strip down to it (yellow) and the balanced range
// (green); firstIndex is where the first one goes in the chart's datasets
function buildHrvBandDatasets(days, firstIndex) {
  const lowLimit = buildHrvBandDataset(
    days, "LOW limit", "low_upper", false, "transparent",
  );
  lowLimit.borderDash = [4, 4];
  const lowStrip = buildHrvBandDataset(
    days, "Unbalanced (low)", "balanced_low", firstIndex,
    getStatusColor("yellow", 0.2),
  );
  const balanced = buildHrvBandDataset(
    days, "Balanced range", "balanced_upper", firstIndex + 1,
    getStatusColor("green", 0.18),
  );
  return [lowLimit, lowStrip, balanced];
}

function getHrvRingColor(status) {
  let color = getStatusColor("orange");
  if (status === "LOW") {
    color = getStatusColor("red");
  }
  return color;
}

// Rings on the 7-day line where Garmin's status isn't BALANCED: status
// follows the 7-day average, not single nights
function buildHrvRingDataset(days, average) {
  const rings = [];
  const ringColors = [];
  for (let index = 0; index < days.length; index += 1) {
    const status = days[index].status;
    if (status === "UNBALANCED" || status === "LOW") {
      rings.push(average[index]);
      ringColors.push(getHrvRingColor(status));
    }
  }
  return {
    label: "Not balanced (Garmin)",
    data: rings,
    showLine: false,
    pointRadius: 7,
    pointHoverRadius: 7,
    pointBackgroundColor: "transparent",
    backgroundColor: "transparent",
    pointBorderColor: ringColors,
    borderColor: getStatusColor("orange"),
    pointBorderWidth: 2,
    order: 0,
  };
}

// Tooltip for the dots and the 7-day line only, naming Garmin's status
function buildHrvTooltip(days, firstBandIndex) {
  return {
    filter: (item) => item.datasetIndex < firstBandIndex,
    callbacks: {
      footer: (items) => {
        const status = days[items[0].dataIndex].status;
        return `Garmin status: ${status || "none (calibrating)"}`;
      },
    },
  };
}

function addHrvBaseline(chart) {
  const days = JSON.parse(chart.canvas.dataset.baseline);
  const average = JSON.parse(chart.canvas.dataset.average);
  const datasets = chart.data.datasets;
  const firstBandIndex = datasets.length;
  for (const dataset of buildHrvBandDatasets(days, firstBandIndex)) {
    datasets.push(dataset);
  }
  datasets.push(buildHrvRingDataset(days, average));
  chart.options.plugins.tooltip = buildHrvTooltip(days, firstBandIndex);
  chart.update();
}

// Red for nights short of the sleep need, green otherwise
function getShortfallColor(context) {
  let color = getStatusColor("green", 0.7);
  if (context.raw && context.raw.y < 0) {
    color = getStatusColor("red", 0.7);
  }
  return color;
}

// Darker grid line at 0 = exactly the sleep need
function getShortfallGridColor(context) {
  let color = GREYS.grid;
  if (context.tick.value === 0) {
    color = GREYS.strong;
  }
  return color;
}

function formatShortfallTooltip(context) {
  let text = "";
  if (context.dataset.type === "line") {
    text = `7-day average: ${Math.round(context.parsed.y)} min`;
  } else {
    const slept = formatMinutes(context.raw.slept);
    text = `${context.parsed.y} min (slept ${slept})`;
  }
  return text;
}

function plotSleepChart() {
  const canvas = document.getElementById("sleep-chart");
  const scales = buildDailyScales();
  scales.y.grid = { color: getShortfallGridColor };
  return new Chart(canvas, {
    type: "bar",
    data: {
      datasets: [
        {
          label: "Sleep shortfall",
          data: JSON.parse(canvas.dataset.points),
          backgroundColor: getShortfallColor,
          order: 1,
        },
        {
          type: "line",
          label: "7-day average",
          data: JSON.parse(canvas.dataset.average),
          // Blue like the VO2max line; pink-red blends into the red bars
          borderColor: SERIES_BLUE,
          backgroundColor: SERIES_BLUE,
          pointRadius: 0,
          // Drawn on top of the bars
          order: 0,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: scales,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: formatShortfallTooltip } },
      },
    },
  });
}

const vo2maxChart = plotDailyLineChart("vo2max-chart", "VO2max", [
  createBandsPlugin(VO2MAX_BANDS),
]);
highlightPoints(
  vo2maxChart,
  findBand(VO2MAX_BANDS, "EXCELLENT"),
  getStatusColor("green"),
);

plotDailyAverageChart("resting-hr-chart", "Resting HR");

const hrvChart = plotDailyAverageChart("hrv-chart", "HRV");
addHrvBaseline(hrvChart);

plotDailyAverageChart("weight-chart", "Weight", [
  createMarkersPlugin(WEIGHT_MARKERS),
]);

plotSleepChart();

const acwrChart = plotDailyLineChart(
  "acwr-chart", "ACWR",
  [createBandsPlugin(ACWR_BANDS)],
);
acwrChart.options.scales.y.suggestedMax = 1.7;
highlightPoints(acwrChart, findBand(ACWR_BANDS, "HIGH"), getStatusColor("red"));
