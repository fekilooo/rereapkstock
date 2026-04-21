import axios from 'axios';

export interface OHLCV {
  date: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockInfo {
  symbol: string;
  shortName: string;
  longName: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketPreviousClose: number;
  currency: string;
}

const BASE = 'https://query1.finance.yahoo.com';

function normalizeSymbol(raw: string): string {
  const upper = raw.toUpperCase().trim();
  if (/^\d{4}$/.test(upper)) return `${upper}.TW`;
  if (/^\d{4,6}$/.test(upper)) return `${upper}.TW`;
  return upper;
}

export async function fetchOHLCV(
  rawSymbol: string,
  years: number = 4
): Promise<OHLCV[]> {
  const symbol = normalizeSymbol(rawSymbol);
  const range = `${Math.ceil(years + 0.5)}y`;
  const url = `${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}`;

  const { data } = await axios.get(url, {
    params: { range, interval: '1d', events: 'div,split' },
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 15000,
  });

  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${symbol}`);

  const timestamps: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const adj: (number | null)[] = result.indicators?.adjclose?.[0]?.adjclose ?? [];
  const opens: (number | null)[] = q.open ?? [];
  const highs: (number | null)[] = q.high ?? [];
  const lows: (number | null)[] = q.low ?? [];
  const closes: (number | null)[] = q.close ?? [];
  const volumes: (number | null)[] = q.volume ?? [];

  const ohlcv: OHLCV[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const c = adj[i] ?? closes[i];
    if (c == null || c <= 0) continue;
    ohlcv.push({
      date: timestamps[i] * 1000,
      open: opens[i] ?? c,
      high: highs[i] ?? c,
      low: lows[i] ?? c,
      close: c,
      volume: volumes[i] ?? 0,
    });
  }
  return ohlcv;
}

export async function fetchQuote(rawSymbol: string): Promise<StockInfo> {
  const symbol = normalizeSymbol(rawSymbol);
  const url = `${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}`;

  const { data } = await axios.get(url, {
    params: { range: '5d', interval: '1d', events: 'div,split' },
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 10000,
  });

  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta) throw new Error(`No quote for ${symbol}`);

  const regularMarketPrice = meta.regularMarketPrice ?? 0;
  const previousClose = meta.previousClose ?? meta.chartPreviousClose ?? 0;
  const regularMarketChange = regularMarketPrice - previousClose;
  const regularMarketChangePercent =
    previousClose > 0 ? (regularMarketChange / previousClose) * 100 : 0;

  return {
    symbol,
    shortName: meta.shortName ?? meta.longName ?? symbol,
    longName: meta.longName ?? meta.shortName ?? symbol,
    regularMarketPrice,
    regularMarketChange,
    regularMarketChangePercent,
    regularMarketPreviousClose: previousClose,
    currency: meta.currency ?? 'TWD',
  };
}

export async function searchSymbol(query: string): Promise<StockInfo[]> {
  const url = `${BASE}/v1/finance/search`;
  const { data } = await axios.get(url, {
    params: { q: query, quotesCount: 8, newsCount: 0 },
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 10000,
  });

  const quotes = data?.quotes ?? [];
  return quotes
    .filter((q: any) => q.quoteType === 'EQUITY' || q.quoteType === 'ETF')
    .map((q: any) => ({
      symbol: q.symbol,
      shortName: q.shortname ?? q.longname ?? q.symbol,
      longName: q.longname ?? q.shortname ?? q.symbol,
      regularMarketPrice: 0,
      regularMarketChange: 0,
      regularMarketChangePercent: 0,
      regularMarketPreviousClose: 0,
      currency: 'TWD',
    }));
}
