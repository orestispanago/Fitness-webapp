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

// Chart titles, left-aligned like the headings they replace
Chart.defaults.plugins.title.align = "start";
Chart.defaults.plugins.title.font = { size: 14, weight: "bold" };
Chart.defaults.plugins.title.padding = { top: 0, bottom: 6 };

function buildTitle(canvas) {
  return { display: true, text: canvas.dataset.title };
}

// Subtitles: the latest value and how long ago it was
Chart.defaults.plugins.subtitle.align = "start";
Chart.defaults.plugins.subtitle.font = { size: 12 };
Chart.defaults.plugins.subtitle.padding = { top: 0, bottom: 6 };

// The last point with a value at key, or null if there is none
function findLatestPoint(points, key) {
  let latest = null;
  for (const point of points) {
    if (point[key] !== null && point[key] !== undefined) {
      latest = point;
    }
  }
  return latest;
}

// Whole days from "YYYY-MM-DD" to today, both as local dates (new Date()
// on the string would parse it as UTC midnight)
function countDaysAgo(dateText) {
  const parts = dateText.split("-");
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Rounded, as a day across a DST change isn't 24 h
  return Math.round((today - date) / 86400000);
}

function formatDaysAgo(days) {
  let text = `${days} days ago`;
  if (days <= 0) {
    text = "today";
  } else if (days === 1) {
    text = "yesterday";
  }
  return text;
}

// 75.9, "kg" -> "75.9 kg"; no unit (e.g. ACWR) -> "75.9"
function formatWithUnit(value, unit) {
  let text = String(value);
  if (unit !== undefined) {
    text = `${value} ${unit}`;
  }
  return text;
}

// Subtitle "<formatPoint(point)> · today"; none if point is null
function buildDatedSubtitle(point, formatPoint) {
  const subtitle = { display: false, text: "" };
  if (point !== null) {
    subtitle.display = true;
    subtitle.text = `${formatPoint(point)} · ${formatDaysAgo(countDaysAgo(point.x))}`;
  }
  return subtitle;
}

// "75.9 kg · today" from the canvas's data-points and data-unit;
// formatValue(value, unit) can replace formatWithUnit (e.g. for pace)
function buildSubtitle(canvas, formatValue = formatWithUnit) {
  const latest = findLatestPoint(JSON.parse(canvas.dataset.points), "y");
  const unit = canvas.dataset.unit;
  return buildDatedSubtitle(latest, (point) => formatValue(point.y, unit));
}

// Compact legends for every chart, so they wrap less on narrow screens
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.font = { size: 11 };

// Shared axes for charts of daily values: real-date x-axis, untitled
// y-axis (units are in the page headings).
function buildDailyScales() {
  return {
    x: { type: "time", time: { unit: "month", tooltipFormat: "MMM d, yyyy" } },
    y: {},
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

// The first band value falls in, e.g. OPTIMAL for 0.9 in ACWR_BANDS
function findBandForValue(bands, value) {
  let found = null;
  for (const band of bands) {
    if (found === null && isInBand(value, band)) {
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

// Chart.js plugin that draws a vertical line at the tooltip's point, so a
// tap or hover shows where it is on the x-axis; registered for every chart.
const CROSSHAIR_PLUGIN = {
  id: "crosshair",
  afterDatasetsDraw(chart) {
    const active = chart.tooltip.getActiveElements();
    if (active.length > 0) {
      const area = chart.chartArea;
      const left = active[0].element.x;
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = GREYS.guide;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, area.top);
      ctx.lineTo(left, area.bottom);
      ctx.stroke();
      ctx.restore();
    }
  },
};

Chart.register(CROSSHAIR_PLUGIN);

// Daily values as dots (no line) plus their 7-day rolling average as a
// line; read from the canvas's data-points and data-average attributes.
function plotDailyAverageChart(canvasId, label, plugins = []) {
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
      scales: buildDailyScales(),
      plugins: {
        title: buildTitle(canvas),
        subtitle: buildSubtitle(canvas),
      }
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
function plotDailyLineChart(canvasId, label, plugins = []) {
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
      scales: buildDailyScales(),
      plugins: {
        legend: { display: false },
        title: buildTitle(canvas),
        subtitle: buildSubtitle(canvas),
      },
    },
    plugins: plugins,
  });
}
