// "+38%", or "+15 kg" when the first value is 0 (no % from 0)
function gainText(row) {
  const diff = Math.round((row.latest - row.first) * 10) / 10;
  const sign = diff >= 0 ? "+" : "";
  if (row.first > 0) {
    return `${sign}${Math.round((diff / row.first) * 100)}%`;
  }
  return `${sign}${diff} kg`;
}

// Chart.js plugin that writes each exercise's change just past the end of
// its longer bar
function gainLabelsPlugin(rows) {
  return {
    id: "gainLabels",
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      ctx.save();
      ctx.fillStyle = GREYS.label;
      ctx.font = "bold 12px sans-serif";
      ctx.textBaseline = "middle";
      rows.forEach((row, index) => {
        const first = chart.getDatasetMeta(0).data[index];
        const latest = chart.getDatasetMeta(1).data[index];
        const x = Math.max(first.x, latest.x) + 6;
        ctx.fillText(gainText(row), x, (first.y + latest.y) / 2);
      });
      ctx.restore();
    },
  };
}

const progressCanvas = document.getElementById("progress-chart");
const progressRows = JSON.parse(progressCanvas.dataset.points);

new Chart(progressCanvas, {
  type: "bar",
  data: {
    labels: progressRows.map((row) => row.label),
    datasets: [
      {
        label: "First session",
        data: progressRows.map((row) => row.first),
        backgroundColor: seriesBlue(0.35),
      },
      {
        label: "Latest session",
        data: progressRows.map((row) => row.latest),
        backgroundColor: SERIES_BLUE,
      },
    ],
  },
  options: {
    indexAxis: "y",
    maintainAspectRatio: false,
    // Room for the gain labels past the longest bar
    layout: { padding: { right: 48 } },
    scales: {
      x: { beginAtZero: true, title: { display: true, text: "kg" } },
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: (context) => {
            const row = progressRows[context.dataIndex];
            if (context.datasetIndex === 0) {
              return `First (${row.first_date}): ${row.first} kg`;
            }
            return `Latest (${row.latest_date}): ${row.latest} kg`;
          },
          footer: (items) => `Change: ${gainText(progressRows[items[0].dataIndex])}`,
        },
      },
    },
  },
  plugins: [gainLabelsPlugin(progressRows)],
});
