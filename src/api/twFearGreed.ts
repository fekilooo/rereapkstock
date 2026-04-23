import axios from 'axios';

const BASE_URL = 'https://fekilooo.github.io/rereapkstock';

export interface TwFearGreedLatest {
  date: string;
  fearGreedIndex: number;
  fearGreedIndexRaw: number;
  rating: string;
}

export interface TwFearGreedHistoryPoint {
  date: number;
  score: number;
}

interface TwFearGreedLatestResponse {
  date: string;
  fear_greed_index: number;
  fear_greed_index_raw: number;
  rating: string;
}

interface TwFearGreedHistoryResponse {
  history: Array<{
    date: string;
    fear_greed_index: number;
    rating: string;
  }>;
}

function parseDateString(date: string): number {
  return new Date(`${date}T00:00:00+08:00`).getTime();
}

export async function fetchTwFearGreedLatest(): Promise<TwFearGreedLatest> {
  const url = `${BASE_URL}/tw_fear_greed_1y_latest.json`;
  const res = await axios.get<TwFearGreedLatestResponse>(url, {
    timeout: 15000,
    validateStatus: () => true,
  });

  if (res.status !== 200 || !res.data) {
    throw new Error(`TW fear/greed HTTP ${res.status} (url=${url})`);
  }

  return {
    date: res.data.date,
    fearGreedIndex: Math.round(res.data.fear_greed_index),
    fearGreedIndexRaw: Math.round(res.data.fear_greed_index_raw),
    rating: res.data.rating,
  };
}

export async function fetchTwFearGreedHistory(): Promise<TwFearGreedHistoryPoint[]> {
  const url = `${BASE_URL}/tw_fear_greed_1y_history.json`;
  const res = await axios.get<TwFearGreedHistoryResponse>(url, {
    timeout: 15000,
    validateStatus: () => true,
  });

  if (res.status !== 200 || !res.data?.history) {
    throw new Error(`TW fear/greed history HTTP ${res.status} (url=${url})`);
  }

  return res.data.history
    .map(point => ({
      date: parseDateString(point.date),
      score: Math.round(point.fear_greed_index),
    }))
    .filter(point => Number.isFinite(point.date) && Number.isFinite(point.score))
    .sort((a, b) => a.date - b.date);
}
