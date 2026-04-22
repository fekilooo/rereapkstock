import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { fetchFearGreed, FearGreedData } from '../../src/api/cnn';
import { fetchOHLCV, fetchQuote } from '../../src/api/yahoo';
import { fetchTwseRealtime } from '../../src/api/twse';
import { calcFiveLines } from '../../src/core/fiveLines';
import { usePreferences } from '../../src/store/preferences';
import { useWatchlist, WatchItemWithData } from '../../src/store/watchlist';
import { FearGreedGauge } from '../../src/components/FearGreedGauge';
import { StockListItem } from '../../src/components/StockListItem';
import { getRefreshIntervalMs, isMarketOpen } from '../../src/utils/marketHours';

type WatchSection = {
  title: string;
  status: string;
  data: WatchItemWithData[];
};

function isTaiwanStock(symbol: string) {
  return /\.(TW|TWO)$/.test(symbol);
}

function marketStatusLabel(symbol: string) {
  return isMarketOpen(symbol) ? '即時更新中' : '非交易時段，低頻更新中';
}

export default function HomeScreen() {
  const router = useRouter();
  const { items, loaded, load, reorder, updateData } = useWatchlist();
  const { loaded: prefsLoaded, load: loadPreferences, showHomeActionButtons } = usePreferences();

  const [fg, setFg] = useState<FearGreedData | null>(null);
  const [fgError, setFgError] = useState('');
  const [fgLoading, setFgLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const nextRefreshAtRef = useRef<Record<string, number>>({});
  const refreshInFlightRef = useRef(false);

  useEffect(() => {
    if (!loaded) {
      void load();
    }
  }, [loaded, load]);

  useEffect(() => {
    if (!prefsLoaded) {
      void loadPreferences();
    }
  }, [prefsLoaded, loadPreferences]);

  useEffect(() => {
    void loadFearGreed();
  }, []);

  useEffect(() => {
    const validSymbols = new Set(items.map(item => item.symbol));
    for (const symbol of Object.keys(nextRefreshAtRef.current)) {
      if (!validSymbols.has(symbol)) {
        delete nextRefreshAtRef.current[symbol];
      }
    }
  }, [items]);

  useFocusEffect(
    useCallback(() => {
      void refreshStocks(true);

      const timer = setInterval(() => {
        void refreshStocks();
      }, 30_000);

      return () => clearInterval(timer);
    }, [items])
  );

  async function loadFearGreed() {
    setFgError('');
    try {
      const data = await fetchFearGreed();
      setFg(data);
    } catch (error: any) {
      const message = error?.message ?? String(error);
      console.error('Fear & Greed error:', message);
      setFgError(message);
    } finally {
      setFgLoading(false);
    }
  }

  async function refreshStock(symbol: string, force: boolean = false) {
    const now = Date.now();
    const nextRefreshAt = nextRefreshAtRef.current[symbol] ?? 0;
    if (!force && now < nextRefreshAt) return;

    nextRefreshAtRef.current[symbol] = now + getRefreshIntervalMs(symbol, 'home');
    updateData(symbol, { loading: true });

    try {
      let price = 0;
      let change = 0;
      let changePercent = 0;
      let name: string | undefined;

      const twse = await fetchTwseRealtime(symbol);
      if (twse && twse.price > 0) {
        ({ price, change, changePercent } = twse);
        name = twse.name;
      } else {
        const quote = await fetchQuote(symbol);
        price = quote.regularMarketPrice;
        change = quote.regularMarketChange;
        changePercent = quote.regularMarketChangePercent;
        name = quote.shortName;
      }

      const ohlcv = await fetchOHLCV(symbol, 5.5);
      const result3m = calcFiveLines(ohlcv, 0.25);
      const result6m = calcFiveLines(ohlcv, 0.5);
      const result3y = calcFiveLines(ohlcv, 3.5);

      updateData(symbol, {
        name,
        price,
        change,
        changePercent,
        signal3m: result3m?.signal,
        signal6m: result6m?.signal,
        signal3y: result3y?.signal,
        loading: false,
      });
    } catch (error) {
      updateData(symbol, { loading: false, error: String(error) });
    } finally {
      nextRefreshAtRef.current[symbol] = Date.now() + getRefreshIntervalMs(symbol, 'home');
    }
  }

  async function refreshStocks(force: boolean = false) {
    if (!items.length) return;
    if (refreshInFlightRef.current) return;

    refreshInFlightRef.current = true;
    try {
      await Promise.all(items.map(item => refreshStock(item.symbol, force)));
    } finally {
      refreshInFlightRef.current = false;
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([loadFearGreed(), refreshStocks(true)]);
    setRefreshing(false);
  }

  async function moveWithinSection(
    sectionSymbols: string[],
    index: number,
    direction: 'up' | 'down'
  ) {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sectionSymbols.length) return;

    const nextSection = [...sectionSymbols];
    [nextSection[index], nextSection[targetIndex]] = [nextSection[targetIndex], nextSection[index]];

    const nextSymbols: string[] = [];
    let sectionCursor = 0;
    for (const item of items) {
      if (sectionSymbols.includes(item.symbol)) {
        nextSymbols.push(nextSection[sectionCursor]);
        sectionCursor += 1;
      } else {
        nextSymbols.push(item.symbol);
      }
    }

    await reorder(nextSymbols);
  }

  const taiwanItems = items.filter(item => isTaiwanStock(item.symbol));
  const usItems = items.filter(item => !isTaiwanStock(item.symbol));

  const sections = [
    taiwanItems.length
      ? {
          title: `台股 (${taiwanItems.length})`,
          status: marketStatusLabel(taiwanItems[0].symbol),
          data: taiwanItems,
        }
      : null,
    usItems.length
      ? {
          title: `美股 (${usItems.length})`,
          status: marketStatusLabel(usItems[0].symbol),
          data: usItems,
        }
      : null,
  ].filter((section): section is WatchSection => !!section);

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#58a6ff" size="large" />
      </View>
    );
  }

  return (
    <SectionList
      style={styles.bg}
      sections={sections}
      keyExtractor={item => item.symbol}
      renderItem={({ item, index, section }) => (
        <StockListItem
          item={item}
          index={index}
          total={section.data.length}
          showActions={showHomeActionButtons}
          onMoveUp={() => void moveWithinSection(section.data.map((stock: WatchItemWithData) => stock.symbol), index, 'up')}
          onMoveDown={() => void moveWithinSection(section.data.map((stock: WatchItemWithData) => stock.symbol), index, 'down')}
        />
      )}
      renderSectionHeader={({ section }) => (
        <View style={styles.marketHeaderRow}>
          <Text style={styles.marketHeader}>{section.title}</Text>
          <Text
            style={[
              styles.marketStatus,
              section.status === '即時更新中' ? styles.marketStatusOpen : styles.marketStatusClosed,
            ]}
          >
            {section.status}
          </Text>
        </View>
      )}
      ListHeaderComponent={
        <View>
          {fgLoading ? (
            <View style={styles.fgLoading}>
              <ActivityIndicator color="#58a6ff" />
              <Text style={styles.fgLoadText}>載入市場情緒資料中...</Text>
            </View>
          ) : fg ? (
            <FearGreedGauge
              data={fg}
              onPressHistory={() =>
                router.push({ pathname: '/feargreed', params: { historyJson: JSON.stringify(fg.history) } })
              }
            />
          ) : (
            <Text style={styles.errText}>
              市場情緒資料無法取得{fgError ? `\n${fgError}` : ''}
            </Text>
          )}

          <Text style={styles.sectionHeader}>
            {items.length > 0 ? `觀察股票 (${items.length})` : '觀察股票'}
          </Text>
          {items.length === 0 ? (
            <Text style={styles.emptyText}>還沒有加入觀察股票，請到搜尋頁加入你想追蹤的標的。</Text>
          ) : null}
        </View>
      }
      stickySectionHeadersEnabled={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#58a6ff"
          colors={['#58a6ff']}
        />
      }
      contentContainerStyle={styles.listContent}
    />
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#0d1117' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0d1117' },
  listContent: { paddingBottom: 24 },
  fgLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  fgLoadText: { color: '#8b949e', fontSize: 14 },
  sectionHeader: {
    color: '#8b949e',
    fontSize: 13,
    fontWeight: '600',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  marketHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 2,
    gap: 8,
  },
  marketHeader: {
    color: '#c9d1d9',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  marketStatus: {
    fontSize: 11,
    fontWeight: '600',
  },
  marketStatusOpen: {
    color: '#43a047',
  },
  marketStatusClosed: {
    color: '#8b949e',
  },
  emptyText: { color: '#8b949e', fontSize: 14, marginHorizontal: 16, marginTop: 8 },
  errText: { color: '#ff7043', fontSize: 13, marginHorizontal: 16, marginVertical: 8 },
});
