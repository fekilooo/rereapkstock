export type MarketType = 'TW' | 'US';
export type RefreshContext = 'home' | 'detail';

const OPEN_REFRESH_MS: Record<RefreshContext, number> = {
  home: 30_000,
  detail: 15_000,
};

const CLOSED_REFRESH_MS: Record<RefreshContext, number> = {
  home: 5 * 60_000,
  detail: 2 * 60_000,
};

function getDateParts(now: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(now);
  const weekday = parts.find(part => part.type === 'weekday')?.value ?? 'Sun';
  const hour = Number(parts.find(part => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find(part => part.type === 'minute')?.value ?? '0');

  return { hour, minute, weekday };
}

export function getMarketType(symbol: string): MarketType {
  return /\.(TW|TWO)$/.test(symbol) ? 'TW' : 'US';
}

export function isMarketOpen(symbol: string, now: Date = new Date()): boolean {
  const market = getMarketType(symbol);

  if (market === 'TW') {
    const { weekday, hour, minute } = getDateParts(now, 'Asia/Taipei');
    if (weekday === 'Sat' || weekday === 'Sun') return false;
    const totalMinutes = hour * 60 + minute;
    return totalMinutes >= 9 * 60 && totalMinutes <= 13 * 60 + 30;
  }

  const { weekday, hour, minute } = getDateParts(now, 'America/New_York');
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  const totalMinutes = hour * 60 + minute;
  return totalMinutes >= 9 * 60 + 30 && totalMinutes <= 16 * 60;
}

export function getRefreshIntervalMs(
  symbol: string,
  context: RefreshContext,
  now: Date = new Date()
): number {
  return isMarketOpen(symbol, now) ? OPEN_REFRESH_MS[context] : CLOSED_REFRESH_MS[context];
}
