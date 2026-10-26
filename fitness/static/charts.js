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

function getStatusColor(name, alpha = 1) {
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
function getSeriesBlue(alpha = 1) {
  return `rgba(54, 162, 235, ${alpha})`;
}

const SERIES_BLUE = getSeriesBlue();

// Compact legends for every chart, so they wrap less on narrow screens
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.font = { size: 11 };

// Shared axes for charts of daily values: real-date x-axis, titled y-axis.
function buildDailyScales(yTitle) {
  return {
    x: { type: "time", time: { unit: "month", tooltipFormat: "MMM d, yyyy" } },
    y: { title: { display: true, text: yTitle } },
  };
}

// The first band whose label matches, e.g. "HIGH" in ACWR_BANDS
function findBand(bands, label) {
  let found = null;
  for (const band of bands) {
    if (found === null && band.label === label) {
      found = band;
    }
  }
  return found;
}

// Whether value falls in band ({ from, to }; null = open-ended)
function isInBand(value, band) {
  let inside = false;
  if (value !== null && value !== undefined) {
    inside = true;
    if (band.from !== null && value < band.from) {
      inside = false;
    }
    if (band.to !== null && value >= band.to) {
      inside = false;
    }
  }
  return inside;
}

// Pixel rows a band covers inside the chart area, or null if none
function getBandPixels(band, area, y) {
  let top = area.top;
  if (band.to !== null) {
    top = Math.max(y.getPixelForValue(band.to), area.top);
  }
  let bottom = area.bottom;
  if (band.from !== null) {
    bottom = Math.min(y.getPixelForValue(band.from), area.bottom);
  }
  let pixels = null;
  if (bottom > top) {
    pixels = { top: top, bottom: bottom };
  }
  return pixels;
}

// Chart.js plugin that shades horizontal y-ranges behind the data and
// labels them. Each band: { from, to, label, color }; null = open-ended.
function createBandsPlugin(bands) {
  return {
    id: "bands",
    beforeDatasetsDraw(chart) {
      const area = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      for (const band of bands) {
        const pixels = getBandPixels(band, area, chart.scales.y);
        if (pixels === null) {
          continue;
        }
        ctx.fillStyle = band.color;
        ctx.fillRect(
          area.left,
          pixels.top,
          area.right - area.left,
          pixels.bottom - pixels.top,
        );
        ctx.fillStyle = GREYS.label;
        ctx.font = "11px sans-serif";
        ctx.fillText(band.label, area.left + 4, pixels.top + 12);
      }
      ctx.restore();
    },
  };
}

// Chart.js plugin that draws labelled vertical lines behind the data,
// marking dates. Each marker: { date: "YYYY-MM-DD", label }.
function createMarkersPlugin(markers) {
  return {
    id: "markers",
    beforeDatasetsDraw(chart) {
      const area = chart.chartArea;
      const x = chart.scales.x;
      const ctx = chart.ctx;
      ctx.save();
      for (const marker of markers) {
        const left = x.getPixelForValue(x.parse(marker.date));
        if (left < area.left || left > area.right) {
          continue;
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
      }
      ctx.restore();
    },
  };
}

// Daily values as dots (no line) plus their 7-day rolling average as a
// line; read from the canvas's data-points and data-average attributes.
function plotDailyAverageChart(canvasId, label, yTitle, plugins = []) {
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
      scales: buildDailyScales(yTitle),
    },
    plugins: plugins,
  });
}

// highlight for a point whose value falls in band, otherwise normal
function pickPointColor(context, band, highlight, normal) {
  let pointColor = normal;
  if (context.raw && isInBand(context.raw.y, band)) {
    pointColor = highlight;
  }
  return pointColor;
}

// Draws the points whose value falls in band in color; the rest keep the
// dataset's own colour.
function highlightPoints(chart, band, color) {
  const dataset = chart.data.datasets[0];
  dataset.pointBackgroundColor = (context) =>
    pickPointColor(context, band, color, context.dataset.backgroundColor);
  dataset.pointBorderColor = (context) =>
    pickPointColor(context, band, color, context.dataset.borderColor);
  chart.update();
}

// Line chart of one daily series; points come from the canvas's
// data-points attribute. Null values are drawn as gaps. Optional
// plugins (e.g. createBandsPlugin) are passed through to Chart.js.
function plotDailyLineChart(canvasId, label, yTitle, plugins = []) {
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
      scales: buildDailyScales(yTitle),
      plugins: { legend: { display: false } },
    },
    plugins: plugins,
  });
}
