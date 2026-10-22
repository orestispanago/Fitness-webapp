// Shared axes for charts of daily values: real-date x-axis, titled y-axis.
function dailyScales(yTitle) {
  return {
    x: { type: "time", time: { unit: "month", tooltipFormat: "MMM d, yyyy" } },
    y: { title: { display: true, text: yTitle } },
  };
}

// Chart.js plugin that shades horizontal y-ranges behind the data and
// labels them. Each band: { from, to, label, color }; null = open-ended.
function bandsPlugin(bands) {
  return {
    id: "bands",
    beforeDatasetsDraw(chart) {
      const area = chart.chartArea;
      const y = chart.scales.y;
      const ctx = chart.ctx;
      ctx.save();
      bands.forEach((band) => {
        let top = area.top;
        if (band.to !== null) {
          top = Math.max(y.getPixelForValue(band.to), area.top);
        }
        let bottom = area.bottom;
        if (band.from !== null) {
          bottom = Math.min(y.getPixelForValue(band.from), area.bottom);
        }
        if (bottom <= top) {
          return;
        }
        ctx.fillStyle = band.color;
        ctx.fillRect(area.left, top, area.right - area.left, bottom - top);
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx.font = "11px sans-serif";
        ctx.fillText(band.label, area.left + 4, top + 12);
      });
      ctx.restore();
    },
  };
}

// Garmin's ACWR statuses; cut-offs observed in the data, not documented
const ACWR_BANDS = [
  { from: null, to: 0.8, label: "LOW", color: "rgba(54, 162, 235, 0.12)" },
  { from: 0.8, to: 1.5, label: "OPTIMAL", color: "rgba(75, 192, 92, 0.15)" },
  { from: 1.5, to: null, label: "HIGH", color: "rgba(255, 99, 71, 0.15)" },
];

// Line chart of one daily series; points come from the canvas's
// data-points attribute. Null values are drawn as gaps. Optional
// plugins (e.g. bandsPlugin) are passed through to Chart.js.
function dailyLineChart(canvasId, label, yTitle, plugins = []) {
  const canvas = document.getElementById(canvasId);
  return new Chart(canvas, {
    type: "line",
    data: {
      datasets: [{
        label: label,
        data: JSON.parse(canvas.dataset.points),
      }],
    },
    options: {
      maintainAspectRatio: false,
      // Tooltip for the hovered date anywhere on the chart, not only on a point
      interaction: { mode: "index", intersect: false },
      scales: dailyScales(yTitle),
    },
    plugins: plugins,
  });
}

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
