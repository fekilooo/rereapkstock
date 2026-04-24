from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import requests
import urllib3

BASE_URL = "https://api.finmindtrade.com/api/v4/data"
TWSE_MI_INDEX_URL = "https://www.twse.com.tw/exchangeReport/MI_INDEX"
TPEX_MARKET_HIGHLIGHT_URL = "https://www.tpex.org.tw/web/stock/aftertrading/market_highlight/highlight_result.php"

DEFAULT_ANALYSIS_DAYS = 365
DEFAULT_WARMUP_DAYS = 420
DEFAULT_PERCENTILE_WINDOW = 252
DEFAULT_MIN_PERIODS = 60
DEFAULT_SMOOTHING_SPAN = 5
DEFAULT_INCREMENTAL_RECOMPUTE_DAYS = 60
TIMEOUT = 60

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
)

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


@dataclass(frozen=True)
class IndicatorSpec:
    name: str
    raw_column: str
    score_column: str
    weight: float
    invert: bool = False


INDICATORS = [
    IndicatorSpec("市場動能", "momentum_metric", "momentum_score", 0.25),
    IndicatorSpec("市場廣度", "breadth_metric", "breadth_score", 0.20),
    IndicatorSpec("融資情緒", "margin_metric", "margin_score", 0.15),
    IndicatorSpec("外資情緒", "foreign_metric", "foreign_score", 0.15),
    IndicatorSpec("P/C Ratio", "pc_ratio_metric", "pc_ratio_score", 0.15, invert=True),
    IndicatorSpec("波動風險", "volatility_metric", "volatility_score", 0.10, invert=True),
]

HISTORY_CSV_FILENAME = "tw_fear_greed_1y_history.csv"
HISTORY_JSON_FILENAME = "tw_fear_greed_1y_history.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a 1-year Taiwan fear/greed index from FinMind.")
    parser.add_argument("--token", default=os.environ.get("FINMIND_TOKEN"), help="FinMind token. Defaults to FINMIND_TOKEN env var.")
    parser.add_argument("--end-date", default=None, help="End date in YYYY-MM-DD. Defaults to latest available trading day.")
    parser.add_argument("--analysis-days", type=int, default=DEFAULT_ANALYSIS_DAYS, help="Calendar days to keep in the final output.")
    parser.add_argument("--warmup-days", type=int, default=DEFAULT_WARMUP_DAYS, help="Extra calendar days to fetch before the analysis window.")
    parser.add_argument("--percentile-window", type=int, default=DEFAULT_PERCENTILE_WINDOW, help="Trailing trading days for percentile ranking.")
    parser.add_argument("--min-periods", type=int, default=DEFAULT_MIN_PERIODS, help="Minimum observations before a score is emitted.")
    parser.add_argument("--smoothing-span", type=int, default=DEFAULT_SMOOTHING_SPAN, help="EMA span for the final index smoothing.")
    parser.add_argument("--output-dir", default=str(Path(__file__).resolve().parent / "output"), help="Directory for generated CSV and JSON files.")
    parser.add_argument("--cache-dir", default=str(Path(__file__).resolve().parent / "cache"), help="Directory for cached API responses.")
    return parser.parse_args()


def require_token(token: str | None) -> str:
    if token:
        return token
    raise SystemExit("Missing FinMind token. Pass --token or set FINMIND_TOKEN.")


def create_finmind_session(token: str) -> requests.Session:
    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {token}", "User-Agent": USER_AGENT})
    return session


def create_public_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    return session


def get_json(session: requests.Session, params: dict[str, Any], *, retries: int = 3) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            response = session.get(BASE_URL, params=params, timeout=TIMEOUT)
            if response.status_code in {429, 500, 502, 503, 504}:
                time.sleep(2 ** attempt)
                continue
            response.raise_for_status()
            payload = response.json()
            if payload.get("status") not in (None, 200):
                raise RuntimeError(f"FinMind returned status={payload.get('status')} msg={payload.get('msg')}")
            return payload
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep(2 ** attempt)
    assert last_error is not None
    raise last_error


def fetch_dataframe(
    session: requests.Session,
    dataset: str,
    *,
    start_date: str,
    end_date: str | None = None,
    data_id: str | None = None,
) -> pd.DataFrame:
    params: dict[str, Any] = {"dataset": dataset, "start_date": start_date}
    if end_date:
        params["end_date"] = end_date
    if data_id:
        params["data_id"] = data_id
    payload = get_json(session, params)
    return pd.DataFrame(payload.get("data", []))


def rolling_percentile(series: pd.Series, window: int, *, invert: bool, min_periods: int) -> pd.Series:
    values = pd.to_numeric(series, errors="coerce").to_numpy(dtype=float)
    output = np.full(len(values), np.nan, dtype=float)
    for idx, current in enumerate(values):
        if np.isnan(current):
            continue
        start = max(0, idx - window + 1)
        history = values[start : idx + 1]
        history = history[~np.isnan(history)]
        if len(history) < min_periods:
            continue
        lower = np.sum(history < current)
        equal = np.sum(history == current)
        percentile = ((lower + 0.5 * equal) / len(history)) * 100.0
        output[idx] = 100.0 - percentile if invert else percentile
    return pd.Series(output, index=series.index)


def ema_with_seed(series: pd.Series, *, span: int, seed: float | None = None) -> pd.Series:
    values = pd.to_numeric(series, errors="coerce")
    alpha = 2.0 / (span + 1.0)
    previous = None if seed is None or pd.isna(seed) else float(seed)
    output: list[float] = []

    for value in values:
        if pd.isna(value):
            output.append(np.nan)
            continue
        numeric_value = float(value)
        if previous is None:
            previous = numeric_value
        else:
            previous = alpha * numeric_value + (1.0 - alpha) * previous
        output.append(previous)

    return pd.Series(output, index=series.index)


def normalize_history_frame(frame: pd.DataFrame) -> pd.DataFrame:
    normalized = frame.copy()
    normalized["date"] = pd.to_datetime(normalized["date"]).dt.normalize()
    for column in normalized.columns:
        if column not in {"date", "rating"}:
            normalized[column] = pd.to_numeric(normalized[column], errors="coerce")
    return normalized.sort_values("date").drop_duplicates("date", keep="last").reset_index(drop=True)


def load_existing_history_frame(output_dir: Path) -> pd.DataFrame | None:
    history_csv_path = output_dir / HISTORY_CSV_FILENAME
    if not history_csv_path.exists():
        return None

    try:
        frame = pd.read_csv(history_csv_path)
    except Exception:  # noqa: BLE001
        return None

    if frame.empty or "date" not in frame.columns:
        return None
    return normalize_history_frame(frame)


def load_existing_history_json_last_date(output_dir: Path) -> pd.Timestamp | None:
    history_json_path = output_dir / HISTORY_JSON_FILENAME
    if not history_json_path.exists():
        return None

    try:
        with history_json_path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except Exception:  # noqa: BLE001
        return None

    history = payload.get("history")
    if not isinstance(history, list) or not history:
        return None

    last_date = history[-1].get("date")
    if not last_date:
        return None

    try:
        return pd.Timestamp(last_date).normalize()
    except Exception:  # noqa: BLE001
        return None


def rating_label(score: float) -> str:
    if score <= 24:
        return "極度恐慌"
    if score <= 44:
        return "恐慌"
    if score <= 55:
        return "中性"
    if score <= 74:
        return "貪婪"
    return "極度貪婪"


def rating_label_en(score: float) -> str:
    if score <= 24:
        return "Extreme Fear"
    if score <= 44:
        return "Fear"
    if score <= 55:
        return "Neutral"
    if score <= 74:
        return "Greed"
    return "Extreme Greed"


def fetch_taiex(session: requests.Session, fetch_start: str, end_date: str | None) -> pd.DataFrame:
    df = fetch_dataframe(session, "TaiwanStockTotalReturnIndex", start_date=fetch_start, end_date=end_date, data_id="TAIEX")
    if df.empty:
        raise RuntimeError("TaiwanStockTotalReturnIndex returned no data.")
    df["date"] = pd.to_datetime(df["date"])
    df["price"] = pd.to_numeric(df["price"], errors="coerce")
    df = df.dropna(subset=["price"]).sort_values("date").reset_index(drop=True)
    df["ma125"] = df["price"].rolling(125, min_periods=125).mean()
    df["momentum_metric"] = (df["price"] - df["ma125"]) / df["ma125"] * 100.0
    df["return"] = df["price"].pct_change()
    df["volatility_metric"] = df["return"].rolling(20, min_periods=20).std() * np.sqrt(252) * 100.0
    return df[["date", "price", "momentum_metric", "volatility_metric"]]


def fetch_margin(session: requests.Session, fetch_start: str, end_date: str | None) -> pd.DataFrame:
    df = fetch_dataframe(session, "TaiwanStockTotalMarginPurchaseShortSale", start_date=fetch_start, end_date=end_date)
    if df.empty:
        raise RuntimeError("TaiwanStockTotalMarginPurchaseShortSale returned no data.")

    df["date"] = pd.to_datetime(df["date"])
    df["TodayBalance"] = pd.to_numeric(df["TodayBalance"], errors="coerce")
    df = df.dropna(subset=["TodayBalance"]).sort_values("date").reset_index(drop=True)

    margin_money = (
        df[df["name"] == "MarginPurchaseMoney"][["date", "TodayBalance"]]
        .rename(columns={"TodayBalance": "margin_purchase_money_balance"})
        .copy()
    )
    margin_money["ma20"] = margin_money["margin_purchase_money_balance"].rolling(20, min_periods=20).mean()
    margin_money["margin_metric"] = (
        (margin_money["margin_purchase_money_balance"] - margin_money["ma20"]) / margin_money["ma20"] * 100.0
    )

    share_rows = df[df["name"].isin(["MarginPurchase", "ShortSale"])][["date", "name", "TodayBalance"]].copy()
    share_pivot = (
        share_rows.pivot(index="date", columns="name", values="TodayBalance")
        .rename_axis(columns=None)
        .reset_index()
    )
    share_pivot["short_ratio_metric"] = np.where(
        share_pivot.get("MarginPurchase", 0) > 0,
        share_pivot.get("ShortSale", 0) / share_pivot.get("MarginPurchase", 0) * 100.0,
        np.nan,
    )

    merged = margin_money.merge(share_pivot[["date", "short_ratio_metric"]], on="date", how="left")
    return merged[["date", "margin_purchase_money_balance", "margin_metric", "short_ratio_metric"]]


def fetch_foreign(session: requests.Session, fetch_start: str, end_date: str | None) -> pd.DataFrame:
    df = fetch_dataframe(session, "TaiwanStockTotalInstitutionalInvestors", start_date=fetch_start, end_date=end_date)
    if df.empty:
        raise RuntimeError("TaiwanStockTotalInstitutionalInvestors returned no data.")

    df = df[df["name"] == "Foreign_Investor"].copy()
    df["date"] = pd.to_datetime(df["date"])
    df["buy"] = pd.to_numeric(df["buy"], errors="coerce")
    df["sell"] = pd.to_numeric(df["sell"], errors="coerce")
    df = df.dropna(subset=["buy", "sell"]).sort_values("date").reset_index(drop=True)
    df["foreign_net"] = df["buy"] - df["sell"]
    df["foreign_metric"] = df["foreign_net"].rolling(5, min_periods=5).sum()
    return df[["date", "foreign_net", "foreign_metric"]]


def fetch_pc_ratio(session: requests.Session, fetch_start: str, end_date: str | None) -> pd.DataFrame:
    df = fetch_dataframe(session, "TaiwanOptionDaily", start_date=fetch_start, end_date=end_date, data_id="TXO")
    if df.empty:
        raise RuntimeError("TaiwanOptionDaily returned no data for TXO.")

    df["date"] = pd.to_datetime(df["date"])
    df["open_interest"] = pd.to_numeric(df["open_interest"], errors="coerce").fillna(0.0)
    df["call_put"] = df["call_put"].astype(str).str.lower()
    df["trading_session"] = df["trading_session"].astype(str).str.lower()
    df = df[df["trading_session"] == "position"].copy()

    grouped = (
        df.groupby(["date", "call_put"], as_index=False)["open_interest"]
        .sum()
        .pivot(index="date", columns="call_put", values="open_interest")
        .fillna(0.0)
        .rename_axis(columns=None)
        .reset_index()
    )
    grouped["put_oi"] = grouped.get("put", 0.0)
    grouped["call_oi"] = grouped.get("call", 0.0)
    grouped["pc_ratio_metric"] = np.where(grouped["call_oi"] > 0, grouped["put_oi"] / grouped["call_oi"], np.nan)
    return grouped[["date", "put_oi", "call_oi", "pc_ratio_metric"]]


def cache_json_path(cache_dir: Path, category: str, day: pd.Timestamp) -> Path:
    return cache_dir / category / f"{day:%Y-%m-%d}.json"


def load_cached_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except json.JSONDecodeError:
        return None


def save_cached_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False)


def parse_twse_count(raw: str) -> int:
    match = re.match(r"([\d,]+)", raw.strip())
    if not match:
        raise ValueError(f"Unexpected TWSE count format: {raw}")
    return int(match.group(1).replace(",", ""))


def load_response_json(response: requests.Response, source: str) -> dict[str, Any]:
    text = response.text.strip()
    if not text:
        raise RuntimeError(f"{source} returned an empty response body.")
    try:
        return response.json()
    except Exception as exc:  # noqa: BLE001
        snippet = text[:160].replace("\n", " ")
        raise RuntimeError(f"{source} returned non-JSON content: {snippet}") from exc


def fetch_twse_breadth(public_session: requests.Session, day: pd.Timestamp) -> dict[str, Any]:
    params = {
        "response": "json",
        "date": day.strftime("%Y%m%d"),
        "type": "ALLBUT0999",
        "_": int(time.time() * 1000),
    }
    last_error: Exception | None = None

    for attempt in range(4):
        try:
            response = public_session.get(TWSE_MI_INDEX_URL, params=params, timeout=TIMEOUT, verify=False)
            response.raise_for_status()
            payload = load_response_json(response, f"TWSE {day:%Y-%m-%d}")

            tables = payload.get("tables", [])
            candidate_tables = []
            for table in tables:
                fields = table.get("fields", [])
                title = str(table.get("title") or "")
                if title == "漲跌證券數合計":
                    candidate_tables.append(table)
                elif "類型" in fields and "股票" in fields:
                    candidate_tables.append(table)

            for table in candidate_tables:
                fields = table.get("fields", [])
                if "股票" not in fields:
                    continue
                stock_index = fields.index("股票")
                stats: dict[str, int] = {}
                for row in table.get("data", []):
                    label = str(row[0])
                    if label.startswith("上漲"):
                        stats["advance"] = parse_twse_count(str(row[stock_index]))
                    elif label.startswith("下跌"):
                        stats["decline"] = parse_twse_count(str(row[stock_index]))
                    elif label.startswith("持平"):
                        stats["unchanged"] = parse_twse_count(str(row[stock_index]))
                if {"advance", "decline", "unchanged"} <= stats.keys():
                    return {"date": day.strftime("%Y-%m-%d"), **stats}

            legacy_fields = payload.get("fields7")
            legacy_data = payload.get("data7")
            if legacy_fields and legacy_data and "股票" in legacy_fields:
                stock_index = legacy_fields.index("股票")
                stats = {}
                for row in legacy_data:
                    label = str(row[0])
                    if label.startswith("上漲"):
                        stats["advance"] = parse_twse_count(str(row[stock_index]))
                    elif label.startswith("下跌"):
                        stats["decline"] = parse_twse_count(str(row[stock_index]))
                    elif label.startswith("持平"):
                        stats["unchanged"] = parse_twse_count(str(row[stock_index]))
                if {"advance", "decline", "unchanged"} <= stats.keys():
                    return {"date": day.strftime("%Y-%m-%d"), **stats}

            raise RuntimeError(f"TWSE breadth table not found for {day:%Y-%m-%d}.")
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep(2 ** attempt)

    assert last_error is not None
    raise last_error


def roc_date(day: pd.Timestamp) -> str:
    return f"{day.year - 1911:03d}/{day.month:02d}/{day.day:02d}"


def parse_tpex_single_value(html: str, label: str) -> int:
    pattern = re.escape(label) + r"</td>\s*<td[^>]*>([\d,]+)</td>"
    match = re.search(pattern, html, flags=re.S)
    if not match:
        raise RuntimeError(f"TPEx label not found: {label}")
    return int(match.group(1).replace(",", ""))


def fetch_tpex_breadth(public_session: requests.Session, day: pd.Timestamp) -> dict[str, Any]:
    params = {"d": roc_date(day), "l": "zh-tw", "o": "htm"}
    last_error: Exception | None = None

    for attempt in range(4):
        try:
            response = public_session.get(TPEX_MARKET_HIGHLIGHT_URL, params=params, timeout=TIMEOUT)
            response.raise_for_status()
            html = response.text
            return {
                "date": day.strftime("%Y-%m-%d"),
                "advance": parse_tpex_single_value(html, "上漲家數"),
                "decline": parse_tpex_single_value(html, "下跌家數"),
                "unchanged": parse_tpex_single_value(html, "平盤家數"),
            }
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep(2 ** attempt)

    assert last_error is not None
    raise last_error


def fetch_breadth(public_session: requests.Session, trading_days: list[pd.Timestamp], cache_dir: Path) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    total = len(trading_days)
    previous_twse_payload: dict[str, Any] | None = None
    previous_tpex_payload: dict[str, Any] | None = None

    for idx, day in enumerate(trading_days, start=1):
        twse_path = cache_json_path(cache_dir, "breadth_twse", day)
        tpex_path = cache_json_path(cache_dir, "breadth_tpex", day)

        twse_payload = load_cached_json(twse_path)
        if twse_payload is None:
            try:
                twse_payload = fetch_twse_breadth(public_session, day)
                save_cached_json(twse_path, twse_payload)
                time.sleep(0.2)
            except Exception as exc:  # noqa: BLE001
                if previous_twse_payload is None:
                    raise
                print(f"[breadth-warning] TWSE fallback for {day:%Y-%m-%d}: {exc}", flush=True)
                twse_payload = {
                    "date": day.strftime("%Y-%m-%d"),
                    "advance": previous_twse_payload["advance"],
                    "decline": previous_twse_payload["decline"],
                    "unchanged": previous_twse_payload["unchanged"],
                }
                save_cached_json(twse_path, twse_payload)

        tpex_payload = load_cached_json(tpex_path)
        if tpex_payload is None:
            try:
                tpex_payload = fetch_tpex_breadth(public_session, day)
                save_cached_json(tpex_path, tpex_payload)
                time.sleep(0.1)
            except Exception as exc:  # noqa: BLE001
                if previous_tpex_payload is None:
                    raise
                print(f"[breadth-warning] TPEx fallback for {day:%Y-%m-%d}: {exc}", flush=True)
                tpex_payload = {
                    "date": day.strftime("%Y-%m-%d"),
                    "advance": previous_tpex_payload["advance"],
                    "decline": previous_tpex_payload["decline"],
                    "unchanged": previous_tpex_payload["unchanged"],
                }
                save_cached_json(tpex_path, tpex_payload)

        advance_total = int(twse_payload["advance"]) + int(tpex_payload["advance"])
        decline_total = int(twse_payload["decline"]) + int(tpex_payload["decline"])
        unchanged_total = int(twse_payload["unchanged"]) + int(tpex_payload["unchanged"])
        directional_total = advance_total + decline_total
        breadth_metric = (advance_total / directional_total) * 100.0 if directional_total else np.nan

        rows.append(
            {
                "date": day.strftime("%Y-%m-%d"),
                "twse_advance": int(twse_payload["advance"]),
                "twse_decline": int(twse_payload["decline"]),
                "twse_unchanged": int(twse_payload["unchanged"]),
                "tpex_advance": int(tpex_payload["advance"]),
                "tpex_decline": int(tpex_payload["decline"]),
                "tpex_unchanged": int(tpex_payload["unchanged"]),
                "advance_total": advance_total,
                "decline_total": decline_total,
                "unchanged_total": unchanged_total,
                "breadth_metric": breadth_metric,
            }
        )

        if idx == 1 or idx == total or idx % 25 == 0:
            print(f"[breadth] {idx}/{total} {day:%Y-%m-%d}", flush=True)

        previous_twse_payload = twse_payload
        previous_tpex_payload = tpex_payload

    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    return df.sort_values("date").reset_index(drop=True)


def build_feature_frame(
    finmind_session: requests.Session,
    public_session: requests.Session,
    *,
    fetch_start: str,
    percentile_window: int,
    min_periods: int,
    cache_dir: Path,
    end_date: str | None,
) -> pd.DataFrame:
    taiex = fetch_taiex(finmind_session, fetch_start, end_date)
    actual_end = taiex["date"].max()
    trading_days = taiex["date"].drop_duplicates().sort_values().tolist()

    margin = fetch_margin(finmind_session, fetch_start, actual_end.strftime("%Y-%m-%d"))
    foreign = fetch_foreign(finmind_session, fetch_start, actual_end.strftime("%Y-%m-%d"))
    pc_ratio = fetch_pc_ratio(finmind_session, fetch_start, actual_end.strftime("%Y-%m-%d"))
    breadth = fetch_breadth(public_session, trading_days, cache_dir)

    frame = taiex.merge(breadth, on="date", how="left")
    frame = frame.merge(margin, on="date", how="left")
    frame = frame.merge(foreign, on="date", how="left")
    frame = frame.merge(pc_ratio, on="date", how="left")

    for spec in INDICATORS:
        frame[spec.score_column] = rolling_percentile(
            frame[spec.raw_column],
            percentile_window,
            invert=spec.invert,
            min_periods=min_periods,
        )

    weighted_total = sum(frame[spec.score_column] * spec.weight for spec in INDICATORS)
    frame["fear_greed_index_raw"] = weighted_total.round(2)
    return frame.sort_values("date").reset_index(drop=True)


def build_index_frame(
    finmind_session: requests.Session,
    public_session: requests.Session,
    *,
    analysis_days: int,
    warmup_days: int,
    percentile_window: int,
    min_periods: int,
    smoothing_span: int,
    cache_dir: Path,
    end_date: str | None,
) -> pd.DataFrame:
    requested_end = pd.Timestamp(end_date).normalize() if end_date else pd.Timestamp.today().normalize()
    analysis_start = requested_end - pd.Timedelta(days=analysis_days)
    fetch_start = (analysis_start - pd.Timedelta(days=warmup_days)).strftime("%Y-%m-%d")

    frame = build_feature_frame(
        finmind_session,
        public_session,
        fetch_start=fetch_start,
        percentile_window=percentile_window,
        min_periods=min_periods,
        cache_dir=cache_dir,
        end_date=end_date,
    )
    actual_end = frame["date"].max()
    analysis_start = actual_end - pd.Timedelta(days=analysis_days)
    frame["fear_greed_index"] = ema_with_seed(frame["fear_greed_index_raw"], span=smoothing_span).round(2)
    frame["rating"] = frame["fear_greed_index"].apply(lambda value: rating_label_en(value) if pd.notna(value) else None)
    return frame.loc[frame["date"] >= analysis_start].reset_index(drop=True)


def build_incremental_frame(
    finmind_session: requests.Session,
    public_session: requests.Session,
    *,
    output_dir: Path,
    analysis_days: int,
    warmup_days: int,
    percentile_window: int,
    min_periods: int,
    smoothing_span: int,
    cache_dir: Path,
    end_date: str | None,
) -> pd.DataFrame:
    existing_frame = load_existing_history_frame(output_dir)
    existing_last_date_from_json = load_existing_history_json_last_date(output_dir)

    if existing_frame is None:
        if existing_last_date_from_json is not None:
            print("[incremental] history.json exists but history.csv is missing; falling back to a full rebuild.", flush=True)
        return build_index_frame(
            finmind_session,
            public_session,
            analysis_days=analysis_days,
            warmup_days=warmup_days,
            percentile_window=percentile_window,
            min_periods=min_periods,
            smoothing_span=smoothing_span,
            cache_dir=cache_dir,
            end_date=end_date,
        )

    existing_last_date = existing_frame["date"].max()
    if existing_last_date_from_json is not None and existing_last_date_from_json != existing_last_date:
        print("[incremental] history.json and history.csv disagree; using history.csv as the source of truth.", flush=True)

    requested_end = pd.Timestamp(end_date).normalize() if end_date else pd.Timestamp.today().normalize()
    if end_date and requested_end < existing_last_date:
        print("[incremental] Requested end_date is older than cached output; running a full rebuild instead.", flush=True)
        return build_index_frame(
            finmind_session,
            public_session,
            analysis_days=analysis_days,
            warmup_days=warmup_days,
            percentile_window=percentile_window,
            min_periods=min_periods,
            smoothing_span=smoothing_span,
            cache_dir=cache_dir,
            end_date=end_date,
        )

    recompute_start = max(
        existing_frame["date"].min(),
        existing_last_date - pd.Timedelta(days=DEFAULT_INCREMENTAL_RECOMPUTE_DAYS),
    )
    fetch_start = (recompute_start - pd.Timedelta(days=warmup_days)).strftime("%Y-%m-%d")

    frame = build_feature_frame(
        finmind_session,
        public_session,
        fetch_start=fetch_start,
        percentile_window=percentile_window,
        min_periods=min_periods,
        cache_dir=cache_dir,
        end_date=end_date,
    )
    actual_end = frame["date"].max()

    if not end_date and actual_end <= existing_last_date:
        print(f"[incremental] No missing trading dates after {existing_last_date:%Y-%m-%d}; reusing cached output.", flush=True)
        analysis_start = existing_last_date - pd.Timedelta(days=analysis_days)
        return existing_frame.loc[existing_frame["date"] >= analysis_start].reset_index(drop=True)

    recompute_frame = frame.loc[frame["date"] >= recompute_start].copy()
    ema_seed_series = existing_frame.loc[existing_frame["date"] < recompute_start, "fear_greed_index"].dropna()
    ema_seed = float(ema_seed_series.iloc[-1]) if not ema_seed_series.empty else None
    recompute_frame["fear_greed_index"] = ema_with_seed(
        recompute_frame["fear_greed_index_raw"],
        span=smoothing_span,
        seed=ema_seed,
    ).round(2)
    recompute_frame["rating"] = recompute_frame["fear_greed_index"].apply(
        lambda value: rating_label_en(value) if pd.notna(value) else None
    )

    preserved_frame = existing_frame.loc[existing_frame["date"] < recompute_start].copy()
    combined = pd.concat([preserved_frame, recompute_frame], ignore_index=True, sort=False)
    combined = normalize_history_frame(combined)

    analysis_start = actual_end - pd.Timedelta(days=analysis_days)
    final_frame = combined.loc[combined["date"] >= analysis_start].reset_index(drop=True)
    print(
        f"[incremental] Updated from {existing_last_date:%Y-%m-%d} to {actual_end:%Y-%m-%d} "
        f"with a recompute window starting {recompute_start:%Y-%m-%d}.",
        flush=True,
    )
    return final_frame


def build_latest_payload(frame: pd.DataFrame) -> dict[str, Any]:
    latest = frame.dropna(subset=["fear_greed_index"]).tail(1)
    if latest.empty:
        raise RuntimeError("No valid fear/greed index values were produced.")

    row = latest.iloc[0]
    indicator_names = {
        "momentum_score": "Momentum",
        "breadth_score": "Breadth",
        "margin_score": "Margin",
        "foreign_score": "Foreign",
        "pc_ratio_score": "P/C Ratio",
        "volatility_score": "Volatility",
    }
    breakdown = []
    for spec in INDICATORS:
        score = float(row[spec.score_column])
        breakdown.append(
            {
                "name": indicator_names.get(spec.score_column, spec.score_column),
                "score": round(score, 2),
                "weight": spec.weight,
                "weighted_score": round(score * spec.weight, 2),
                "raw_value": None if pd.isna(row[spec.raw_column]) else round(float(row[spec.raw_column]), 6),
                "invert": spec.invert,
            }
        )

    return {
        "date": row["date"].strftime("%Y-%m-%d"),
        "fear_greed_index_raw": round(float(row["fear_greed_index_raw"]), 2),
        "fear_greed_index": round(float(row["fear_greed_index"]), 2),
        "rating": rating_label_en(float(row["fear_greed_index"])),
        "breakdown": breakdown,
    }


def build_history_payload(frame: pd.DataFrame) -> list[dict[str, Any]]:
    payload: list[dict[str, Any]] = []
    valid_rows = frame.dropna(subset=["fear_greed_index"]).copy()
    for _, row in valid_rows.iterrows():
        payload.append(
            {
                "date": row["date"].strftime("%Y-%m-%d"),
                "fear_greed_index_raw": round(float(row["fear_greed_index_raw"]), 2),
                "fear_greed_index": round(float(row["fear_greed_index"]), 2),
                "rating": row["rating"],
                "indicators": {
                    "momentum_score": round(float(row["momentum_score"]), 2),
                    "breadth_score": round(float(row["breadth_score"]), 2),
                    "margin_score": round(float(row["margin_score"]), 2),
                    "foreign_score": round(float(row["foreign_score"]), 2),
                    "pc_ratio_score": round(float(row["pc_ratio_score"]), 2),
                    "volatility_score": round(float(row["volatility_score"]), 2),
                },
            }
        )
    return payload


def build_pages_index(latest_payload: dict[str, Any], history_count: int) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TW Fear & Greed</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 40px; color: #0f172a; background: #f8fafc; }}
    main {{ max-width: 960px; margin: 0 auto; }}
    .card {{ background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px 24px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06); }}
    img {{ width: 100%; border-radius: 12px; border: 1px solid #e2e8f0; background: white; }}
    a {{ color: #0f4c81; }}
    ul {{ line-height: 1.8; }}
  </style>
</head>
<body>
  <main>
    <div class="card">
      <h1>TW Fear &amp; Greed Index</h1>
      <p>Latest update: <strong>{latest_payload["date"]}</strong></p>
      <p>Latest score: <strong>{latest_payload["fear_greed_index"]}</strong> ({latest_payload["rating"]})</p>
      <p>Raw score: <strong>{latest_payload["fear_greed_index_raw"]}</strong></p>
      <p>History points: <strong>{history_count}</strong></p>
      <ul>
        <li><a href="./tw_fear_greed_1y_latest.json">Latest JSON</a></li>
        <li><a href="./tw_fear_greed_1y_history.json">History JSON</a></li>
        <li><a href="./tw_fear_greed_1y_history.csv">History CSV</a></li>
        <li><a href="./tw_fear_greed_1y_chart.png">Chart PNG</a></li>
      </ul>
      <img src="./tw_fear_greed_1y_chart.png" alt="TW Fear & Greed chart">
    </div>
  </main>
</body>
</html>
"""


def fallback_output_path(path: Path) -> Path:
    timestamp = pd.Timestamp.now().strftime("%Y%m%d_%H%M%S")
    return path.with_name(f"{path.stem}_{timestamp}{path.suffix}")


def write_csv_with_fallback(df: pd.DataFrame, path: Path) -> Path:
    try:
        df.to_csv(path, index=False, encoding="utf-8-sig")
        return path
    except PermissionError:
        fallback = fallback_output_path(path)
        df.to_csv(fallback, index=False, encoding="utf-8-sig")
        return fallback


def write_json_with_fallback(payload: dict[str, Any], path: Path) -> Path:
    try:
        with path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
        return path
    except PermissionError:
        fallback = fallback_output_path(path)
        with fallback.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
        return fallback


def write_text_with_fallback(content: str, path: Path) -> Path:
    try:
        with path.open("w", encoding="utf-8") as handle:
            handle.write(content)
        return path
    except PermissionError:
        fallback = fallback_output_path(path)
        with fallback.open("w", encoding="utf-8") as handle:
            handle.write(content)
        return fallback


def save_figure_with_fallback(fig: plt.Figure, path: Path) -> Path:
    try:
        fig.savefig(path, bbox_inches="tight")
        return path
    except PermissionError:
        fallback = fallback_output_path(path)
        fig.savefig(fallback, bbox_inches="tight")
        return fallback


def save_outputs(frame: pd.DataFrame, latest_payload: dict[str, Any], output_dir: Path) -> tuple[Path, Path, Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    history_path = output_dir / "tw_fear_greed_1y_history.csv"
    history_json_path = output_dir / "tw_fear_greed_1y_history.json"
    latest_path = output_dir / "tw_fear_greed_1y_latest.json"
    index_path = output_dir / "index.html"

    export = frame.copy()
    export["date"] = export["date"].dt.strftime("%Y-%m-%d")
    history_path = write_csv_with_fallback(export, history_path)
    history_payload = build_history_payload(frame)
    history_json_path = write_json_with_fallback({"history": history_payload}, history_json_path)
    latest_path = write_json_with_fallback(latest_payload, latest_path)
    index_path = write_text_with_fallback(build_pages_index(latest_payload, len(history_payload)), index_path)
    return history_path, history_json_path, latest_path, index_path


def save_chart(frame: pd.DataFrame, latest_payload: dict[str, Any], output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    chart_path = output_dir / "tw_fear_greed_1y_chart.png"

    plot_df = frame.dropna(subset=["fear_greed_index"]).copy()
    if plot_df.empty:
        raise RuntimeError("No valid fear/greed index values available for chart output.")

    fig, ax = plt.subplots(figsize=(14, 7), dpi=160)

    bands = [
        (0, 25, "#f6c7c7"),
        (25, 45, "#f8ddc3"),
        (45, 55, "#efe7b2"),
        (55, 75, "#d8ebc5"),
        (75, 100, "#c6e6c7"),
    ]
    for low, high, color in bands:
        ax.axhspan(low, high, color=color, alpha=0.55, linewidth=0)

    ax.plot(
        plot_df["date"],
        plot_df["fear_greed_index_raw"],
        color="#94a3b8",
        linewidth=1.2,
        alpha=0.85,
        label="Raw Index",
    )
    ax.plot(
        plot_df["date"],
        plot_df["fear_greed_index"],
        color="#184e77",
        linewidth=2.8,
        label="5D EMA Index",
    )
    ax.scatter([plot_df["date"].iloc[-1]], [plot_df["fear_greed_index"].iloc[-1]], color="#d62828", s=46, zorder=5)
    ax.annotate(
        f"{latest_payload['date']}  {latest_payload['fear_greed_index']:.2f}\n{rating_label_en(float(latest_payload['fear_greed_index']))}",
        xy=(plot_df["date"].iloc[-1], plot_df["fear_greed_index"].iloc[-1]),
        xytext=(-90, 18),
        textcoords="offset points",
        fontsize=10,
        color="#1f2937",
        bbox={"boxstyle": "round,pad=0.35", "fc": "white", "ec": "#cbd5e1", "alpha": 0.95},
        arrowprops={"arrowstyle": "->", "color": "#64748b", "lw": 1},
    )

    ax.set_title("Taiwan Fear & Greed Index (1Y)", fontsize=16, pad=16)
    ax.set_ylabel("Score (0-100)", fontsize=11)
    ax.set_xlabel("Date", fontsize=11)
    ax.set_ylim(0, 100)
    ax.set_yticks([0, 25, 45, 55, 75, 100])
    ax.grid(axis="y", color="#94a3b8", alpha=0.25, linewidth=0.8)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.legend(loc="upper left", frameon=False)

    fig.tight_layout()
    chart_path = save_figure_with_fallback(fig, chart_path)
    plt.close(fig)
    return chart_path


def save_overlay_chart(frame: pd.DataFrame, latest_payload: dict[str, Any], output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    chart_path = output_dir / "tw_fear_greed_vs_taiex.png"

    plot_df = frame.dropna(subset=["fear_greed_index", "price"]).copy()
    if plot_df.empty:
        raise RuntimeError("No valid values available for overlay chart output.")

    fig, ax_left = plt.subplots(figsize=(14, 7), dpi=160)
    ax_right = ax_left.twinx()

    bands = [
        (0, 25, "#f6c7c7"),
        (25, 45, "#f8ddc3"),
        (45, 55, "#efe7b2"),
        (55, 75, "#d8ebc5"),
        (75, 100, "#c6e6c7"),
    ]
    for low, high, color in bands:
        ax_left.axhspan(low, high, color=color, alpha=0.45, linewidth=0)

    line_fg_raw, = ax_left.plot(
        plot_df["date"],
        plot_df["fear_greed_index_raw"],
        color="#94a3b8",
        linewidth=1.1,
        alpha=0.7,
        label="Fear & Greed Raw",
    )
    line_fg, = ax_left.plot(
        plot_df["date"],
        plot_df["fear_greed_index"],
        color="#184e77",
        linewidth=2.6,
        label="Fear & Greed 5D EMA",
    )
    line_taiex, = ax_right.plot(
        plot_df["date"],
        plot_df["price"],
        color="#d62828",
        linewidth=2.0,
        label="TAIEX",
    )

    ax_left.scatter(
        [plot_df["date"].iloc[-1]],
        [plot_df["fear_greed_index"].iloc[-1]],
        color="#184e77",
        s=36,
        zorder=5,
    )
    ax_right.scatter(
        [plot_df["date"].iloc[-1]],
        [plot_df["price"].iloc[-1]],
        color="#d62828",
        s=36,
        zorder=5,
    )

    ax_left.annotate(
        f"FG {latest_payload['fear_greed_index']:.2f}",
        xy=(plot_df["date"].iloc[-1], plot_df["fear_greed_index"].iloc[-1]),
        xytext=(-70, 16),
        textcoords="offset points",
        fontsize=10,
        color="#184e77",
        bbox={"boxstyle": "round,pad=0.25", "fc": "white", "ec": "#cbd5e1", "alpha": 0.95},
    )
    ax_right.annotate(
        f"TAIEX {plot_df['price'].iloc[-1]:,.0f}",
        xy=(plot_df["date"].iloc[-1], plot_df["price"].iloc[-1]),
        xytext=(-70, -30),
        textcoords="offset points",
        fontsize=10,
        color="#d62828",
        bbox={"boxstyle": "round,pad=0.25", "fc": "white", "ec": "#fecaca", "alpha": 0.95},
    )

    ax_left.set_title("TW Fear & Greed vs TAIEX (1Y)", fontsize=16, pad=16)
    ax_left.set_xlabel("Date", fontsize=11)
    ax_left.set_ylabel("Fear & Greed Score", fontsize=11, color="#184e77")
    ax_right.set_ylabel("TAIEX", fontsize=11, color="#d62828")
    ax_left.set_ylim(0, 100)
    ax_left.set_yticks([0, 25, 45, 55, 75, 100])
    ax_left.grid(axis="y", color="#94a3b8", alpha=0.25, linewidth=0.8)
    ax_left.spines["top"].set_visible(False)
    ax_right.spines["top"].set_visible(False)
    ax_left.tick_params(axis="y", colors="#184e77")
    ax_right.tick_params(axis="y", colors="#d62828")

    lines = [line_fg_raw, line_fg, line_taiex]
    labels = [line.get_label() for line in lines]
    ax_left.legend(lines, labels, loc="upper left", frameon=False)

    fig.tight_layout()
    chart_path = save_figure_with_fallback(fig, chart_path)
    plt.close(fig)
    return chart_path


def main() -> int:
    args = parse_args()
    token = require_token(args.token)
    output_dir = Path(args.output_dir)
    cache_dir = Path(args.cache_dir)
    finmind_session = create_finmind_session(token)
    public_session = create_public_session()

    frame = build_incremental_frame(
        finmind_session,
        public_session,
        output_dir=output_dir,
        analysis_days=args.analysis_days,
        warmup_days=args.warmup_days,
        percentile_window=args.percentile_window,
        min_periods=args.min_periods,
        smoothing_span=args.smoothing_span,
        cache_dir=cache_dir,
        end_date=args.end_date,
    )
    latest_payload = build_latest_payload(frame)
    history_path, history_json_path, latest_path, index_path = save_outputs(frame, latest_payload, output_dir)
    chart_path = save_chart(frame, latest_payload, output_dir)
    overlay_chart_path = save_overlay_chart(frame, latest_payload, output_dir)

    print(f"Latest date   : {latest_payload['date']}")
    print(f"Fear/Greed    : {latest_payload['fear_greed_index']} ({latest_payload['rating']})")
    print(f"Raw index     : {latest_payload['fear_greed_index_raw']}")
    for item in latest_payload["breakdown"]:
        print(f"- {item['name']}: score={item['score']:.2f}, weighted={item['weighted_score']:.2f}, raw={item['raw_value']}")
    print(f"History CSV   : {history_path}")
    print(f"History JSON  : {history_json_path}")
    print(f"Latest JSON   : {latest_path}")
    print(f"Pages Index   : {index_path}")
    print(f"Chart PNG     : {chart_path}")
    print(f"Overlay PNG   : {overlay_chart_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
