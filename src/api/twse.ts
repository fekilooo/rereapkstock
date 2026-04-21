import axios from 'axios';

export interface TwseQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}

function isTwseSymbol(symbol: string): boolean {
  return symbol.endsWith('.TW') || symbol.endsWith('.TWO');
}

function getTwseCode(symbol: string): string {
  return symbol.replace(/\.(TW|TWO)$/, '');
}

export async function fetchTwseRealtime(symbol: string): Promise<TwseQuote | null> {
  if (!isTwseSymbol(symbol)) return null;
  const code = getTwseCode(symbol);
  const ex = symbol.endsWith('.TWO') ? 'otc' : 'tse';
  const exCh = `${ex}_${code}.tw`;

  try {
    const { data } = await axios.get(
      'https://mis.twse.com.tw/stock/api/getStockInfo.jsp',
      {
        params: { ex_ch: exCh, json: 1, delay: 0 },
        headers: { 'Referer': 'https://mis.twse.com.tw/' },
        timeout: 8000,
      }
    );

    const msg = data?.msgArray?.[0];
    if (!msg) return null;

    const price = parseFloat(msg.z ?? msg.y ?? '0');
    const prevClose = parseFloat(msg.y ?? '0');
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol,
      name: msg.n ?? code,
      price,
      change,
      changePercent,
      volume: parseInt(msg.v ?? '0', 10),
    };
  } catch {
    return null;
  }
}
