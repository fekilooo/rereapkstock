import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { fetchOHLCV, fetchQuote, StockInfo } from '../../src/api/yahoo';
import { fetchTwseRealtime } from '../../src/api/twse';
import { calcFiveLines, FiveLinesResult, SIGNAL_COLORS } from '../../src/core/fiveLines';
import { FiveLineChart } from '../../src/components/FiveLineChart';
import { SignalBadge } from '../../src/components/SignalBadge';
import { useWatchlist } from '../../src/store/watchlist';
import { getRefreshIntervalMs } from '../../src/utils/marketHours';

type TimeAxis = '3M' | '6M' | '1.5Y' | '3.5Y';

const AXIS_CONFIG: Record<TimeAxis, { years: number; label: string }> = {
  '3M': { years: 0.25, label: '3 個月' },
  '6M': { years: 0.5, label: '6 個月' },
  '1.5Y': { years: 1.5, label: '1.5 年' },
  '3.5Y': { years: 3.5, label: '3.5 年' },
};

function displaySymbol(symbol: string) {
  return symbol.replace(/\.(TW|TWO)$/, '');
}

export default function StockDetailScreen() {
  const { symbol: rawSymbol } = useLocalSearchParams<{ symbol: string }>();
  const symbol = decodeURIComponent(rawSymbol ?? '');
  const navigation = useNavigation();
  const { has, add, remove } = useWatchlist();

  const [axis, setAxis] = useState<TimeAxis>('3.5Y');
  const [quote, setQuote] = useState<StockInfo | null>(null);
  const [allData, setAllData] = useState<Record<TimeAxis, FiveLinesResult | null>>({
    '3M': null,
    '6M': null,
    '1.5Y': null,
    '3.5Y': null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const nextQuoteRefreshAtRef = useRef(0);
  const quoteRefreshInFlightRef = useRef(false);
  const inWatchlist = has(symbol);

  useEffect(() => {
    if (!symbol) return;
    nextQuoteRefreshAtRef.current = 0;
    navigation.setOptions({ title: displaySymbol(symbol) });
    void loadAllData();
  }, [symbol, navigation]);

  useFocusEffect(
    useCallback(() => {
      if (!symbol) return;

      void refreshQuoteOnly(true);

      const timer = setInterval(() => {
        void refreshQuoteOnly();
      }, 15_000);

      return () => clearInterval(timer);
    }, [symbol])
  );

  async function loadQuote() {
    let price = 0;
    let change = 0;
    let changePercent = 0;
    let name = symbol;
    let currency = 'TWD';

    const twse = await fetchTwseRealtime(symbol).catch(() => null);
    if (twse && twse.price > 0) {
      price = twse.price;
      change = twse.change;
      changePercent = twse.changePercent;
      name = twse.name;
    } else {
      const fetchedQuote = await fetchQuote(symbol);
      price = fetchedQuote.regularMarketPrice;
      change = fetchedQuote.regularMarketChange;
      changePercent = fetchedQuote.regularMarketChangePercent;
      name = fetchedQuote.shortName;
      currency = fetchedQuote.currency;
    }

    const nextQuote: StockInfo = {
      symbol,
      shortName: name,
      longName: name,
      regularMarketPrice: price,
      regularMarketChange: change,
      regularMarketChangePercent: changePercent,
      regularMarketPreviousClose: price - change,
      currency,
    };

    setQuote(nextQuote);
    navigation.setOptions({ title: `${displaySymbol(symbol)} ${name}` });
    return nextQuote;
  }

  async function loadAllData() {
    setLoading(true);
    setError('');

    try {
      await loadQuote();

      const ohlcv = await fetchOHLCV(symbol, 5.5);
      setAllData({
        '3M': calcFiveLines(ohlcv, AXIS_CONFIG['3M'].years),
        '6M': calcFiveLines(ohlcv, AXIS_CONFIG['6M'].years),
        '1.5Y': calcFiveLines(ohlcv, AXIS_CONFIG['1.5Y'].years),
        '3.5Y': calcFiveLines(ohlcv, AXIS_CONFIG['3.5Y'].years),
      });
    } catch (e) {
      setError(`資料讀取失敗：${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function refreshQuoteOnly(force: boolean = false) {
    const now = Date.now();
    if (!force && now < nextQuoteRefreshAtRef.current) return;
    if (quoteRefreshInFlightRef.current) return;

    quoteRefreshInFlightRef.current = true;
    nextQuoteRefreshAtRef.current = now + getRefreshIntervalMs(symbol, 'detail');

    try {
      await loadQuote();
    } catch (e) {
      console.error('quote refresh error:', e);
    } finally {
      nextQuoteRefreshAtRef.current = Date.now() + getRefreshIntervalMs(symbol, 'detail');
      quoteRefreshInFlightRef.current = false;
    }
  }

  function toggleWatchlist() {
    if (inWatchlist) {
      Alert.alert('移除最愛股票', `要把 ${displaySymbol(symbol)} 從最愛中移除嗎？`, [
        { text: '取消', style: 'cancel' },
        { text: '移除', style: 'destructive', onPress: () => remove(symbol) },
      ]);
      return;
    }

    void add(symbol, quote?.shortName ?? symbol);
  }

  const currentData = allData[axis];
  const changeColor = (quote?.regularMarketChange ?? 0) >= 0 ? '#43a047' : '#ef5350';

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#58a6ff" size="large" />
        <Text style={styles.loadText}>載入 {displaySymbol(symbol)} 資料中...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => void loadAllData()}>
          <Text style={styles.retryText}>重新載入</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      <View style={styles.quoteCard}>
        <View style={styles.quoteRow}>
          <View style={styles.quoteHeader}>
            <Text style={styles.quoteSymbol}>{displaySymbol(symbol)}</Text>
            <Text style={styles.quoteName}>{quote?.shortName}</Text>
          </View>

          <TouchableOpacity
            style={[styles.watchBtn, inWatchlist && styles.watchBtnActive]}
            onPress={toggleWatchlist}
          >
            <Text style={styles.watchBtnText}>{inWatchlist ? '已在最愛' : '加入最愛'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.quotePrice}>{quote?.regularMarketPrice?.toFixed(2)}</Text>
        <Text style={[styles.quoteChange, { color: changeColor }]}>
          {(quote?.regularMarketChange ?? 0) >= 0 ? '+' : ''}
          {quote?.regularMarketChange?.toFixed(2)} ({quote?.regularMarketChangePercent?.toFixed(2)}%)
        </Text>
      </View>

      <View style={styles.tabs}>
        {(['3M', '6M', '1.5Y', '3.5Y'] as TimeAxis[]).map(range => {
          const result = allData[range];
          const active = axis === range;

          return (
            <TouchableOpacity
              key={range}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setAxis(range)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{range}</Text>
              {result ? (
                <View style={styles.tabBadgeWrap}>
                  <SignalBadge signal={result.signal} small showEmoji={false} />
                </View>
              ) : (
                <Text style={styles.tabEmpty}>---</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {currentData ? (
        <>
          <FiveLineChart data={currentData} />

          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>區間摘要｜{AXIS_CONFIG[axis].label}</Text>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>訊號</Text>
              <SignalBadge signal={currentData.signal} />
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>位置</Text>
              <View style={styles.posBar}>
                <View
                  style={[
                    styles.posFill,
                    {
                      width: `${currentData.currentPos}%`,
                      backgroundColor: SIGNAL_COLORS[currentData.signal],
                    },
                  ]}
                />
              </View>
              <Text style={styles.posNum}>{currentData.currentPos}%</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>資料筆數</Text>
              <Text style={styles.detailValue}>{currentData.dates.length} 筆</Text>
            </View>
          </View>
        </>
      ) : (
        <Text style={styles.noData}>目前沒有可顯示的圖表資料</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#0d1117' },
  content: { paddingBottom: 40 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0d1117',
    padding: 20,
  },
  loadText: { color: '#8b949e', marginTop: 12, fontSize: 14 },
  errText: { color: '#ff7b72', textAlign: 'center', fontSize: 14, marginBottom: 16 },
  retryBtn: {
    backgroundColor: '#1f6feb',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  quoteCard: { backgroundColor: '#161b22', margin: 16, borderRadius: 12, padding: 16 },
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 12,
  },
  quoteHeader: { flex: 1 },
  quoteSymbol: { color: '#e6edf3', fontSize: 20, fontWeight: '700' },
  quoteName: { color: '#8b949e', fontSize: 13, marginTop: 2 },
  watchBtn: {
    backgroundColor: '#21262d',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  watchBtnActive: { backgroundColor: '#2d333b', borderWidth: 1, borderColor: '#f1c40f' },
  watchBtnText: { color: '#e6edf3', fontSize: 13 },
  quotePrice: { color: '#e6edf3', fontSize: 32, fontWeight: '700' },
  quoteChange: { fontSize: 15, marginTop: 2 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: '#161b22',
    borderRadius: 12,
    padding: 6,
    gap: 6,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderRadius: 10,
    minHeight: 74,
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: '#1f6feb' },
  tabText: { color: '#8b949e', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  tabTextActive: { color: '#fff' },
  tabBadgeWrap: {
    transform: [{ scale: 0.92 }],
  },
  tabEmpty: {
    color: '#8b949e',
    fontSize: 12,
  },
  detailCard: {
    backgroundColor: '#161b22',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    padding: 16,
  },
  detailTitle: { color: '#8b949e', fontSize: 13, marginBottom: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  detailLabel: { color: '#8b949e', fontSize: 13, width: 80 },
  detailValue: { color: '#e6edf3', fontSize: 14 },
  posBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#30363d',
    borderRadius: 4,
    overflow: 'hidden',
  },
  posFill: { height: '100%', borderRadius: 4 },
  posNum: { color: '#e6edf3', fontSize: 13, width: 36, textAlign: 'right' },
  noData: { color: '#8b949e', textAlign: 'center', marginTop: 40 },
});
