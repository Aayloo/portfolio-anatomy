"""Build a compact monthly ETF history for the Portfolio Anatomy 3D chart."""

from __future__ import annotations

import json
import math
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "market-history.js"
TICKERS = ("SPY", "VEA", "EEM", "IEF", "LQD", "GLD", "DBC", "BIL")
START = int(datetime(2020, 1, 1, tzinfo=UTC).timestamp())
END = int(datetime(2026, 11, 1, tzinfo=UTC).timestamp())
AS_OF = "2026-10-31"


def fetch_series(ticker: str) -> dict[str, float]:
    params = urllib.parse.urlencode(
        {
            "period1": START,
            "period2": END,
            "interval": "1mo",
            "events": "history",
            "includeAdjustedClose": "true",
        }
    )
    request = urllib.request.Request(
        f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?{params}",
        headers={"User-Agent": "Mozilla/5.0"},
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=30) as response:
        payload = json.load(response)

    result = payload["chart"]["result"][0]
    timestamps = result["timestamp"]
    adjusted = result["indicators"]["adjclose"][0]["adjclose"]
    values: dict[str, float] = {}
    for timestamp, value in zip(timestamps, adjusted):
        if value is None or not math.isfinite(float(value)):
            continue
        month = datetime.fromtimestamp(timestamp, UTC).strftime("%Y-%m")
        values[month] = float(value)
    return values


def main() -> None:
    raw = {ticker: fetch_series(ticker) for ticker in TICKERS}
    dates = sorted(
        {
            month
            for series in raw.values()
            for month in series
            if month <= AS_OF[:7]
        }
    )

    series: dict[str, dict[str, list[float]]] = {}
    for ticker, values in raw.items():
        aligned = [(month, values[month]) for month in dates if month in values]
        base = aligned[0][1]
        previous = base
        wealth: dict[str, float] = {}
        monthly_return: dict[str, float] = {}
        for month, value in aligned:
            wealth[month] = value / base * 100
            monthly_return[month] = value / previous - 1 if previous else 0
            previous = value
        peak = 0.0
        drawdown: dict[str, float] = {}
        for month in dates:
            peak = max(peak, wealth.get(month, peak))
            drawdown[month] = wealth.get(month, peak) / peak - 1 if peak else 0

        series[ticker] = {
            "wealth": [round(wealth.get(month, wealth.get(dates[-1], base)), 4) for month in dates],
            "returns": [round(monthly_return.get(month, 0), 6) for month in dates],
            "drawdown": [round(drawdown.get(month, 0), 6) for month in dates],
        }

    payload = {
        "source": "Yahoo Finance chart API · adjusted close · monthly",
        "asOf": AS_OF,
        "dates": dates,
        "tickers": list(TICKERS),
        "series": series,
    }
    OUTPUT.write_text(
        "window.MARKET_HISTORY = "
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT} with {len(dates)} monthly observations.")


if __name__ == "__main__":
    main()
