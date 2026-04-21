import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  ScrollView,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { fetchFearGreed, FearGreedData } from '../../src/api/cnn';
import { fetchQuote } from '../../src/api/yahoo';
import { fetchTwseRealtime } from '../../src/api/twse';
import { calcFiveLines } from '../../src/core/fiveLines';
import { fetchOHLCV } from '../../src/api/yahoo';
import { useWatchlist } from '../../src/store/watchlist';
import { FearGreedGauge } from '../../src/components/FearGreedGauge';
import { StockListItem } from '../../src/components/StockListItem';

export default function HomeScreen() {
  const router = useRouter();
  const { items, loaded, load, updateData } = useWatchlist();
  const [fg, setFg] = useState<FearGreedData | null>(null);
  const [fgError, setFgError] = useState<string>('');
  const [fgLoading, setFgLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!loaded) load();
  }, []);

  useEffect(() => {
    loadFearGreed();
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshStocks();
    }, [items.length])
  );

  async function loadFearGreed() {
    setFgError('');
    try {
      const data = await fetchFearGreed();
      setFg(data);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      console.error('Fear&Greed error:', msg);
      setFgError(msg);
    } finally {
      setFgLoading(false);
    }
  }

  async function refreshStock(symbol: string) {
    updateData(symbol, { loading: true });
    try {
      // 嘗試 TWSE 即時 (台股盤中)，備援 Yahoo
      const twse = await fetchTwseRealtime(symbol);
      let price: number, change: number, changePercent: number, name: string | undefined;
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

      // 三時間軸五線譜訊號
      const ohlcv = await fetchOHLCV(symbol, 5.5);
      const r3m  = calcFiveLines(ohlcv, 0.25);
      const r6m  = calcFiveLines(ohlcv, 0.5);
      const r3y  = calcFiveLines(ohlcv, 3.5);

      updateData(symbol, {
        name,
        price,
        change,
        changePercent,
        signal3m: r3m?.signal,
        signal6m: r6m?.signal,
        signal3y: r3y?.signal,
        loading: false,
      });
    } catch (e) {
      updateData(symbol, { loading: false, error: String(e) });
    }
  }

  async function refreshStocks() {
    if (!items.length) return;
    await Promise.all(items.map(i => refreshStock(i.symbol)));
  }

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([loadFearGreed(), refreshStocks()]);
    setRefreshing(false);
  }

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#58a6ff" size="large" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.bg}
      data={items}
      keyExtractor={i => i.symbol}
      renderItem={({ item, index }) => (
        <StockListItem item={item} index={index} total={items.length} />
      )}
      ListHeaderComponent={
        <View>
          {fgLoading ? (
            <View style={styles.fgLoading}>
              <ActivityIndicator color="#58a6ff" />
              <Text style={styles.fgLoadText}>載入市場情緒中...</Text>
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
            {items.length > 0 ? `最愛股票 (${items.length})` : '最愛股票'}
          </Text>
          {items.length === 0 && (
            <Text style={styles.emptyText}>尚未新增股票，請前往「搜尋」頁面新增</Text>
          )}
        </View>
      }
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
  sectionHeader: { color: '#8b949e', fontSize: 13, fontWeight: '600', marginHorizontal: 16, marginTop: 16, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 },
  emptyText: { color: '#8b949e', fontSize: 14, marginHorizontal: 16, marginTop: 8 },
  errText: { color: '#ff7043', fontSize: 13, marginHorizontal: 16, marginVertical: 8 },
});
