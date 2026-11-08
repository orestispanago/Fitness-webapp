// Chart helpers shared by every page; loaded from base.html after ECharts.

// Status colours (bands, highlighted points, bars, rings), one set for
// every chart; series keep ECharts' default colours (see SPEC.md)
const STATUS_COLORS = {
  green: "75, 192, 92",
  yellow: "255, 205, 86",
  orange: "255, 159, 64",
  red: "255, 99, 71",
  blue: "54, 162, 235",
  purple: "153, 102, 255",
};

function getStatusColor(name, alpha = 1) {
  return `rgba(${STATUS_COLORS[name]}, ${alpha})`;
}

// Greys for non-data marks: guide for background edges (HRV baseline)
const GREYS = {
  guide: "rgba(0, 0, 0, 0.25)",
};

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

// "YYYY-MM-DD" as a local date (new Date() on the string would parse it
// as UTC midnight)
function parseLocalDate(dateText) {
  const parts = dateText.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

// Whole days from "YYYY-MM-DD" to today, both as local dates
function countDaysAgo(dateText) {
  const date = parseLocalDate(dateText);
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

// "Sat, Nov 7", for tooltips
function formatDate(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
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

// "75.9 kg · today" from the element's data-points and data-unit;
// formatValue(value, unit) can replace formatWithUnit (e.g. for pace)
function buildSubtitle(element, formatValue = formatWithUnit) {
  const latest = findLatestPoint(JSON.parse(element.dataset.points), "y");
  const unit = element.dataset.unit;
  return buildDatedSubtitle(latest, (point) => formatValue(point.y, unit));
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

// [date, value] pairs from one key of each point ("y" by default)
function buildPairs(points, key = "y") {
  const pairs = [];
  for (const point of points) {
    pairs.push([point.x, point[key]]);
  }
  return pairs;
}

// Date x-axis for every chart: at least a month between ticks, so day and
// month labels don't collide; tooltips show the date as formatDate
function buildDateAxis() {
  return {
    type: "time",
    minInterval: 28 * 24 * 3600 * 1000,
    axisPointer: { label: { formatter: (params) => formatDate(new Date(params.value)) } },
  };
}

// The frame every chart starts from; pages add series and adjust the rest
function buildChartOption(element, subtitleText) {
  return {
    title: { text: element.dataset.title, subtext: subtitleText },
    // Axis tooltip: its crosshair hides with it on a phone. Kept inside
    // the chart, so it doesn't run off the screen
    tooltip: { trigger: "axis", confine: true },
    xAxis: buildDateAxis(),
    // Smaller bottom margin than the default, for a taller plot
    grid: { top: 60, bottom: 30 },
    // About 3 intervals rather than 5, so labels don't crowd
    yAxis: { type: "value", scale: true, splitNumber: 3 },
  };
}

const CHARTS = [];

// Draws option into element and keeps the chart for resizing
function plotChart(element, option) {
  const chart = echarts.init(element);
  chart.setOption(option);
  CHARTS.push(chart);
  return chart;
}

// ECharts doesn't follow its container's size by itself
window.addEventListener("resize", () => {
  for (const chart of CHARTS) {
    chart.resize();
  }
});
