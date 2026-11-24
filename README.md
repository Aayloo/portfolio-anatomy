# Portfolio Anatomy

**An interactive multi-asset portfolio diagnostic.**

[![Portfolio Anatomy preview](assets/img/preview.png)](https://aayloo.github.io/portfolio-anatomy/)

Portfolio Anatomy is a public-data research exhibit built around one question:
what does a portfolio actually own when capital, risk and factor exposure are
viewed separately?

## What it shows

- a three-dimensional market chart with time on X, cumulative wealth on Y and
  one asset channel on Z;
- growth, monthly-return, drawdown and realized-volatility views;
- 2020, 2022 and recent-market scenario windows;
- a month-by-month playback head;
- current and policy asset weights, variance contribution and return attribution;
- keyboard-accessible asset selection and a scenario snapshot export.

The central Three.js scene is a real data chart, not a decorative asset model.
Eight ETF paths are drawn through a shared XYZ coordinate space. The
authoritative numbers remain in the HTML diagnostics and labels.

## Run locally

No build step is required:

```bash
python -m http.server 8000
```

Open <http://localhost:8000>.

For a headless responsive and interaction check:

```bash
node scripts/qa.mjs
```

## Data

The page uses 82 monthly adjusted-close observations from January 2020 through
October 2026 for SPY, VEA, EEM, IEF, LQD, GLD, DBC and BIL. The data builder
downloads the public Yahoo Finance chart series and stores only the normalized
wealth, monthly-return and drawdown fields used by the visualization.

```bash
python scripts/build_market_history.py
```

The current portfolio path applies the frozen L1 weights to each normalized
series. It is a research index, not an account or investment recommendation.

## Technology

- dependency-free HTML, CSS and JavaScript;
- local Three.js renderer;
- SVG diagnostic charts generated from one shared portfolio state;
- keyboard-accessible controls and a no-WebGL fallback;
- responsive desktop and mobile layouts.

## License

MIT. See `LICENSE` and `THIRD_PARTY_NOTICES.md`.
