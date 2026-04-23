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
import { fetchTwFearGreedLatest, TwFearGreedLatest } from '../../src/api/twFearGreed';
import { MarketSentimentCard } from '../../src/components/MarketSentimentCard';
import { StockListItem } from '../../src/components/StockListItem';
import { fetchTwseRealtime } from '../../src/api/twse';
import { fetchOHLCV, fetchQuote } from '../../src/api/yahoo';
import { calcFiveLines } from '../../src/core/fiveLines';
import { usePreferences } from '../../src/store/preferences';
import { useWatchlist, WatchItemWithData } from '../../src/store/watchlist';
import { getRefreshIntervalMs, isMarketOpen } from '../../src/utils/marketHours';

type WatchSection = {
  title: string;
  status: string;
  data: WatchItemWithData[];
};

function isTaiwanStock(symbol: string) {
  return /\.(TW|TWO)$/.test(symbol);
}

function hasCjkText(value?: string) {
  return !!value && /[\u3400-\u9fff]/.test(value);
}

function marketStatusLabel(symbol: string) {
  return isMarketOpen(symbol) ? 'Open' : 'Closed';
}

function formatTaiwanDate(date: string) {
  return date.replace(/-/g, '/');
}

function formatUsUpdatedAt(lastUpdated: string) {
  return lastUpdated ? `Updated ${lastUpdated.slice(0, 10)}` : 'Tap to view history';
}

export default function HomeScreen() {
  const router = useRouter();
  const { items, loaded, load, reorder, updateData } = useWatchlist();
  const { loaded: prefsLoaded, load: loadPreferences, showHomeActionButtons } = usePreferences();

  const [usSentiment, setUsSentiment] = useState<FearGreedData | null>(null);
  const [twSentiment, setTwSentiment] = useState<TwFearGreedLatest | null>(null);
  const [usSentimentError, setUsSentimentError] = useState('');
  const [twSentimentError, setTwSentimentError] = useState('');
  const [sentimentLoading, setSentimentLoading] = useState(true);
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
    void loadSentimentCards();
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

  async function loadSentimentCards() {
    setUsSentimentError('');
    setTwSentimentError('');

    const [usResult, twResult] = await Promise.allSettled([
      fetchFearGreed(),
      fetchTwFearGreedLatest(),
    ]);

    if (usResult.status === 'fulfilled') {
      setUsSentiment(usResult.value);
    } else {
      const message = usResult.reason?.message ?? String(usResult.reason);
      console.error('US fear & greed error:', message);
      setUsSentiment(null);
      setUsSentimentError(message);
    }

    if (twResult.status === 'fulfilled') {
      setTwSentiment(twResult.value);
    } else {
      const message = twResult.reason?.message ?? String(twResult.reason);
      console.error('TW fear & greed error:', message);
      setTwSentiment(null);
      setTwSentimentError(message);
    }

    setSentimentLoading(false);
  }

  async function refreshStock(symbol: string, force = false) {
    const now = Date.now();
    const nextRefreshAt = nextRefreshAtRef.current[symbol] ?? 0;
    if (!force && now < nextRefreshAt) return;

    nextRefreshAtRef.current[symbol] = now + getRefreshIntervalMs(symbol, 'home');
    updateData(symbol, { loading: true });

    try {
      const currentItem = items.find(item => item.symbol === symbol);
      const existingName = currentItem?.name;
      const shouldPreferChineseName = isTaiwanStock(symbol);
      let price = 0;
      let change = 0;
      let changePercent = 0;
      let name = existingName;

      const twse = await fetchTwseRealtime(symbol);
      if (twse?.name && shouldPreferChineseName) {
        name = twse.name;
      }

      if (twse && twse.price > 0) {
        ({ price, change, changePercent } = twse);
      } else {
        const quote = await fetchQuote(symbol);
        price = quote.regularMarketPrice;
        change = quote.regularMarketChange;
        changePercent = quote.regularMarketChangePercent;
        if (!shouldPreferChineseName || !hasCjkText(name)) {
          name = quote.shortName;
        }
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

  async function refreshStocks(force = false) {
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
    await Promise.all([loadSentimentCards(), refreshStocks(true)]);
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
          title: `Taiwan Market (${taiwanItems.length})`,
          status: marketStatusLabel(taiwanItems[0].symbol),
          data: taiwanItems,
        }
      : null,
    usItems.length
      ? {
          title: `US Market (${usItems.length})`,
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
      contentContainerStyle={styles.listContent}
      keyExtractor={item => item.symbol}
      ListHeaderComponent={
        <View style={styles.headerBlock}>
          <Text style={styles.marketSentimentHeader}>Market Sentiment</Text>
          <View style={styles.sentimentRow}>
            <MarketSentimentCard
              error={twSentimentError}
              loading={sentimentLoading && !twSentiment}
              onPress={() => router.push({ pathname: '/feargreed', params: { market: 'tw' } })}
              rating={twSentiment?.rating}
              score={twSentiment?.fearGreedIndex}
              title="台股"
              updatedLabel={twSentiment ? `更新 ${formatTaiwanDate(twSentiment.date)}` : undefined}
            />
            <MarketSentimentCard
              error={usSentimentError}
              loading={sentimentLoading && !usSentiment}
              onPress={() => router.push({ pathname: '/feargreed', params: { market: 'us' } })}
              rating={usSentiment?.rating}
              score={usSentiment?.score}
              title="美股"
              updatedLabel={usSentiment ? formatUsUpdatedAt(usSentiment.lastUpdated) : undefined}
            />
          </View>
          {!sentimentLoading && !usSentiment && !twSentiment ? (
            <Text style={styles.errText}>市場情緒資料暫時無法載入，請稍後再試。</Text>
          ) : null}

          <Text style={styles.sectionHeader}>
            {items.length > 0 ? `Watchlist (${items.length})` : 'Watchlist'}
          </Text>
          {items.length === 0 ? (
            <Text style={styles.emptyText}>先到自選股頁加入標的，首頁就會顯示即時五線譜與行情。</Text>
          ) : null}
        </View>
      }
      refreshControl={
        <RefreshControl
          colors={['#58a6ff']}
          onRefresh={onRefresh}
          refreshing={refreshing}
          tintColor="#58a6ff"
        />
      }
      renderItem={({ item, index, section }) => (
        <StockListItem
          index={index}
          item={item}
          onMoveDown={() =>
            void moveWithinSection(
              section.data.map((stock: WatchItemWithData) => stock.symbol),
              index,
              'down'
            )
          }
          onMoveUp={() =>
            void moveWithinSection(
              section.data.map((stock: WatchItemWithData) => stock.symbol),
              index,
              'up'
            )
          }
          showActions={showHomeActionButtons}
          total={section.data.length}
        />
      )}
      renderSectionHeader={({ section }) => (
        <View style={styles.marketHeaderRow}>
          <Text style={styles.marketHeader}>{section.title}</Text>
          <Text
            style={[
              styles.marketStatus,
              section.status === 'Open' ? styles.marketStatusOpen : styles.marketStatusClosed,
            ]}
          >
            {section.status}
          </Text>
        </View>
      )}
      sections={sections}
      stickySectionHeadersEnabled={false}
      style={styles.bg}
    />
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0d1117',
  },
  listContent: {
    paddingBottom: 24,
  },
  headerBlock: {
    marginTop: 8,
  },
  marketSentimentHeader: {
    color: '#8b949e',
    fontSize: 13,
    fontWeight: '600',
    marginHorizontal: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sentimentRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    gap: 12,
  },
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
  emptyText: {
    color: '#8b949e',
    fontSize: 14,
    marginHorizontal: 16,
    marginTop: 8,
  },
  errText: {
    color: '#ff7043',
    fontSize: 13,
    marginHorizontal: 16,
    marginTop: 8,
  },
});
