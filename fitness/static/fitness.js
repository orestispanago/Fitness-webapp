// Garmin's ACWR statuses; cut-offs observed in the data, not documented
const ACWR_BANDS = [
  { from: null, to: 0.8, label: "LOW", color: "rgba(54, 162, 235, 0.12)" },
  { from: 0.8, to: 1.5, label: "OPTIMAL", color: "rgba(75, 192, 92, 0.15)" },
  { from: 1.5, to: null, label: "HIGH", color: "rgba(255, 99, 71, 0.15)" },
];

// Cooper Institute VO2max ratings, men aged 30–39, as used by Garmin
const VO2MAX_BANDS = [
  { from: null, to: 40.5, label: "POOR", color: "rgba(255, 99, 71, 0.12)" },
  { from: 40.5, to: 44, label: "FAIR", color: "rgba(255, 159, 64, 0.12)" },
  { from: 44, to: 48.3, label: "GOOD", color: "rgba(255, 205, 86, 0.15)" },
  { from: 48.3, to: 54, label: "EXCELLENT", color: "rgba(75, 192, 92, 0.15)" },
  { from: 54, to: null, label: "SUPERIOR", color: "rgba(54, 162, 235, 0.12)" },
];

const vo2maxChart = dailyLineChart("vo2max-chart", "VO2max", "ml/kg/min", [
  bandsPlugin(VO2MAX_BANDS),
]);
highlightPoints(
  vo2maxChart,
  VO2MAX_BANDS.find((band) => band.label === "EXCELLENT"),
  "rgb(75, 192, 92)",
);
dailyAverageChart("resting-hr-chart", "Resting HR", "bpm");
dailyAverageChart("hrv-chart", "HRV", "ms");
const WEIGHT_MARKERS = [{ date: "2026-10-07", label: "Creatine 5 g/day" }];

dailyAverageChart("weight-chart", "Weight", "kg", [
  markersPlugin(WEIGHT_MARKERS),
]);
const acwrChart = dailyLineChart("acwr-chart", "ACWR", "acute:chronic ratio", [
  bandsPlugin(ACWR_BANDS),
]);

acwrChart.options.scales.y.suggestedMax = 1.7;
highlightPoints(
  acwrChart,
  ACWR_BANDS.find((band) => band.label === "HIGH"),
  "rgb(255, 99, 71)",
);

// 419 -> "6:59"
function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = String(minutes % 60).padStart(2, "0");
  return `${hours}:${rest}`;
}

const sleepCanvas = document.getElementById("sleep-chart");
const sleepScales = dailyScales("min vs. need");
// Darker grid line at 0 = exactly the sleep need
sleepScales.y.grid = {
  color: (context) =>
    context.tick.value === 0 ? "rgba(0, 0, 0, 0.5)" : "rgba(0, 0, 0, 0.1)",
};

new Chart(sleepCanvas, {
  type: "bar",
  data: {
    datasets: [
      {
        label: "Sleep shortfall",
        data: JSON.parse(sleepCanvas.dataset.points),
        backgroundColor: (context) =>
          context.raw && context.raw.y < 0
            ? "rgba(255, 99, 71, 0.7)"
            : "rgba(75, 192, 92, 0.7)",
        order: 1,
      },
      {
        type: "line",
        label: "7-day average",
        data: JSON.parse(sleepCanvas.dataset.average),
        borderColor: "rgba(0, 0, 0, 0.7)",
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        pointRadius: 0,
        // Drawn on top of the bars
        order: 0,
      },
    ],
  },
  options: {
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    scales: sleepScales,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => {
            if (context.dataset.type === "line") {
              return `7-day average: ${Math.round(context.parsed.y)} min`;
            }
            return `${context.parsed.y} min (slept ${formatMinutes(context.raw.slept)})`;
          },
        },
      },
    },
  },
});
