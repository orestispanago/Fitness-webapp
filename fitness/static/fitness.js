const vo2maxCanvas = document.getElementById("vo2max-chart");

new Chart(vo2maxCanvas, {
  type: "line",
  data: {
    datasets: [{
      label: "VO2max",
      data: JSON.parse(vo2maxCanvas.dataset.points),
    }],
  },
  options: {
    maintainAspectRatio: false,
    scales: {
      x: { type: "time", time: { unit: "month", tooltipFormat: "MMM d, yyyy" } },
      y: { title: { display: true, text: "ml/kg/min" } },
    },
  },
});
