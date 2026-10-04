// Kept apart from ui.jsx so the landing page and header don't pull in the chart library.
export const fmt = (x, d = 1) => Number(x).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = (a, b) => ((a - b) / b) * 100;
