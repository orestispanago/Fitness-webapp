// Garmin's ACWR statuses; cut-offs observed in the data, not documented
const ACWR_BANDS = [
  {
    from: null,
    to: 0.8,
    label: "LOW",
    color: getStatusColor("blue", 0.12),
  },
  {
    from: 0.8,
    to: 1.5,
    label: "OPTIMAL",
    color: getStatusColor("green", 0.15),
  },
  {
    from: 1.5,
    to: null,
    label: "HIGH",
    color: getStatusColor("red", 0.15),
  },
];

// Cooper Institute VO2max ratings, men aged 30–39, in Garmin's colours
const VO2MAX_BANDS = [
  {
    from: null,
    to: 40.5,
    label: "POOR",
    color: getStatusColor("red", 0.12),
  },
  {
    from: 40.5,
    to: 44,
    label: "FAIR",
    color: getStatusColor("orange", 0.12),
  },
  {
    from: 44,
    to: 48.3,
    label: "GOOD",
    color: getStatusColor("green", 0.15),
  },
  {
    from: 48.3,
    to: 54,
    label: "EXCELLENT",
    color: getStatusColor("blue", 0.15),
  },
  {
    from: 54,
    to: null,
    label: "SUPERIOR",
    color: getStatusColor("purple", 0.12),
  },
];

const WEIGHT_MARKERS = [{ date: "2026-10-07", label: "Creatine" }];

// 419 -> "6:59"
function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = String(minutes % 60).padStart(2, "0");
  return `${hours}:${rest}`;
}

// ACWR status from the bands, e.g. "OPTIMAL · today"
function buildAcwrSubtitle(element) {
  return buildSubtitle(element, (value) => findBandForValue(ACWR_BANDS, value).label);
}

// Daily values as dots plus their 7-day average as a line, read from the
// element's data-points and data-average
function buildDailyAverageOption(element, label) {
  const option = buildChartOption(element, buildSubtitle(element).text);
  option.series = [
    {
      name: label,
      type: "scatter",
      data: buildPairs(JSON.parse(element.dataset.points)),
      // Smaller than ECharts' 10 px default; the Chart.js size
      symbolSize: 6,
    },
    {
      name: "7-day average",
      type: "line",
      data: buildPairs(JSON.parse(element.dataset.average)),
      symbol: "none",
    },
  ];
  return option;
}

function plotRestingHrChart() {
  const element = document.getElementById("resting-hr-chart");
  return plotChart(element, buildDailyAverageOption(element, "Resting HR"));
}

// Labelled vertical lines at dates, from markers like WEIGHT_MARKERS; the
// label runs along the line inside the plot, clear of the title
function buildMarkLine(markers) {
  const data = [];
  for (const marker of markers) {
    data.push({
      xAxis: marker.date,
      label: { formatter: marker.label, position: "insideEndTop" },
    });
  }
  return { symbol: "none", data: data };
}

function plotWeightChart() {
  const element = document.getElementById("weight-chart");
  const option = buildDailyAverageOption(element, "Weight");
  option.series[0].markLine = buildMarkLine(WEIGHT_MARKERS);
  return plotChart(element, option);
}

// Labelled horizontal bands behind the data, from bands like VO2MAX_BANDS;
// open ends (null) go to lowest/highest, far outside the data (marks
// don't stretch the axis)
function buildMarkArea(bands, lowest, highest) {
  const data = [];
  for (const band of bands) {
    let from = band.from;
    if (from === null) {
      from = lowest;
    }
    let to = band.to;
    if (to === null) {
      to = highest;
    }
    data.push([
      { yAxis: from, name: band.label, itemStyle: { color: band.color } },
      { yAxis: to },
    ]);
  }
  return { silent: true, label: { position: "insideTopLeft" }, data: data };
}

function plotVo2maxChart() {
  const element = document.getElementById("vo2max-chart");
  const option = buildChartOption(element, buildSubtitle(element).text);
  option.series = [{
    name: "VO2max",
    type: "line",
    data: buildPairs(JSON.parse(element.dataset.points)),
    markArea: buildMarkArea(VO2MAX_BANDS, 0, 100),
  }];
  return plotChart(element, option);
}

// [date, value] pairs, with the points in band as red dots
function buildHighlightedPairs(points, band) {
  const data = [];
  for (const point of points) {
    if (isInBand(point.y, band)) {
      data.push({
        value: [point.x, point.y],
        symbol: "circle",
        symbolSize: 6,
        itemStyle: { color: getStatusColor("red") },
      });
    } else {
      data.push([point.x, point.y]);
    }
  }
  return data;
}

// At least 1.7, so the HIGH band (from 1.5) always shows
function getAcwrAxisMax(extent) {
  return Math.max(extent.max, 1.7);
}

function plotAcwrChart() {
  const element = document.getElementById("acwr-chart");
  const option = buildChartOption(element, buildAcwrSubtitle(element).text);
  option.yAxis.max = getAcwrAxisMax;
  option.series = [{
    name: "ACWR",
    type: "line",
    data: buildHighlightedPairs(
      JSON.parse(element.dataset.points),
      findBand(ACWR_BANDS, "HIGH"),
    ),
    markArea: buildMarkArea(ACWR_BANDS, 0, 10),
  }];
  return plotChart(element, option);
}

// ECharts palette colours: pink for nights short of the sleep need, teal
// otherwise
function getShortfallColor(minutes) {
  let color = "#3fbe95";
  if (minutes < 0) {
    color = "#fb628b";
  }
  return color;
}

// One bar per night, coloured by sign; the night's sleep rides along for
// the tooltip
function buildShortfallBars(points) {
  const data = [];
  for (const point of points) {
    data.push({
      value: [point.x, point.y],
      slept: point.slept,
      itemStyle: { color: getShortfallColor(point.y) },
    });
  }
  return data;
}

// "-51 min (slept 6:59)" for a bar, "7-day average: -68 min" for the line
function formatShortfallItem(item) {
  let text = `${item.marker}7-day average: ${Math.round(item.value[1])} min`;
  if (item.seriesType === "bar") {
    const slept = formatMinutes(item.data.slept);
    text = `${item.marker}${item.value[1]} min (slept ${slept})`;
  }
  return text;
}

function formatShortfallTooltip(params) {
  const lines = [params[0].axisValueLabel];
  for (const item of params) {
    lines.push(formatShortfallItem(item));
  }
  return lines.join("<br>");
}

function plotSleepChart() {
  const element = document.getElementById("sleep-chart");
  const option = buildChartOption(element, buildSubtitle(element).text);
  option.tooltip.formatter = formatShortfallTooltip;
  option.series = [
    {
      name: "Sleep shortfall",
      type: "bar",
      data: buildShortfallBars(JSON.parse(element.dataset.points)),
    },
    {
      name: "7-day average",
      type: "line",
      data: buildPairs(JSON.parse(element.dataset.average)),
      symbol: "none",
    },
  ];
  return plotChart(element, option);
}

function getHrvRingColor(status) {
  let color = getStatusColor("orange");
  if (status === "LOW") {
    color = getStatusColor("red");
  }
  return color;
}

// Garmin's latest HRV status, e.g. "BALANCED · today"
function buildHrvSubtitle(element) {
  const days = JSON.parse(element.dataset.baseline);
  return buildDatedSubtitle(findLatestPoint(days, "status"), (day) => day.status);
}

// upper minus lower, or null when either is missing (calibrating days)
function subtractNullable(upper, lower) {
  let difference = null;
  if (upper !== null && lower !== null) {
    difference = upper - lower;
  }
  return difference;
}

// [date, upperKey - lowerKey] pairs, for one stacked strip of the baseline
function buildStripHeights(days, upperKey, lowerKey) {
  const pairs = [];
  for (const day of days) {
    pairs.push([day.x, subtractNullable(day[upperKey], day[lowerKey])]);
  }
  return pairs;
}

// One strip of Garmin's baseline, stacked on the ones below it
function buildHrvStrip(data, color) {
  return {
    type: "line",
    data: data,
    stack: "baseline",
    symbol: "none",
    silent: true,
    lineStyle: { width: 1, color: GREYS.guide },
    areaStyle: { color: color, opacity: 1 },
    z: 1,
  };
}

// Garmin's baseline behind the dots (see SPEC.md): dashed LOW limit, the
// strip down to it (yellow) and the balanced range (green), as stacked areas
function buildHrvBaselineSeries(days) {
  const lowLimit = {
    type: "line",
    data: buildPairs(days, "low_upper"),
    stack: "baseline",
    symbol: "none",
    silent: true,
    lineStyle: { width: 1, type: "dashed", color: GREYS.guide },
    z: 1,
  };
  const lowStrip = buildHrvStrip(
    buildStripHeights(days, "balanced_low", "low_upper"),
    getStatusColor("yellow", 0.2),
  );
  const balanced = buildHrvStrip(
    buildStripHeights(days, "balanced_upper", "balanced_low"),
    getStatusColor("green", 0.18),
  );
  return [lowLimit, lowStrip, balanced];
}

// Rings on the 7-day line where Garmin's status isn't BALANCED: status
// follows the 7-day average, not single nights
function buildHrvRingSeries(days, average) {
  const data = [];
  for (let index = 0; index < days.length; index += 1) {
    const status = days[index].status;
    if (status === "UNBALANCED" || status === "LOW") {
      data.push({
        value: [average[index].x, average[index].y],
        itemStyle: { borderColor: getHrvRingColor(status) },
      });
    }
  }
  return {
    type: "scatter",
    data: data,
    symbolSize: 14,
    silent: true,
    itemStyle: { color: "transparent", borderWidth: 2 },
    z: 3,
  };
}

// {date: status} from the baseline days
function mapHrvStatuses(days) {
  const statuses = {};
  for (const day of days) {
    statuses[day.x] = day.status;
  }
  return statuses;
}

// The dots and the 7-day line only, then Garmin's status for the day
function formatHrvTooltip(params, statuses) {
  const lines = [params[0].axisValueLabel];
  let date = null;
  for (const item of params) {
    if (item.seriesName === "HRV" || item.seriesName === "7-day average") {
      lines.push(`${item.marker}${item.seriesName}: ${item.value[1]}`);
      date = item.value[0];
    }
  }
  lines.push(`Garmin status: ${statuses[date] || "none (calibrating)"}`);
  return lines.join("<br>");
}

function plotHrvChart() {
  const element = document.getElementById("hrv-chart");
  const days = JSON.parse(element.dataset.baseline);
  const average = JSON.parse(element.dataset.average);
  const statuses = mapHrvStatuses(days);
  const option = buildDailyAverageOption(element, "HRV");
  option.title.subtext = buildHrvSubtitle(element).text;
  option.tooltip.formatter = (params) => formatHrvTooltip(params, statuses);
  for (const series of buildHrvBaselineSeries(days)) {
    option.series.push(series);
  }
  option.series.push(buildHrvRingSeries(days, average));
  return plotChart(element, option);
}

plotSleepChart();
plotWeightChart();
plotVo2maxChart();
plotAcwrChart();
plotRestingHrChart();
plotHrvChart();
