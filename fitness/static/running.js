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

dailyLineChart("duration-chart", "Duration", "min");
dailyLineChart("run-hr-chart", "Average HR", "bpm");
dailyLineChart("pace-fade-chart", "Pace fade", "s/km slower");
