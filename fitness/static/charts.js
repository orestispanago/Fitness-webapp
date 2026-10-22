// Chart helpers shared by every page; loaded from base.html.

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
