// Garmin's ACWR statuses; cut-offs observed in the data, not documented
const ACWR_BANDS = [
  { from: null, to: 0.8, label: "LOW", color: "rgba(54, 162, 235, 0.12)" },
  { from: 0.8, to: 1.5, label: "OPTIMAL", color: "rgba(75, 192, 92, 0.15)" },
  { from: 1.5, to: null, label: "HIGH", color: "rgba(255, 99, 71, 0.15)" },
];

dailyLineChart("vo2max-chart", "VO2max", "ml/kg/min");
dailyLineChart("resting-hr-chart", "Resting HR", "bpm");
dailyLineChart("hrv-chart", "HRV", "ms");
dailyLineChart("weight-chart", "Weight", "kg");
const acwrChart = dailyLineChart("acwr-chart", "ACWR", "acute:chronic ratio", [
  bandsPlugin(ACWR_BANDS),
]);

acwrChart.options.scales.y.suggestedMax = 1.7;
acwrChart.update();

// 7.27 -> "7h 16m"
function formatHours(hours) {
  if (hours === null) {
    return "no data";
  }
  const totalMinutes = Math.round(hours * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${wholeHours}h ${minutes}m`;
}

const sleepCanvas = document.getElementById("sleep-chart");

new Chart(sleepCanvas, {
  type: "line",
  data: {
    datasets: [
      {
        label: "Sleep",
        data: JSON.parse(sleepCanvas.dataset.duration),
      },
      {
        label: "Sleep need",
        data: JSON.parse(sleepCanvas.dataset.need),
        borderDash: [6, 4],
        pointRadius: 0,
      },
    ],
  },
  options: {
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    scales: dailyScales("hours"),
    plugins: {
      tooltip: {
        callbacks: {
          label: (context) =>
            `${context.dataset.label}: ${formatHours(context.parsed.y)}`,
        },
      },
    },
  },
});
