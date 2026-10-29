// One colour per session group, in group order (S1, S2, …): line and band
// of every exercise chart in that group; groups past the list are grey
const SESSION_COLORS = [
  "54, 162, 235",
  "235, 104, 52",
  "27, 175, 122",
  "98, 80, 214",
  "237, 161, 0",
  "232, 123, 164",
];
const OTHER_SESSION_COLOR = "138, 137, 133";

function getSessionColor(groupIndex, alpha = 1) {
  let rgb = OTHER_SESSION_COLOR;
  if (groupIndex < SESSION_COLORS.length) {
    rgb = SESSION_COLORS[groupIndex];
  }
  return `rgba(${rgb}, ${alpha})`;
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
  return [
    `Max ${point.max} kg`,
    `Average ${point.avg} kg`,
    `Min ${point.min} kg`,
  ];
}

// The session that first reached the current heaviest set, or null if no
// session beat the first one
function findRecordPoint(points) {
  let record = null;
  let best = points[0].max;
  for (const point of points.slice(1)) {
    if (point.max > best) {
      best = point.max;
      record = point;
    }
  }
  return record;
}

// One exercise per chart: the average set as a line, with a band from the
// lightest to the heaviest set behind it and the PR in the subtitle
function plotExerciseTrendChart(canvas) {
  const points = JSON.parse(canvas.dataset.points);
  const groupIndex = Number(canvas.dataset.group);
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
          backgroundColor: getSessionColor(groupIndex, 0.18),
          // Fill down to the lightest-set dataset
          fill: "-1",
        },
        {
          label: "Average set",
          data: buildTrendSeries(points, "avg"),
          borderColor: getSessionColor(groupIndex),
          backgroundColor: getSessionColor(groupIndex),
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: buildDailyScales(),
      plugins: {
        legend: { display: false },
        title: buildTitle(canvas),
        subtitle: buildDatedSubtitle(
          findRecordPoint(points),
          (point) => `PR ${point.max} kg`,
        ),
        tooltip: {
          // Only the average line's tooltip, which shows all three values
          filter: (item) => item.datasetIndex === 2,
          callbacks: { label: formatTrendTooltip },
        },
      },
    },
  });
}

for (const canvas of document.querySelectorAll(".exercise-chart")) {
  plotExerciseTrendChart(canvas);
}
