// "+38%", or "+15 kg" when the first value is 0 (no % from 0)
function formatGain(row) {
  const diff = Math.round((row.latest - row.first) * 10) / 10;
  let sign = "";
  if (diff >= 0) {
    sign = "+";
  }
  let text = `${sign}${diff} kg`;
  if (row.first > 0) {
    text = `${sign}${Math.round((diff / row.first) * 100)}%`;
  }
  return text;
}

// Chart.js plugin that writes each exercise's change just past the end of
// its longer bar
function createGainLabelsPlugin(rows) {
  return {
    id: "gainLabels",
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      ctx.save();
      ctx.fillStyle = GREYS.label;
      ctx.font = "bold 12px sans-serif";
      ctx.textBaseline = "middle";
      for (let index = 0; index < rows.length; index += 1) {
        const first = chart.getDatasetMeta(0).data[index];
        const latest = chart.getDatasetMeta(1).data[index];
        const x = Math.max(first.x, latest.x) + 6;
        ctx.fillText(formatGain(rows[index]), x, (first.y + latest.y) / 2);
      }
      ctx.restore();
    },
  };
}

function formatProgressTooltip(context, rows) {
  const row = rows[context.dataIndex];
  let text = `Latest (${row.latest_date}): ${row.latest} kg`;
  if (context.datasetIndex === 0) {
    text = `First (${row.first_date}): ${row.first} kg`;
  }
  return text;
}

function plotProgressChart() {
  const canvas = document.getElementById("progress-chart");
  const rows = JSON.parse(canvas.dataset.points);
  const labels = [];
  const firstKgs = [];
  const latestKgs = [];
  for (const row of rows) {
    labels.push(row.label);
    firstKgs.push(row.first);
    latestKgs.push(row.latest);
  }
  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "First session",
          data: firstKgs,
          backgroundColor: getSeriesBlue(0.35),
        },
        {
          label: "Latest session",
          data: latestKgs,
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
            label: (context) => formatProgressTooltip(context, rows),
            footer: (items) =>
              `Change: ${formatGain(rows[items[0].dataIndex])}`,
          },
        },
      },
    },
    plugins: [createGainLabelsPlugin(rows)],
  });
}

// Chart.js points from one key of each trend point ("min", "avg", "max");
// the whole point rides along for the tooltip
function buildTrendSeries(points, key) {
  const series = [];
  for (const point of points) {
    series.push({ x: point.x, y: point[key], point: point });
  }
  return series;
}

function formatTrendTooltip(context) {
  const point = context.raw.point;
  return `Average ${point.avg} kg (${point.min}–${point.max}) ` +
    `over ${point.sets} sets`;
}

// One exercise per chart: the average set as a line, with a band from the
// lightest to the heaviest set behind it
function plotExerciseTrendChart(canvas) {
  const points = JSON.parse(canvas.dataset.points);
  return new Chart(canvas, {
    type: "line",
    data: {
      datasets: [
        {
          label: "Lightest set",
          data: buildTrendSeries(points, "min"),
          borderColor: "transparent",
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
        },
        {
          label: "Heaviest set",
          data: buildTrendSeries(points, "max"),
          borderColor: "transparent",
          pointRadius: 0,
          pointHoverRadius: 0,
          backgroundColor: getSeriesBlue(0.18),
          // Fill down to the lightest-set dataset
          fill: "-1",
        },
        {
          label: "Average set",
          data: buildTrendSeries(points, "avg"),
          borderColor: SERIES_BLUE,
          backgroundColor: SERIES_BLUE,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: buildDailyScales("kg"),
      plugins: {
        legend: { display: false },
        tooltip: {
          // Only the average line's tooltip, which shows all three values
          filter: (item) => item.datasetIndex === 2,
          callbacks: { label: formatTrendTooltip },
        },
      },
    },
  });
}

plotProgressChart();
for (const canvas of document.querySelectorAll(".exercise-chart")) {
  plotExerciseTrendChart(canvas);
}
