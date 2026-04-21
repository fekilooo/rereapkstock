import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { fetchOHLCV } from '../../src/api/yahoo';
import { fetchQuote, StockInfo } from '../../src/api/yahoo';
import { fetchTwseRealtime } from '../../src/api/twse';
import { calcFiveLines, FiveLinesResult, SIGNAL_LABELS, SIGNAL_COLORS } from '../../src/core/fiveLines';
import { FiveLineChart } from '../../src/components/FiveLineChart';
import { SignalBadge } from '../../src/components/SignalBadge';
import { useWatchlist } from '../../src/store/watchlist';

type TimeAxis = '3M' | '6M' | '3.5Y';

const AXIS_CONFIG: Record<TimeAxis, { years: number; days: number; label: string }> = {
  '3M':   { years: 0.25, days: 90,   label: '3個月' },
  '6M':   { years: 0.5,  days: 180,  label: '6個月' },
  '3.5Y': { years: 3.5,  days: 1260, label: '3.5年' },
};

export default function StockDetailScreen() {
  const { symbol: rawSymbol } = useLocalSearchParams<{ symbol: string }>();
  const symbol = decodeURIComponent(rawSymbol ?? '');
  const navigation = useNavigation();
  const { has, add, remove } = useWatchlist();

  const [axis, setAxis] = useState<TimeAxis>('3.5Y');
  const [quote, setQuote] = useState<StockInfo | null>(null);
  const [allData, setAllData] = useState<Record<TimeAxis, FiveLinesResult | null>>({ '3M': null, '6M': null, '3.5Y': null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const inWatchlist = has(symbol);

  useEffect(() => {
    if (symbol) {
      navigation.setOptions({ title: symbol.replace(/\.(TW|TWO)$/, '') });
      loadData();
    }
  }, [symbol]);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      // 取得報價
      let price = 0, change = 0, changePct = 0, name = symbol;
      const twse = await fetchTwseRealtime(symbol).catch(() => null);
      if (twse && twse.price > 0) {
        price = twse.price;
        change = twse.change;
        changePct = twse.changePercent;
        name = twse.name;
      } else {
        const q = await fetchQuote(symbol);
        price = q.regularMarketPrice;
        change = q.regularMarketChange;
        changePct = q.regularMarketChangePercent;
        name = q.shortName;
      }
      setQuote({ symbol, shortName: name, longName: name, regularMarketPrice: price, regularMarketChange: change, regularMarketChangePercent: changePct, regularMarketPreviousClose: price - change, currency: 'TWD' });
      navigation.setOptions({ title: `${symbol.replace(/\.(TW|TWO)$/, '')} ${name}` });

      // 一次抓 5.5 年資料，各時間軸共用
      const ohlcv = await fetchOHLCV(symbol, 5.5);
      const r3m  = calcFiveLines(ohlcv, AXIS_CONFIG['3M'].years);
      const r6m  = calcFiveLines(ohlcv, AXIS_CONFIG['6M'].years);
      const r3y  = calcFiveLines(ohlcv, AXIS_CONFIG['3.5Y'].years);
      setAllData({ '3M': r3m, '6M': r6m, '3.5Y': r3y });
    } catch (e) {
      setError(`資料載入失敗：${e}`);
    } finally {
      setLoading(false);
    }
  }

  function toggleWatchlist() {
    if (inWatchlist) {
      Alert.alert('移除最愛', `確定移除 ${symbol}？`, [
        { text: '取消', style: 'cancel' },
        { text: '移除', style: 'destructive', onPress: () => remove(symbol) },
      ]);
    } else {
      add(symbol, quote?.shortName ?? symbol);
    }
  }

  const currentData = allData[axis];
  const changeColor = (quote?.regularMarketChange ?? 0) >= 0 ? '#43a047' : '#d32f2f';

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#58a6ff" size="large" />
        <Text style={styles.loadText}>載入 {symbol} 資料中...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
          <Text style={styles.retryText}>重試</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      {/* 報價卡片 */}
      <View style={styles.quoteCard}>
        <View style={styles.quoteRow}>
          <View>
            <Text style={styles.quoteSymbol}>{symbol.replace(/\.(TW|TWO)$/, '')}</Text>
            <Text style={styles.quoteName}>{quote?.shortName}</Text>
          </View>
          <TouchableOpacity style={[styles.watchBtn, inWatchlist && styles.watchBtnActive]} onPress={toggleWatchlist}>
            <Text style={styles.watchBtnText}>{inWatchlist ? '★ 已加入最愛' : '☆ 加入最愛'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.quotePrice}>{quote?.regularMarketPrice?.toFixed(2)}</Text>
        <Text style={[styles.quoteChange, { color: changeColor }]}>
          {(quote?.regularMarketChange ?? 0) >= 0 ? '+' : ''}{quote?.regularMarketChange?.toFixed(2)}  ({quote?.regularMarketChangePercent?.toFixed(2)}%)
        </Text>
      </View>

      {/* 三時間軸訊號概覽 */}
      <View style={styles.signalRow}>
        {(['3M', '6M', '3.5Y'] as TimeAxis[]).map(t => {
          const r = allData[t];
          return (
            <View key={t} style={styles.signalCell}>
              <Text style={styles.signalAxisLabel}>{t}</Text>
              {r ? <SignalBadge signal={r.signal} small /> : <Text style={styles.na}>---</Text>}
            </View>
          );
        })}
      </View>

      {/* 時間軸切換 */}
      <View style={styles.tabs}>
        {(['3M', '6M', '3.5Y'] as TimeAxis[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, axis === t && styles.tabActive]}
            onPress={() => setAxis(t)}
          >
            <Text style={[styles.tabText, axis === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 五線譜圖表 */}
      {currentData ? (
        <>
          <FiveLineChart data={currentData} />

          {/* 詳情 */}
          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>當前位置分析（{AXIS_CONFIG[axis].label}）</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>訊號</Text>
              <SignalBadge signal={currentData.signal} />
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>位置百分位</Text>
              <View style={styles.posBar}>
                <View style={[styles.posFill, {
                  width: `${currentData.currentPos}%`,
                  backgroundColor: SIGNAL_COLORS[currentData.signal],
                }]} />
              </View>
              <Text style={styles.posNum}>{currentData.currentPos}%</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>資料筆數</Text>
              <Text style={styles.detailValue}>{currentData.dates.length} 天</Text>
            </View>
          </View>
        </>
      ) : (
        <Text style={styles.noData}>此時間軸資料不足</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#0d1117' },
  content: { paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0d1117', padding: 20 },
  loadText: { color: '#8b949e', marginTop: 12, fontSize: 14 },
  errText: { color: '#ff7b72', textAlign: 'center', fontSize: 14, marginBottom: 16 },
  retryBtn: { backgroundColor: '#1f6feb', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  quoteCard: { backgroundColor: '#161b22', margin: 16, borderRadius: 12, padding: 16 },
  quoteRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  quoteSymbol: { color: '#e6edf3', fontSize: 20, fontWeight: '700' },
  quoteName: { color: '#8b949e', fontSize: 13 },
  watchBtn: { backgroundColor: '#21262d', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  watchBtnActive: { backgroundColor: '#2d333b', borderWidth: 1, borderColor: '#f1c40f' },
  watchBtnText: { color: '#e6edf3', fontSize: 13 },
  quotePrice: { color: '#e6edf3', fontSize: 32, fontWeight: '700' },
  quoteChange: { fontSize: 15, marginTop: 2 },

  signalRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 4, gap: 8 },
  signalCell: { flex: 1, backgroundColor: '#161b22', borderRadius: 8, padding: 10, alignItems: 'center' },
  signalAxisLabel: { color: '#8b949e', fontSize: 12, marginBottom: 4 },
  na: { color: '#8b949e', fontSize: 13 },

  tabs: { flexDirection: 'row', marginHorizontal: 16, marginVertical: 8, backgroundColor: '#161b22', borderRadius: 8, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  tabActive: { backgroundColor: '#1f6feb' },
  tabText: { color: '#8b949e', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#fff' },

  detailCard: { backgroundColor: '#161b22', marginHorizontal: 16, marginTop: 8, borderRadius: 12, padding: 16 },
  detailTitle: { color: '#8b949e', fontSize: 13, marginBottom: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  detailLabel: { color: '#8b949e', fontSize: 13, width: 80 },
  detailValue: { color: '#e6edf3', fontSize: 14 },
  posBar: { flex: 1, height: 8, backgroundColor: '#30363d', borderRadius: 4, overflow: 'hidden' },
  posFill: { height: '100%', borderRadius: 4 },
  posNum: { color: '#e6edf3', fontSize: 13, width: 36, textAlign: 'right' },
  noData: { color: '#8b949e', textAlign: 'center', marginTop: 40 },
});
