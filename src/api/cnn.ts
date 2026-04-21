import axios from 'axios';

export interface FearGreedHistory {
  date: number;   // ms timestamp
  score: number;
}

export interface FearGreedData {
  score: number;
  rating: string;
  previousClose: number;
  previousWeek: number;
  previousMonth: number;
  previousYear: number;
  lastUpdated: string;
  history: FearGreedHistory[];
}

// 完整 Chrome UA，對齊 services.py EconomyService.HEADERS
const CNN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Referer': 'https://www.cnn.com/markets/fear-and-greed',
};

export async function fetchFearGreed(): Promise<FearGreedData> {
  const startDate = new Date(Date.now() - 366 * 86400000)
    .toISOString().slice(0, 10);
  const url = `https://production.dataviz.cnn.io/index/fearandgreed/graphdata/${startDate}`;

  const res = await axios.get(url, {
    headers: CNN_HEADERS,
    timeout: 15000,
    validateStatus: () => true,   // 不讓 axios 自動 throw，讓我們記錄 status
  });

  if (res.status !== 200) {
    throw new Error(`CNN API HTTP ${res.status} (url=${url})`);
  }

  const fg = res.data?.fear_and_greed;
  if (!fg) throw new Error(`CNN: missing fear_and_greed field. keys=${Object.keys(res.data ?? {})}`);

  // API 回傳小寫 ('greed')，對齊 services.py .title() 轉換
  const rawRating: string = fg.rating ?? 'neutral';
  const rating = rawRating
    .split(' ')
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  // 歷史資料：fear_and_greed_historical.data = [{x: ms_timestamp, y: score}]
  const rawHistory: { x: number; y: number }[] =
    res.data?.fear_and_greed_historical?.data ?? [];
  const history: FearGreedHistory[] = rawHistory
    .map(d => ({ date: d.x, score: Math.round(d.y) }))
    .sort((a, b) => a.date - b.date);

  return {
    score: Math.round(fg.score ?? 0),
    rating,
    previousClose: Math.round(fg.previous_close ?? 0),
    previousWeek: Math.round(fg.previous_1_week ?? 0),
    previousMonth: Math.round(fg.previous_1_month ?? 0),
    previousYear: Math.round(fg.previous_1_year ?? 0),
    lastUpdated: fg.timestamp ?? '',
    history,
  };
}

export function ratingLabel(rating: string): string {
  const map: Record<string, string> = {
    'Extreme Fear': '極度恐慌',
    'Fear': '恐慌',
    'Neutral': '中性',
    'Greed': '貪婪',
    'Extreme Greed': '極度貪婪',
  };
  return map[rating] ?? rating;
}

export function ratingColor(score: number): string {
  if (score <= 20) return '#d32f2f';
  if (score <= 40) return '#ff7043';
  if (score <= 60) return '#fbc02d';
  if (score <= 80) return '#43a047';
  return '#1b5e20';
}
