import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { FearGreedHistory, fetchFearGreed, ratingColor } from '../src/api/cnn';
import { fetchTwFearGreedHistory } from '../src/api/twFearGreed';
import { fetchTwseRealtime } from '../src/api/twse';
import { fetchOHLCV, fetchQuote } from '../src/api/yahoo';

type FearGreedPoint = {
  date: number;
  score: number;
};

type StockPoint = {
  date: number;
  close: number;
};

type CompareStock = {
  name: string;
  symbol: string;
  series: StockPoint[];
};

type MarketKey = 'us' | 'tw';

const FG_HEIGHT = 220;
const STOCK_HEIGHT = 220;
const CHART_GAP = 10;
const CHART_PAD = { top: 18, right: 14, bottom: 28, left: 40 };
const CARD_GAP = 16;

function normalizeSymbol(raw: string): string {
  const upper = raw.toUpperCase().trim();
  if (/^\d{4}$/.test(upper)) return `${upper}.TW`;
  if (/^\d{4,6}$/.test(upper)) return `${upper}.TW`;
  return upper;
}

function displaySymbol(symbol: string): string {
  return symbol.replace(/\.(TW|TWO)$/, '');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

function formatAxisLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}/${month}`;
}

function formatPrice(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '--';
  return value.toFixed(2);
}

function formatSignedPrice(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '--';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}`;
}

function valueTone(current: number | null, previous: number | null): string {
  if (current == null || previous == null || Number.isNaN(current) || Number.isNaN(previous)) {
    return '#e6edf3';
  }
  if (current > previous) return '#43a047';
  if (current < previous) return '#ef5350';
  return '#e6edf3';
}

function buildPath(
  points: Array<{ date: number; value: number }>,
  xForTime: (timestamp: number) => number,
  yForValue: (value: number) => number
): string {
  let path = '';
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const x = xForTime(point.date).toFixed(1);
    const y = yForValue(point.value).toFixed(1);
    path += i === 0 ? `M${x},${y}` : ` L${x},${y}`;
  }
  return path;
}

function findNearestPointIndex(points: Array<{ date: number }>, timestamp: number): number {
  if (!points.length) return -1;
  let bestIndex = 0;
  let bestDistance = Math.abs(points[0].date - timestamp);
  for (let i = 1; i < points.length; i += 1) {
    const distance = Math.abs(points[i].date - timestamp);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function findLatestPointAtOrBefore(points: StockPoint[], timestamp: number): number {
  if (!points.length) return -1;
  let bestIndex = -1;
  for (let i = 0; i < points.length; i += 1) {
    if (points[i].date <= timestamp) {
      bestIndex = i;
    } else {
      break;
    }
  }
  return bestIndex >= 0 ? bestIndex : 0;
}

function buildAxisTicks(start: number, end: number, count: number) {
  if (end <= start) return [{ label: formatAxisLabel(start), time: start }];
  return Array.from({ length: count + 1 }, (_, index) => {
    const ratio = index / count;
    const time = start + (end - start) * ratio;
    return { label: formatAxisLabel(time), time };
  });
}

function fearGreedLabel(score: number): string {
  if (score <= 24) return '極度恐懼';
  if (score <= 44) return '恐懼';
  if (score <= 55) return '中性';
  if (score <= 74) return '貪婪';
  return '極度貪婪';
}

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function TouchOverlay({
  height,
  onTouch,
}: {
  height: number;
  onTouch: (x: number) => void;
}) {
  return (
    <View
      style={[StyleSheet.absoluteFillObject, { height }]}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={event => onTouch(event.nativeEvent.locationX)}
      onResponderMove={event => onTouch(event.nativeEvent.locationX)}
      onStartShouldSetResponder={() => true}
    />
  );
}

function FearGreedPanel({
  activeTime,
  height,
  history,
  showXAxis,
  ticks,
  width,
  xForTime,
}: {
  activeTime: number;
  height: number;
  history: FearGreedPoint[];
  showXAxis: boolean;
  ticks: Array<{ label: string; time: number }>;
  width: number;
  xForTime: (timestamp: number) => number;
}) {
  const chartW = width - CHART_PAD.left - CHART_PAD.right;
  const chartH = height - CHART_PAD.top - CHART_PAD.bottom;
  const yForValue = (value: number) => CHART_PAD.top + chartH - (value / 100) * chartH;
  const fearGreedPath = useMemo(
    () => buildPath(history.map(point => ({ date: point.date, value: point.score })), xForTime, yForValue),
    [history, xForTime]
  );
  const activeIndex = findNearestPointIndex(history, activeTime);
  const activePoint = activeIndex >= 0 ? history[activeIndex] : null;
  const yTicks = [0, 25, 50, 75, 100];

  return (
    <Svg height={height} width={width}>
      <Rect fill="#11161d" height={height} width={width} x={0} y={0} />
      <Rect fill="#0f141a" height={chartH} width={chartW} x={CHART_PAD.left} y={CHART_PAD.top} />

      <Rect fill="rgba(239,83,80,0.10)" height={yForValue(0) - yForValue(25)} width={chartW} x={CHART_PAD.left} y={yForValue(25)} />
      <Rect fill="rgba(255,183,77,0.08)" height={yForValue(25) - yForValue(45)} width={chartW} x={CHART_PAD.left} y={yForValue(45)} />
      <Rect fill="rgba(144,202,249,0.08)" height={yForValue(45) - yForValue(55)} width={chartW} x={CHART_PAD.left} y={yForValue(55)} />
      <Rect fill="rgba(165,214,167,0.08)" height={yForValue(55) - yForValue(75)} width={chartW} x={CHART_PAD.left} y={yForValue(75)} />
      <Rect fill="rgba(67,160,71,0.10)" height={yForValue(75) - yForValue(100)} width={chartW} x={CHART_PAD.left} y={yForValue(100)} />

      {yTicks.map(value => (
        <React.Fragment key={value}>
          <Line
            stroke={value === 25 || value === 75 ? 'rgba(255,255,255,0.14)' : '#27313b'}
            strokeDasharray={value === 25 || value === 75 ? '4,3' : undefined}
            strokeWidth={1}
            x1={CHART_PAD.left}
            x2={width - CHART_PAD.right}
            y1={yForValue(value)}
            y2={yForValue(value)}
          />
          <SvgText
            fill="#8b949e"
            fontSize={10}
            textAnchor="end"
            x={CHART_PAD.left - 6}
            y={yForValue(value) + 4}
          >
            {value}
          </SvgText>
        </React.Fragment>
      ))}

      <SvgText fill="#c9d1d9" fontSize={12} fontWeight="700" x={CHART_PAD.left} y={14}>
        Fear &amp; Greed
      </SvgText>

      {fearGreedPath ? <Path d={fearGreedPath} fill="none" stroke="#79c0ff" strokeWidth={2.2} /> : null}

      <Line
        stroke="#d0d7de"
        strokeDasharray="4,3"
        strokeWidth={1}
        x1={xForTime(activeTime)}
        x2={xForTime(activeTime)}
        y1={CHART_PAD.top}
        y2={CHART_PAD.top + chartH}
      />

      {activePoint ? (
        <Circle
          cx={xForTime(activePoint.date)}
          cy={yForValue(activePoint.score)}
          fill="#79c0ff"
          r={4.5}
          stroke="#0d1117"
          strokeWidth={2}
        />
      ) : null}

      {showXAxis
        ? ticks.map((tick, index) => (
            <SvgText
              key={`${tick.time}-${index}`}
              fill="#8b949e"
              fontSize={10}
              textAnchor={index === 0 ? 'start' : index === ticks.length - 1 ? 'end' : 'middle'}
              x={xForTime(tick.time)}
              y={height - 8}
            >
              {tick.label}
            </SvgText>
          ))
        : null}
    </Svg>
  );
}

function StockPanel({
  activeTime,
  height,
  showXAxis,
  stock,
  ticks,
  width,
  xForTime,
}: {
  activeTime: number;
  height: number;
  showXAxis: boolean;
  stock: CompareStock | null;
  ticks: Array<{ label: string; time: number }>;
  width: number;
  xForTime: (timestamp: number) => number;
}) {
  const chartW = width - CHART_PAD.left - CHART_PAD.right;
  const chartH = height - CHART_PAD.top - CHART_PAD.bottom;

  const minClose = useMemo(
    () => (stock?.series.length ? Math.min(...stock.series.map(point => point.close)) : 0),
    [stock]
  );
  const maxClose = useMemo(
    () => (stock?.series.length ? Math.max(...stock.series.map(point => point.close)) : 1),
    [stock]
  );
  const priceSpan = Math.max(maxClose - minClose, maxClose * 0.06, 1);
  const minY = minClose - priceSpan * 0.08;
  const maxY = maxClose + priceSpan * 0.08;
  const yForValue = (value: number) => CHART_PAD.top + chartH - ((value - minY) / (maxY - minY)) * chartH;

  const seriesPath = useMemo(() => {
    if (!stock?.series.length) return '';
    return buildPath(stock.series.map(point => ({ date: point.date, value: point.close })), xForTime, yForValue);
  }, [stock, xForTime, minY, maxY]);

  const activeIndex = stock ? findLatestPointAtOrBefore(stock.series, activeTime) : -1;
  const activePoint = activeIndex >= 0 && stock ? stock.series[activeIndex] : null;
  const yTicks = stock ? Array.from({ length: 4 }, (_, index) => minY + ((maxY - minY) * index) / 3) : [];

  const latest = stock?.series.at(-1)?.close ?? null;
  const previous = stock && stock.series.length > 1 ? stock.series[stock.series.length - 2].close : null;
  const lineColor = valueTone(latest, previous);

  return (
    <Svg height={height} width={width}>
      <Rect fill="#11161d" height={height} width={width} x={0} y={0} />
      <Rect fill="#0f141a" height={chartH} width={chartW} x={CHART_PAD.left} y={CHART_PAD.top} />

      <SvgText fill="#c9d1d9" fontSize={12} fontWeight="700" x={CHART_PAD.left} y={14}>
        {stock ? `Compare ${displaySymbol(stock.symbol)} ${stock.name}` : 'Add a stock to compare'}
      </SvgText>

      {stock
        ? yTicks.map((value, index) => (
            <React.Fragment key={`stock-grid-${index}`}>
              <Line
                stroke="#27313b"
                strokeWidth={1}
                x1={CHART_PAD.left}
                x2={width - CHART_PAD.right}
                y1={yForValue(value)}
                y2={yForValue(value)}
              />
              <SvgText
                fill="#8b949e"
                fontSize={10}
                textAnchor="start"
                x={width - CHART_PAD.right + 4}
                y={yForValue(value) + 4}
              >
                {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(2)}
              </SvgText>
            </React.Fragment>
          ))
        : null}

      {stock && seriesPath ? <Path d={seriesPath} fill="none" stroke={lineColor} strokeWidth={2.2} /> : null}

      {stock ? (
        <Line
          stroke="#d0d7de"
          strokeDasharray="4,3"
          strokeWidth={1}
          x1={xForTime(activeTime)}
          x2={xForTime(activeTime)}
          y1={CHART_PAD.top}
          y2={CHART_PAD.top + chartH}
        />
      ) : null}

      {stock && activePoint ? (
        <Circle
          cx={xForTime(activePoint.date)}
          cy={yForValue(activePoint.close)}
          fill={lineColor}
          r={4.5}
          stroke="#0d1117"
          strokeWidth={2}
        />
      ) : null}

      {!stock ? (
        <SvgText
          fill="#8b949e"
          fontSize={13}
          textAnchor="middle"
          x={width / 2}
          y={height / 2}
        >
          輸入 2330 / 0050 / QQQ / AAPL 即可疊加價格走勢
        </SvgText>
      ) : null}

      {showXAxis
        ? ticks.map((tick, index) => (
            <SvgText
              key={`stock-axis-${tick.time}-${index}`}
              fill="#8b949e"
              fontSize={10}
              textAnchor={index === 0 ? 'start' : index === ticks.length - 1 ? 'end' : 'middle'}
              x={xForTime(tick.time)}
              y={height - 8}
            >
              {tick.label}
            </SvgText>
          ))
        : null}
    </Svg>
  );
}

export default function FearGreedHistoryScreen() {
  const params = useLocalSearchParams<{ historyJson?: string | string[]; market?: string | string[] }>();
  const { width: screenWidth } = useWindowDimensions();
  const market: MarketKey = firstParam(params.market) === 'tw' ? 'tw' : 'us';

  const fallbackHistory = useMemo<FearGreedPoint[]>(() => {
    try {
      const parsed = JSON.parse(firstParam(params.historyJson) ?? '[]') as FearGreedPoint[];
      return parsed
        .filter(point => Number.isFinite(point?.date) && Number.isFinite(point?.score))
        .sort((a, b) => a.date - b.date);
    } catch {
      return [];
    }
  }, [params.historyJson]);

  const [history, setHistory] = useState<FearGreedPoint[]>(fallbackHistory);
  const [historyLoading, setHistoryLoading] = useState(fallbackHistory.length === 0);
  const [historyError, setHistoryError] = useState('');
  const [symbolInput, setSymbolInput] = useState('');
  const [compareStock, setCompareStock] = useState<CompareStock | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedTime, setSelectedTime] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      if (fallbackHistory.length > 0) {
        setHistory(fallbackHistory);
        setHistoryLoading(false);
        setHistoryError('');
        return;
      }

      setHistoryLoading(true);
      setHistoryError('');

      try {
        const nextHistory =
          market === 'tw'
            ? await fetchTwFearGreedHistory()
            : (await fetchFearGreed()).history.map((point: FearGreedHistory) => ({
                date: point.date,
                score: point.score,
              }));

        if (!cancelled) {
          setHistory(nextHistory);
        }
      } catch (error: any) {
        if (!cancelled) {
          setHistory([]);
          setHistoryError(error?.message ?? String(error));
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    }

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [fallbackHistory, market]);

  useEffect(() => {
    if (history.length > 0) {
      setSelectedTime(history[history.length - 1].date);
    }
  }, [history, market]);

  useEffect(() => {
    setCompareStock(null);
    setLoadError('');
    setSymbolInput('');
  }, [market]);

  const rangeStart = history[0]?.date ?? Date.now() - 365 * 24 * 60 * 60 * 1000;
  const rangeEnd = history[history.length - 1]?.date ?? Date.now();
  const activeTime = selectedTime ?? rangeEnd;
  const chartWidth = screenWidth - 32;
  const plotWidth = chartWidth - CHART_PAD.left - CHART_PAD.right;
  const axisTicks = useMemo(() => buildAxisTicks(rangeStart, rangeEnd, 4), [rangeStart, rangeEnd]);

  const xForTime = (timestamp: number) => {
    if (rangeEnd <= rangeStart) return CHART_PAD.left;
    const clampedTime = clamp(timestamp, rangeStart, rangeEnd);
    return CHART_PAD.left + ((clampedTime - rangeStart) / (rangeEnd - rangeStart)) * plotWidth;
  };

  const currentFearGreedIndex = findNearestPointIndex(history, activeTime);
  const currentFearGreed = currentFearGreedIndex >= 0 ? history[currentFearGreedIndex] : null;
  const previousFearGreed = currentFearGreedIndex > 0 ? history[currentFearGreedIndex - 1] : null;

  const stockIndex = compareStock ? findLatestPointAtOrBefore(compareStock.series, activeTime) : -1;
  const currentStock = stockIndex >= 0 && compareStock ? compareStock.series[stockIndex] : null;
  const previousStock = stockIndex > 0 && compareStock ? compareStock.series[stockIndex - 1] : null;

  const stockChange = currentStock && previousStock ? currentStock.close - previousStock.close : null;
  const stockChangePct =
    currentStock && previousStock && previousStock.close > 0
      ? ((currentStock.close - previousStock.close) / previousStock.close) * 100
      : null;

  const marketTitle = market === 'tw' ? '台股市場情緒' : '美股市場情緒';
  const marketSubtitle =
    market === 'tw'
      ? '台股版本使用每日預先計算資料，點圖可拖曳查看一年歷史，並可和任一股票或 ETF 疊圖對照。'
      : '美股版本使用 CNN Fear & Greed 一年期資料，點圖可拖曳查看歷史，並可和任一股票或 ETF 疊圖對照。';

  async function loadCompareStock() {
    const normalized = normalizeSymbol(symbolInput);
    if (!normalized) {
      setLoadError('請先輸入股票代碼。');
      return;
    }

    setLoading(true);
    setLoadError('');

    try {
      const [ohlcv, quote, twse] = await Promise.all([
        fetchOHLCV(normalized, 1.5),
        fetchQuote(normalized).catch(() => null),
        /\.(TW|TWO)$/.test(normalized) ? fetchTwseRealtime(normalized).catch(() => null) : Promise.resolve(null),
      ]);

      const series = ohlcv
        .filter(point => point.date >= rangeStart && point.date <= rangeEnd)
        .map(point => ({ close: point.close, date: point.date }));

      if (!series.length) {
        throw new Error('這段期間找不到可比較的股價資料。');
      }

      const name =
        twse?.name ||
        quote?.longName ||
        quote?.shortName ||
        displaySymbol(quote?.symbol ?? normalized);

      const symbol = quote?.symbol ?? normalized;
      setCompareStock({ name, symbol, series });
      setSymbolInput(displaySymbol(symbol));
    } catch (error: any) {
      setLoadError(error?.message ?? String(error));
    } finally {
      setLoading(false);
    }
  }

  function clearCompareStock() {
    setCompareStock(null);
    setLoadError('');
  }

  const chartAreaHeight = FG_HEIGHT + CHART_GAP + STOCK_HEIGHT;

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.bg}>
      <View style={styles.headerCard}>
        <Text style={styles.title}>{marketTitle}</Text>
        <Text style={styles.subtitle}>{marketSubtitle}</Text>
      </View>

      {historyLoading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color="#58a6ff" />
          <Text style={styles.loadingText}>正在載入歷史資料...</Text>
        </View>
      ) : null}

      {!historyLoading && historyError ? (
        <View style={styles.loadingCard}>
          <Text style={styles.errorText}>{historyError}</Text>
        </View>
      ) : null}

      {!historyLoading && history.length > 0 ? (
        <>
          <View style={styles.inputCard}>
            <Text style={styles.inputLabel}>Compare stock / ETF</Text>
            <View style={styles.inputRow}>
              <TextInput
                autoCapitalize="characters"
                autoCorrect={false}
                onChangeText={setSymbolInput}
                onSubmitEditing={() => void loadCompareStock()}
                placeholder="輸入 2330 / 0050 / QQQ / AAPL"
                placeholderTextColor="#6e7681"
                returnKeyType="search"
                style={styles.input}
                value={symbolInput}
              />
              <TouchableOpacity onPress={() => void loadCompareStock()} style={styles.primaryButton}>
                {loading ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.primaryButtonText}>載入</Text>}
              </TouchableOpacity>
              {compareStock ? (
                <TouchableOpacity onPress={clearCompareStock} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>清除</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}
          </View>

          <View style={styles.chartCard}>
            <View style={[styles.chartArea, { height: chartAreaHeight }]}>
              <FearGreedPanel
                activeTime={activeTime}
                height={FG_HEIGHT}
                history={history}
                showXAxis={false}
                ticks={axisTicks}
                width={chartWidth}
                xForTime={xForTime}
              />

              <View style={styles.chartDivider} />

              <StockPanel
                activeTime={activeTime}
                height={STOCK_HEIGHT}
                showXAxis
                stock={compareStock}
                ticks={axisTicks}
                width={chartWidth}
                xForTime={xForTime}
              />

              <TouchOverlay
                height={chartAreaHeight}
                onTouch={x => {
                  const plotX = clamp(x, CHART_PAD.left, CHART_PAD.left + plotWidth);
                  const ratio = plotWidth > 0 ? (plotX - CHART_PAD.left) / plotWidth : 0;
                  setSelectedTime(rangeStart + (rangeEnd - rangeStart) * ratio);
                }}
              />
            </View>
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoCard}>
              <Text style={styles.infoCardTitle}>{market === 'tw' ? '台股情緒' : '美股情緒'}</Text>
              <Text style={styles.infoDate}>{currentFearGreed ? formatDate(currentFearGreed.date) : '--'}</Text>
              <Text style={[styles.bigValue, { color: currentFearGreed ? ratingColor(currentFearGreed.score) : '#e6edf3' }]}>
                {currentFearGreed?.score ?? '--'}
              </Text>
              <Text style={styles.infoLabel}>{currentFearGreed ? fearGreedLabel(currentFearGreed.score) : '--'}</Text>
              <Text style={[styles.infoSubValue, { color: valueTone(currentFearGreed?.score ?? null, previousFearGreed?.score ?? null) }]}>
                日變化 {formatSignedPrice(currentFearGreed != null && previousFearGreed != null ? currentFearGreed.score - previousFearGreed.score : null)}
              </Text>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoCardTitle}>Compare price</Text>
              <Text style={styles.infoDate}>
                {compareStock && currentStock ? `${displaySymbol(compareStock.symbol)} / ${formatDate(currentStock.date)}` : '尚未選擇比較標的'}
              </Text>
              <Text style={styles.bigValue}>{currentStock ? formatPrice(currentStock.close) : '--'}</Text>
              <Text style={styles.infoLabel}>
                {compareStock ? `${displaySymbol(compareStock.symbol)} ${compareStock.name}` : '輸入股票或 ETF 後即可顯示'}
              </Text>
              <Text style={[styles.infoSubValue, { color: valueTone(stockChange, 0) }]}>
                {currentStock && stockChange != null && stockChangePct != null
                  ? `${formatSignedPrice(stockChange)} (${stockChangePct >= 0 ? '+' : ''}${stockChangePct.toFixed(2)}%)`
                  : '--'}
              </Text>
            </View>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: CARD_GAP,
  },
  headerCard: {
    gap: 6,
  },
  title: {
    color: '#e6edf3',
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: '#8b949e',
    fontSize: 13,
    lineHeight: 20,
  },
  inputCard: {
    backgroundColor: '#161b22',
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  loadingCard: {
    backgroundColor: '#161b22',
    borderRadius: 14,
    padding: 18,
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#8b949e',
    fontSize: 13,
  },
  inputLabel: {
    color: '#c9d1d9',
    fontSize: 13,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#0d1117',
    borderColor: '#30363d',
    borderRadius: 10,
    borderWidth: 1,
    color: '#e6edf3',
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  primaryButton: {
    backgroundColor: '#1f6feb',
    borderRadius: 10,
    minWidth: 66,
    paddingHorizontal: 14,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#21262d',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#e6edf3',
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    color: '#ff7b72',
    fontSize: 12,
    textAlign: 'center',
  },
  chartCard: {
    backgroundColor: '#161b22',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#21262d',
  },
  chartArea: {
    position: 'relative',
  },
  chartDivider: {
    height: CHART_GAP,
    backgroundColor: '#161b22',
  },
  infoGrid: {
    gap: 12,
  },
  infoCard: {
    backgroundColor: '#161b22',
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  infoCardTitle: {
    color: '#8b949e',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  infoDate: {
    color: '#8b949e',
    fontSize: 12,
  },
  bigValue: {
    color: '#e6edf3',
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 42,
  },
  infoLabel: {
    color: '#c9d1d9',
    fontSize: 13,
    fontWeight: '600',
  },
  infoSubValue: {
    color: '#8b949e',
    fontSize: 13,
    fontWeight: '600',
  },
});
