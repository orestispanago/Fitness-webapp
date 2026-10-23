// Chart helpers shared by every page; loaded from base.html.

// Status colours (bands, highlighted points, bars, rings), one set for
// every chart; series keep Chart.js's default colours (see SPEC.md)
const STATUS_COLORS = {
  green: "75, 192, 92",
  yellow: "255, 205, 86",
  orange: "255, 159, 64",
  red: "255, 99, 71",
  blue: "54, 162, 235",
};

function statusColor(name, alpha = 1) {
  return `rgba(${STATUS_COLORS[name]}, ${alpha})`;
}

// Greys for non-data marks; grid and label greys are Chart.js's defaults
const GREYS = {
  grid: Chart.defaults.borderColor,
  guide: "rgba(0, 0, 0, 0.25)",
  strong: "rgba(0, 0, 0, 0.5)",
  label: Chart.defaults.color,
};

// Chart.js's default 1st-series blue, for series given an explicit colour
function seriesBlue(alpha = 1) {
  return `rgba(54, 162, 235, ${alpha})`;
}

const SERIES_BLUE = seriesBlue();

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
        ctx.fillStyle = GREYS.label;
        ctx.font = "11px sans-serif";
        ctx.fillText(band.label, area.left + 4, top + 12);
      });
      ctx.restore();
    },
  };
}

// Chart.js plugin that draws labelled vertical lines behind the data,
// marking dates. Each marker: { date: "YYYY-MM-DD", label }.
function markersPlugin(markers) {
  return {
    id: "markers",
    beforeDatasetsDraw(chart) {
      const area = chart.chartArea;
      const x = chart.scales.x;
      const ctx = chart.ctx;
      ctx.save();
      markers.forEach((marker) => {
        const left = x.getPixelForValue(x.parse(marker.date));
        if (left < area.left || left > area.right) {
          return;
        }
        ctx.strokeStyle = GREYS.strong;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(left, area.top);
        ctx.lineTo(left, area.bottom);
        ctx.stroke();
        ctx.fillStyle = GREYS.label;
        ctx.font = "11px sans-serif";
        ctx.fillText(marker.label, left + 4, area.top + 12);
      });
      ctx.restore();
    },
  };
}

// Daily values as dots (no line) plus their 7-day rolling average as a
// line; read from the canvas's data-points and data-average attributes.
function dailyAverageChart(canvasId, label, yTitle, plugins = []) {
  const canvas = document.getElementById(canvasId);
  return new Chart(canvas, {
    type: "line",
    data: {
      datasets: [
        {
          label: label,
          data: JSON.parse(canvas.dataset.points),
          showLine: false,
        },
        {
          label: "7-day average",
          data: JSON.parse(canvas.dataset.average),
          pointRadius: 0,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: dailyScales(yTitle),
    },
    plugins: plugins,
  });
}

// Draws the points whose value falls in band ({ from, to }; null =
// open-ended) in color; the rest keep the dataset's own colour.
function highlightPoints(chart, band, color) {
  const inBand = (context) =>
    context.raw &&
    context.raw.y !== null &&
    (band.from === null || context.raw.y >= band.from) &&
    (band.to === null || context.raw.y < band.to);
  const dataset = chart.data.datasets[0];
  dataset.pointBackgroundColor = (context) =>
    inBand(context) ? color : context.dataset.backgroundColor;
  dataset.pointBorderColor = (context) =>
    inBand(context) ? color : context.dataset.borderColor;
  chart.update();
}

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
      plugins: { legend: { display: false } },
    },
    plugins: plugins,
  });
}
