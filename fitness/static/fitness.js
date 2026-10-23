// Garmin's ACWR statuses; cut-offs observed in the data, not documented
const ACWR_BANDS = [
  { from: null, to: 0.8, label: "LOW", color: "rgba(54, 162, 235, 0.12)" },
  { from: 0.8, to: 1.5, label: "OPTIMAL", color: "rgba(75, 192, 92, 0.15)" },
  { from: 1.5, to: null, label: "HIGH", color: "rgba(255, 99, 71, 0.15)" },
];

dailyLineChart("vo2max-chart", "VO2max", "ml/kg/min");
dailyLineChart("resting-hr-chart", "Resting HR", "bpm");
dailyLineChart("hrv-chart", "HRV", "ms");
const WEIGHT_MARKERS = [{ date: "2026-10-07", label: "Creatine 5 g/day" }];

dailyLineChart("weight-chart", "Weight", "kg", [markersPlugin(WEIGHT_MARKERS)]);
const acwrChart = dailyLineChart("acwr-chart", "ACWR", "acute:chronic ratio", [
  bandsPlugin(ACWR_BANDS),
]);

// Points in the HIGH band in red; the rest keep the line's colour
const acwrHigh = ACWR_BANDS.find((band) => band.label === "HIGH").from;
const acwrDataset = acwrChart.data.datasets[0];
acwrDataset.pointBackgroundColor = (context) =>
  context.raw && context.raw.y >= acwrHigh
    ? "rgb(255, 99, 71)"
    : context.dataset.backgroundColor;
acwrDataset.pointBorderColor = (context) =>
  context.raw && context.raw.y >= acwrHigh
    ? "rgb(255, 99, 71)"
    : context.dataset.borderColor;

acwrChart.options.scales.y.suggestedMax = 1.7;
acwrChart.update();

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
    datasets: [{
      label: "Sleep shortfall",
      data: JSON.parse(sleepCanvas.dataset.points),
      backgroundColor: (context) =>
        context.raw && context.raw.y < 0
          ? "rgba(255, 99, 71, 0.7)"
          : "rgba(75, 192, 92, 0.7)",
    }],
  },
  options: {
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    scales: sleepScales,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => `${context.parsed.y} min`,
        },
      },
    },
  },
});
