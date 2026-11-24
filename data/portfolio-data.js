window.PORTFOLIO_DATA = {
  asOf: "2026-10-31",
  source: "L1 TAA public ETF research study",
  baseMetrics: {
    annualReturn: 0.052,
    annualVolatility: 0.0764,
    sharpe: 0.7034,
    maxDrawdown: -0.2332,
  },
  assets: [
    { id: "SPY", name: "US equity", group: "Equity", weight: 0.2011, risk: 0.2746, factor: 0.96, liquidity: 0.97, returnContribution: 0.0211, color: "#ef6a32" },
    { id: "VEA", name: "Developed equity", group: "Equity", weight: 0.0995, risk: 0.167, factor: 0.82, liquidity: 0.94, returnContribution: 0.0047, color: "#da814f" },
    { id: "EEM", name: "Emerging equity", group: "Equity", weight: 0.0936, risk: 0.1672, factor: 0.88, liquidity: 0.9, returnContribution: 0.004, color: "#b7653f" },
    { id: "IEF", name: "7–10Y Treasury", group: "Rates", weight: 0.2043, risk: 0.1309, factor: -0.34, liquidity: 0.99, returnContribution: 0.0059, color: "#5eb6ae" },
    { id: "LQD", name: "Investment-grade credit", group: "Credit", weight: 0.1531, risk: 0.1302, factor: 0.42, liquidity: 0.91, returnContribution: 0.0064, color: "#7ba9a5" },
    { id: "GLD", name: "Gold", group: "Real assets", weight: 0.0964, risk: 0.139, factor: -0.08, liquidity: 0.93, returnContribution: 0.0094, color: "#d7ad52" },
    { id: "DBC", name: "Commodities", group: "Real assets", weight: 0.052, risk: 0.0019, factor: 0.24, liquidity: 0.86, returnContribution: 0.0009, color: "#b9955a" },
    { id: "BIL", name: "Treasury bills", group: "Cash", weight: 0.1, risk: 0.0019, factor: 0.01, liquidity: 1, returnContribution: 0.0017, color: "#e1e2da" }
  ],
  policyWeights: {
    SPY: 0.2,
    VEA: 0.1,
    EEM: 0.1,
    IEF: 0.2,
    LQD: 0.15,
    GLD: 0.1,
    DBC: 0.05,
    BIL: 0.1
  },
  scenarios: {
    base: {
      label: "No active shock",
      impacts: { SPY: 0, VEA: 0, EEM: 0, IEF: 0, LQD: 0, GLD: 0, DBC: 0, BIL: 0 }
    },
    gfc: {
      label: "2008 financial crisis",
      impacts: { SPY: -0.37, VEA: -0.42, EEM: -0.54, IEF: 0.05, LQD: -0.08, GLD: 0.05, DBC: -0.36, BIL: 0.01 }
    },
    covid: {
      label: "2020 pandemic shock",
      impacts: { SPY: -0.2, VEA: -0.23, EEM: -0.24, IEF: 0.08, LQD: -0.07, GLD: 0.04, DBC: -0.23, BIL: 0.002 }
    },
    rates: {
      label: "2022 rates shock",
      impacts: { SPY: -0.18, VEA: -0.16, EEM: -0.2, IEF: -0.1, LQD: -0.14, GLD: -0.01, DBC: 0.15, BIL: 0.01 }
    }
  }
};
