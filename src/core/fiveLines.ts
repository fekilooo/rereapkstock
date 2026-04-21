import { OHLCV } from '../api/yahoo';

// 9 級訊號（對應 lohas-stock-ckc216 services.py get_signal）
export type Signal =
  | 'buy2' | 'buy1'
  | 'buy2_wait' | 'buy1_wait'
  | 'hold'
  | 'sell1' | 'sell2'
  | 'sell1_hold' | 'sell2_hold';

export interface FiveLinesResult {
  dates: number[];                  // 顯示段日期 (ms)
  close: number[];                  // 顯示段收盤價（已除權息、修正分割）
  trend: number[];                  // 線性迴歸 LR
  optimistic: number[];             // LR + z95·σ_resid
  resistance: number[];             // LR + z69·σ_resid
  support: number[];                // LR - z69·σ_resid
  pessimistic: number[];            // LR - z95·σ_resid
  channelMa: (number | null)[];     // MA100（樂活通道中線）
  channelTop: (number | null)[];    // MA100 + 2·σ_roll
  channelBot: (number | null)[];    // MA100 - 2·σ_roll
  signal: Signal;
  currentPos: number;               // 0~100 位置百分位（以 ±2σ 為邊界）
  stdResidual: number;
  years: number;
}

// norm.ppf((1+0.69)/2) 與 norm.ppf((1+0.95)/2)
const Z69 = 1.015222;
const Z95 = 1.959964;

// ── 工具 ────────────────────────────────────────────────

// 簡易分割偵測（對齊 report_generator.py fix_splits）
function fixSplits(closes: number[]): number[] {
  const arr = closes.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const prev = arr[i - 1];
    if (prev <= 0) continue;
    const ratio = arr[i] / prev;
    if (ratio < 0.6) {
      const sf = Math.round(1 / ratio);
      if (sf >= 2 && sf <= 20) {
        for (let j = 0; j < i; j++) arr[j] = arr[j] / sf;
      }
    } else if (ratio > 1.67) {
      const sf = Math.round(ratio);
      if (sf >= 2 && sf <= 20) {
        for (let j = 0; j < i; j++) arr[j] = arr[j] * sf;
      }
    }
  }
  return arr;
}

function linearRegression(X: number[], Y: number[]): number[] {
  const n = X.length;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += X[i]; sy += Y[i]; }
  const mx = sx / n, my = sy / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const dx = X[i] - mx, dy = Y[i] - my;
    num += dx * dy;
    den += dx * dx;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  const predict = new Array<number>(n);
  for (let i = 0; i < n; i++) predict[i] = slope * X[i] + intercept;
  return predict;
}

// pandas Series.std() 預設 ddof=1（樣本標準差）
function sampleStd(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += values[i];
  const m = s / n;
  let sq = 0;
  for (let i = 0; i < n; i++) sq += (values[i] - m) ** 2;
  return Math.sqrt(sq / (n - 1));
}

function rollingMean(data: number[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (i >= window) sum -= data[i - window];
    out.push(i < window - 1 ? null : sum / window);
  }
  return out;
}

// pandas rolling().std() 預設 ddof=1
function rollingStd(data: number[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < window - 1) { out.push(null); continue; }
    let s = 0;
    for (let j = i - window + 1; j <= i; j++) s += data[j];
    const m = s / window;
    let sq = 0;
    for (let j = i - window + 1; j <= i; j++) sq += (data[j] - m) ** 2;
    out.push(Math.sqrt(sq / (window - 1)));
  }
  return out;
}

// ── 主函式 ──────────────────────────────────────────────

export function calcFiveLines(ohlcv: OHLCV[], years: number): FiveLinesResult | null {
  if (!ohlcv.length) return null;

  // 1) 對全序列做分割修正（yfinance 未記錄的反向分割 / ETF 減資）
  const allCloses = fixSplits(ohlcv.map(d => d.close));
  const allDates = ohlcv.map(d => d.date);

  // 2) 樂活通道：在「全序列」上做 MA100 ± 2·σ（ddof=1）
  const chanWin = Math.min(100, Math.max(10, allCloses.length - 1));
  const maFull = rollingMean(allCloses, chanWin);
  const stdFull = rollingStd(allCloses, chanWin);

  // 3) 依 calendar days 切顯示段（對齊 report_generator 用 DateOffset(days=int(years*365)))
  const lastDate = allDates[allDates.length - 1];
  const cutoff = lastDate - Math.floor(years * 365) * 86400000;
  let sliceFrom = 0;
  for (let i = 0; i < allDates.length; i++) {
    if (allDates[i] >= cutoff) { sliceFrom = i; break; }
  }

  const dates = allDates.slice(sliceFrom);
  const closes = allCloses.slice(sliceFrom);
  if (closes.length < 20) return null;

  // 4) 線性迴歸（X = 日曆天數 since epoch，與 Date.toordinal 等價）
  const X = dates.map(d => Math.floor(d / 86400000));
  const lr = linearRegression(X, closes);

  // 5) 殘差樣本標準差
  const residuals = closes.map((c, i) => c - lr[i]);
  const std = sampleStd(residuals);

  // 6) 五線
  const optimistic  = lr.map(v => +(v + Z95 * std).toFixed(2));
  const resistance  = lr.map(v => +(v + Z69 * std).toFixed(2));
  const trend       = lr.map(v => +v.toFixed(2));
  const support     = lr.map(v => +(v - Z69 * std).toFixed(2));
  const pessimistic = lr.map(v => +(v - Z95 * std).toFixed(2));

  // 7) 通道切片到顯示段
  const channelMa  = maFull.slice(sliceFrom);
  const channelStd = stdFull.slice(sliceFrom);
  const channelTop: (number | null)[] = channelMa.map((m, i) =>
    m != null && channelStd[i] != null ? +(m + 2 * (channelStd[i] as number)).toFixed(2) : null
  );
  const channelBot: (number | null)[] = channelMa.map((m, i) =>
    m != null && channelStd[i] != null ? +(m - 2 * (channelStd[i] as number)).toFixed(2) : null
  );

  // 8) 訊號（含通道濾網）
  const lastPrice = closes[closes.length - 1];
  const lastLr    = lr[lr.length - 1];
  const lastTop   = channelTop[channelTop.length - 1];
  const lastBot   = channelBot[channelBot.length - 1];

  const p2 = lastLr + Z95 * std;
  const p1 = lastLr + Z69 * std;
  const n1 = lastLr - Z69 * std;
  const n2 = lastLr - Z95 * std;

  let base: 'buy2' | 'buy1' | 'hold' | 'sell1' | 'sell2';
  if (lastPrice <= n2) base = 'buy2';
  else if (lastPrice <= n1) base = 'buy1';
  else if (lastPrice >= p2) base = 'sell2';
  else if (lastPrice >= p1) base = 'sell1';
  else base = 'hold';

  let signal: Signal = base;
  if ((base === 'buy1' || base === 'buy2') && lastBot != null && lastPrice < lastBot) {
    signal = `${base}_wait` as Signal;
  } else if ((base === 'sell1' || base === 'sell2') && lastTop != null && lastPrice > lastTop) {
    signal = `${base}_hold` as Signal;
  }

  // 9) 位置百分位（0 = -2σ, 100 = +2σ）
  const range = Z95 * std * 2;
  let currentPos = range > 0 ? Math.round(((lastPrice - n2) / range) * 100) : 50;
  currentPos = Math.max(0, Math.min(100, currentPos));

  return {
    dates,
    close: closes.map(c => +c.toFixed(2)),
    trend, optimistic, resistance, support, pessimistic,
    channelMa, channelTop, channelBot,
    signal, currentPos, stdResidual: std, years,
  };
}

// ── 訊號 meta（顏色、標籤、emoji 對齊 ckc216 SIGNAL_META）─────

export const SIGNAL_LABELS: Record<Signal, string> = {
  buy2:       '強力買點',
  buy1:       '第一買點',
  buy2_wait:  '等待止跌',
  buy1_wait:  '等待止跌',
  hold:       '正常區間',
  sell1:      '相對樂觀',
  sell2:      '強力賣點',
  sell1_hold: '強勢續漲',
  sell2_hold: '強勢續漲',
};

export const SIGNAL_COLORS: Record<Signal, string> = {
  buy2:       '#34c759',
  buy1:       '#c9a000',
  buy2_wait:  '#ff9500',
  buy1_wait:  '#ff9500',
  hold:       '#8e8e93',
  sell1:      '#e07800',
  sell2:      '#ff3b30',
  sell1_hold: '#0071e3',
  sell2_hold: '#0071e3',
};

export const SIGNAL_EMOJI: Record<Signal, string> = {
  buy2:       '🟢',
  buy1:       '🟡',
  buy2_wait:  '⚠️',
  buy1_wait:  '⚠️',
  hold:       '⚪',
  sell1:      '🟠',
  sell2:      '🔴',
  sell1_hold: '💹',
  sell2_hold: '💹',
};
