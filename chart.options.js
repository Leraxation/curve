chart.options.plugins = chart.options.plugins || {};
chart.options.plugins.datalabels = {
  clamp: true,
  clip: true,
  align: 'top',
  anchor: 'end',
  offset: 4,
  formatter: state.labelsMode === 'percent'
    ? (v) => v.toFixed(1) + '%'
    : (v) => Number(v).toLocaleString()
};

chart.options.scales = chart.options.scales || {};
chart.options.scales.y = chart.options.scales.y || {};
chart.options.scales.y.beginAtZero = true;
chart.options.scales.y.grace = '10%';