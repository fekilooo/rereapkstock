import React, { useMemo, useState } from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { FiveLinesResult } from '../core/fiveLines';

interface Props {
  data: FiveLinesResult;
}

interface TooltipItem {
  color: string;
  label: string;
  previousValue?: number | null;
  value: number | null;
}

interface TooltipSection {
  title: string;
  items: TooltipItem[];
}

interface PanelBaseProps {
  activeIndex: number | null;
  data: FiveLinesResult;
  H: number;
  PAD: { top: number; right: number; bottom: number; left: number };
  showXLabel: boolean;
  W: number;
  xPositions: number[];
}

const W_PAD = 32;

const BG = '#ffffff';
const PLOT = '#fafafa';
const GRID = '#f0f0f5';
const AXIS = '#86868b';

const SLOW_LINES = [
  { key: 'optimistic' as const, color: '#e1e1e6', dash: undefined },
  { key: 'resistance' as const, color: '#d1d1d6', dash: '3,2' },
  { key: 'trend' as const, color: '#86868b', dash: '5,3' },
  { key: 'support' as const, color: '#d1d1d6', dash: '3,2' },
  { key: 'pessimistic' as const, color: '#e1e1e6', dash: undefined },
] as const;

const FAST_LINES = [
  { key: 'optimistic' as const, color: '#ff3b30', dash: undefined },
  { key: 'resistance' as const, color: '#ff9500', dash: '1,3' },
  { key: 'trend' as const, color: '#8e8e93', dash: '5,3' },
  { key: 'support' as const, color: '#ffcc00', dash: '1,3' },
  { key: 'pessimistic' as const, color: '#34c759', dash: undefined },
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function createXPositions(dates: number[], left: number, width: number): number[] {
  if (dates.length <= 1) return [left];
  const min = dates[0];
  const max = dates[dates.length - 1];
  const span = Math.max(max - min, 1);
  return dates.map(date => left + ((date - min) / span) * width);
}

function sliceFiveLinesData(data: FiveLinesResult, startIndex: number, endIndex: number): FiveLinesResult {
  return {
    ...data,
    dates: data.dates.slice(startIndex, endIndex + 1),
    close: data.close.slice(startIndex, endIndex + 1),
    trend: data.trend.slice(startIndex, endIndex + 1),
    optimistic: data.optimistic.slice(startIndex, endIndex + 1),
    resistance: data.resistance.slice(startIndex, endIndex + 1),
    support: data.support.slice(startIndex, endIndex + 1),
    pessimistic: data.pessimistic.slice(startIndex, endIndex + 1),
    channelMa: data.channelMa.slice(startIndex, endIndex + 1),
    channelTop: data.channelTop.slice(startIndex, endIndex + 1),
    channelBot: data.channelBot.slice(startIndex, endIndex + 1),
  };
}

function buildPath(values: (number | null)[], xPositions: number[], yFn: (v: number) => number): string {
  let d = '';
  let pen = false;

  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value == null) {
      pen = false;
      continue;
    }

    const x = xPositions[i]?.toFixed(1);
    if (!x) continue;
    const y = yFn(value).toFixed(1);
    d += pen ? ` L${x},${y}` : ` M${x},${y}`;
    pen = true;
  }

  return d.trim();
}

function buildBand(
  top: (number | null)[],
  bottom: (number | null)[],
  xPositions: number[],
  yFn: (v: number) => number
): string {
  const segments: string[] = [];
  let current: { bottom: number; index: number; top: number }[] = [];

  const flush = () => {
    if (current.length < 2) {
      current = [];
      return;
    }

    const upper = current
      .map(point => `${xPositions[point.index].toFixed(1)},${yFn(point.top).toFixed(1)}`)
      .join(' L');
    const lower = current
      .slice()
      .reverse()
      .map(point => `${xPositions[point.index].toFixed(1)},${yFn(point.bottom).toFixed(1)}`)
      .join(' L');

    segments.push(`M${upper} L${lower} Z`);
    current = [];
  };

  for (let i = 0; i < top.length; i += 1) {
    const t = top[i];
    const b = bottom[i];
    if (t == null || b == null) {
      flush();
      continue;
    }
    current.push({ bottom: b, index: i, top: t });
  }

  flush();
  return segments.join(' ');
}

function yRange(arrays: (number | null)[][], pad = 0.04): { maxY: number; minY: number } {
  let low = Infinity;
  let high = -Infinity;

  for (const values of arrays) {
    for (const value of values) {
      if (value == null) continue;
      if (value < low) low = value;
      if (value > high) high = value;
    }
  }

  const margin = ((high - low) || high * 0.1 || 1) * pad;
  return { maxY: high + margin, minY: low - margin };
}

function xLabels(dates: number[], years: number, xPositions: number[]) {
  const count = years >= 1 ? 4 : 3;
  const labels: { label: string; x: number }[] = [];

  for (let k = 0; k <= count; k += 1) {
    const index = Math.min(dates.length - 1, Math.round((k / count) * (dates.length - 1)));
    const date = new Date(dates[index]);
    const yy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');

    labels.push({
      label: years >= 1 ? `${yy}/${mm}` : `${mm}/${dd}`,
      x: xPositions[index],
    });
  }

  return labels;
}

function findNearestIndex(xPositions: number[], x: number): number {
  if (xPositions.length <= 1) return 0;

  const clamped = clamp(x, xPositions[0], xPositions[xPositions.length - 1]);
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < xPositions.length; i += 1) {
    const distance = Math.abs(xPositions[i] - clamped);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}/${mm}/${dd}`;
}

function formatValue(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '--';
  return value.toFixed(2);
}

function valueTone(value: number | null, previousValue?: number | null): string {
  if (value == null || previousValue == null || Number.isNaN(value) || Number.isNaN(previousValue)) {
    return '#1d1d1f';
  }
  if (value > previousValue) return '#1f8f4e';
  if (value < previousValue) return '#d14343';
  return '#1d1d1f';
}

function sortTooltipItems(items: TooltipItem[]): TooltipItem[] {
  return [...items].sort((a, b) => {
    const aValue = a.value ?? Number.NEGATIVE_INFINITY;
    const bValue = b.value ?? Number.NEGATIVE_INFINITY;
    return bValue - aValue;
  });
}

function buildFiveTooltipSection(data: FiveLinesResult, index: number, fast: boolean): TooltipSection {
  return {
    title: '五線譜',
    items: sortTooltipItems([
      {
        color: '#1d1d1f',
        label: '收盤價',
        previousValue: data.close[index - 1] ?? null,
        value: data.close[index] ?? null,
      },
      {
        color: fast ? '#8e8e93' : '#86868b',
        label: '趨勢線',
        previousValue: data.trend[index - 1] ?? null,
        value: data.trend[index] ?? null,
      },
      {
        color: fast ? '#ff3b30' : '#e1e1e6',
        label: '+2σ 極度貪婪',
        previousValue: data.optimistic[index - 1] ?? null,
        value: data.optimistic[index] ?? null,
      },
      {
        color: fast ? '#ff9500' : '#d1d1d6',
        label: '+1σ 貪婪',
        previousValue: data.resistance[index - 1] ?? null,
        value: data.resistance[index] ?? null,
      },
      {
        color: fast ? '#ffcc00' : '#d1d1d6',
        label: '-1σ 恐懼',
        previousValue: data.support[index - 1] ?? null,
        value: data.support[index] ?? null,
      },
      {
        color: fast ? '#34c759' : '#e1e1e6',
        label: '-2σ 極度恐懼',
        previousValue: data.pessimistic[index - 1] ?? null,
        value: data.pessimistic[index] ?? null,
      },
    ]),
  };
}

function buildChannelTooltipSection(data: FiveLinesResult, index: number): TooltipSection {
  return {
    title: '樂活通道',
    items: sortTooltipItems(
      [
        {
          color: '#1d1d1f',
          label: '收盤價',
          previousValue: data.close[index - 1] ?? null,
          value: data.close[index] ?? null,
        },
        {
          color: '#0071e3',
          label: '通道上軌',
          previousValue: data.channelTop[index - 1] ?? null,
          value: data.channelTop[index] ?? null,
        },
        {
          color: '#0071e3',
          label: '通道下軌',
          previousValue: data.channelBot[index - 1] ?? null,
          value: data.channelBot[index] ?? null,
        },
        {
          color: '#5ac8fa',
          label: '20 日均線',
          previousValue: data.channelMa[index - 1] ?? null,
          value: data.channelMa[index] ?? null,
        },
      ].filter(item => item.value != null)
    ),
  };
}

function TooltipCard({ dateLabel, sections }: { dateLabel: string; sections: TooltipSection[] }) {
  return (
    <View pointerEvents="none" style={s.tooltip}>
      <Text style={s.tooltipDate}>{dateLabel}</Text>
      <View style={s.tooltipSectionsRow}>
        {sections.map(section => (
          <View key={section.title} style={s.tooltipSection}>
            <Text style={s.tooltipSectionTitle}>{section.title}</Text>
            {section.items.map(item => (
              <View key={item.label} style={s.tooltipRow}>
                <View style={[s.tooltipDot, { backgroundColor: item.color }]} />
                <Text style={s.tooltipLabel}>{item.label}</Text>
                <Text style={[s.tooltipValue, { color: valueTone(item.value, item.previousValue) }]}>
                  {formatValue(item.value)}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function TouchOverlay({ height, onTouch }: { height: number; onTouch: (x: number) => void }) {
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

function FivePanel({ activeIndex, data, H, PAD, showXLabel, W, xPositions }: PanelBaseProps) {
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const allValues = [data.optimistic, data.pessimistic, data.close as (number | null)[]];
  const { maxY, minY } = useMemo(() => yRange(allValues), [data]);
  const labels = useMemo(
    () => (showXLabel ? xLabels(data.dates, data.years, xPositions) : []),
    [data.dates, data.years, showXLabel, xPositions]
  );
  const lines = data.years < 1 ? FAST_LINES : SLOW_LINES;
  const isFast = data.years < 1;
  const yFn = (value: number) => PAD.top + chartH - ((value - minY) / (maxY - minY)) * chartH;
  const yTicks = useMemo(() => Array.from({ length: 5 }, (_, i) => minY + ((maxY - minY) * i) / 4), [maxY, minY]);

  const upperBand = isFast
    ? buildBand(
        data.resistance,
        data.optimistic.map(value => (value != null ? value + data.stdResidual * 2 : null)),
        xPositions,
        yFn
      )
    : '';
  const sellBand = isFast ? buildBand(data.optimistic, data.resistance, xPositions, yFn) : '';
  const lowerBand = isFast ? buildBand(data.pessimistic, data.support, xPositions, yFn) : '';
  const buyBand = isFast
    ? buildBand(
        data.pessimistic.map(value => (value != null ? value - data.stdResidual * 2 : null)),
        data.pessimistic,
        xPositions,
        yFn
      )
    : '';

  return (
    <Svg width={W} height={H}>
      <Rect x={0} y={0} width={W} height={H} fill={BG} />
      <Rect x={PAD.left} y={PAD.top} width={chartW} height={chartH} fill={PLOT} />

      {yTicks.map((value, index) => (
        <G key={`grid-${index}`}>
          <Line x1={PAD.left} y1={yFn(value)} x2={W - PAD.right} y2={yFn(value)} stroke={GRID} strokeWidth={1} />
          <SvgText x={W - PAD.right + 2} y={yFn(value) + 3} fill={AXIS} fontSize={9} textAnchor="start">
            {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(1)}
          </SvgText>
        </G>
      ))}

      {upperBand ? <Path d={upperBand} fill="rgba(255,59,48,0.18)" stroke="none" /> : null}
      {sellBand ? <Path d={sellBand} fill="rgba(255,149,0,0.10)" stroke="none" /> : null}
      {lowerBand ? <Path d={lowerBand} fill="rgba(52,199,89,0.12)" stroke="none" /> : null}
      {buyBand ? <Path d={buyBand} fill="rgba(52,199,89,0.22)" stroke="none" /> : null}

      {lines.map(({ color, dash, key }) => {
        const path = buildPath(data[key], xPositions, yFn);
        return path ? <Path key={key} d={path} stroke={color} strokeWidth={1.2} fill="none" strokeDasharray={dash} /> : null;
      })}

      {(() => {
        const path = buildPath(data.close, xPositions, yFn);
        return path ? <Path d={path} stroke="#1d1d1f" strokeWidth={2} fill="none" /> : null;
      })()}

      {activeIndex != null ? (
        <Line
          x1={xPositions[activeIndex]}
          y1={PAD.top}
          x2={xPositions[activeIndex]}
          y2={PAD.top + chartH}
          stroke="#86868b"
          strokeWidth={1}
          strokeDasharray="3,3"
        />
      ) : null}

      {showXLabel
        ? labels.map(({ label, x }, index) => (
            <SvgText
              key={`x-label-${index}`}
              x={x}
              y={H - 6}
              textAnchor={index === 0 ? 'start' : index === labels.length - 1 ? 'end' : 'middle'}
              fill={AXIS}
              fontSize={9}
            >
              {label}
            </SvgText>
          ))
        : null}
    </Svg>
  );
}

function ChannelPanel({ activeIndex, data, H, PAD, showXLabel, W, xPositions }: PanelBaseProps) {
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const allValues = [data.channelTop, data.channelBot, data.close as (number | null)[]];
  const { maxY, minY } = useMemo(() => yRange(allValues), [data]);
  const labels = useMemo(
    () => (showXLabel ? xLabels(data.dates, data.years, xPositions) : []),
    [data.dates, data.years, showXLabel, xPositions]
  );
  const yFn = (value: number) => PAD.top + chartH - ((value - minY) / (maxY - minY)) * chartH;
  const yTicks = useMemo(() => Array.from({ length: 4 }, (_, i) => minY + ((maxY - minY) * i) / 3), [maxY, minY]);
  const channelFill = buildBand(data.channelTop, data.channelBot, xPositions, yFn);

  return (
    <Svg width={W} height={H}>
      <Rect x={0} y={0} width={W} height={H} fill={BG} />
      <Rect x={PAD.left} y={PAD.top} width={chartW} height={chartH} fill={PLOT} />

      {yTicks.map((value, index) => (
        <G key={`channel-grid-${index}`}>
          <Line x1={PAD.left} y1={yFn(value)} x2={W - PAD.right} y2={yFn(value)} stroke={GRID} strokeWidth={1} />
          <SvgText x={W - PAD.right + 2} y={yFn(value) + 3} fill={AXIS} fontSize={9} textAnchor="start">
            {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(1)}
          </SvgText>
        </G>
      ))}

      {channelFill ? <Path d={channelFill} fill="rgba(0,113,227,0.07)" stroke="none" /> : null}

      {(() => {
        const path = buildPath(data.channelTop, xPositions, yFn);
        return path ? <Path d={path} stroke="#0071e3" strokeWidth={1.5} fill="none" /> : null;
      })()}
      {(() => {
        const path = buildPath(data.channelBot, xPositions, yFn);
        return path ? <Path d={path} stroke="#0071e3" strokeWidth={1.5} fill="none" strokeDasharray="1,3" /> : null;
      })()}
      {(() => {
        const path = buildPath(data.channelMa, xPositions, yFn);
        return path ? <Path d={path} stroke="#5ac8fa" strokeWidth={1} fill="none" strokeDasharray="4,2,1,2" /> : null;
      })()}
      {(() => {
        const path = buildPath(data.close, xPositions, yFn);
        return path ? <Path d={path} stroke="#1d1d1f" strokeWidth={2} fill="none" /> : null;
      })()}

      {activeIndex != null ? (
        <Line
          x1={xPositions[activeIndex]}
          y1={PAD.top}
          x2={xPositions[activeIndex]}
          y2={PAD.top + chartH}
          stroke="#86868b"
          strokeWidth={1}
          strokeDasharray="3,3"
        />
      ) : null}

      {showXLabel
        ? labels.map(({ label, x }, index) => (
            <SvgText
              key={`channel-x-label-${index}`}
              x={x}
              y={H - 6}
              textAnchor={index === 0 ? 'start' : index === labels.length - 1 ? 'end' : 'middle'}
              fill={AXIS}
              fontSize={9}
            >
              {label}
            </SvgText>
          ))
        : null}
    </Svg>
  );
}

function SlowCombinedPanel({ activeIndex, data, H, PAD, W, xPositions }: Omit<PanelBaseProps, 'showXLabel'>) {
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const allValues = [data.optimistic, data.pessimistic, data.close as (number | null)[], data.channelTop, data.channelBot];
  const { maxY, minY } = useMemo(() => yRange(allValues), [data]);
  const labels = useMemo(() => xLabels(data.dates, data.years, xPositions), [data.dates, data.years, xPositions]);
  const yFn = (value: number) => PAD.top + chartH - ((value - minY) / (maxY - minY)) * chartH;
  const yTicks = useMemo(() => Array.from({ length: 5 }, (_, i) => minY + ((maxY - minY) * i) / 4), [maxY, minY]);
  const allBand = buildBand(data.optimistic, data.pessimistic, xPositions, yFn);
  const channelFill = buildBand(data.channelTop, data.channelBot, xPositions, yFn);

  return (
    <Svg width={W} height={H}>
      <Rect x={0} y={0} width={W} height={H} fill={BG} />
      <Rect x={PAD.left} y={PAD.top} width={chartW} height={chartH} fill={PLOT} />

      {yTicks.map((value, index) => (
        <G key={`slow-grid-${index}`}>
          <Line x1={PAD.left} y1={yFn(value)} x2={W - PAD.right} y2={yFn(value)} stroke={GRID} strokeWidth={1} />
          <SvgText x={W - PAD.right + 2} y={yFn(value) + 3} fill={AXIS} fontSize={9} textAnchor="start">
            {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(1)}
          </SvgText>
        </G>
      ))}

      {allBand ? <Path d={allBand} fill="rgba(200,200,210,0.18)" stroke="none" /> : null}
      {channelFill ? <Path d={channelFill} fill="rgba(0,113,227,0.05)" stroke="none" /> : null}

      {(() => {
        const path = buildPath(data.channelTop, xPositions, yFn);
        return path ? <Path d={path} stroke="#0071e3" strokeWidth={1} fill="none" opacity={0.5} /> : null;
      })()}
      {(() => {
        const path = buildPath(data.channelBot, xPositions, yFn);
        return path ? <Path d={path} stroke="#0071e3" strokeWidth={1} fill="none" opacity={0.5} strokeDasharray="3,2" /> : null;
      })()}

      {SLOW_LINES.map(({ color, dash, key }) => {
        const path = buildPath(data[key], xPositions, yFn);
        return path ? <Path key={key} d={path} stroke={color} strokeWidth={1.2} fill="none" strokeDasharray={dash} /> : null;
      })}

      {(() => {
        const path = buildPath(data.close, xPositions, yFn);
        return path ? <Path d={path} stroke="#1d1d1f" strokeWidth={2} fill="none" /> : null;
      })()}

      {activeIndex != null ? (
        <Line
          x1={xPositions[activeIndex]}
          y1={PAD.top}
          x2={xPositions[activeIndex]}
          y2={PAD.top + chartH}
          stroke="#86868b"
          strokeWidth={1}
          strokeDasharray="3,3"
        />
      ) : null}

      {labels.map(({ label, x }, index) => (
        <SvgText
          key={`slow-x-label-${index}`}
          x={x}
          y={H - 8}
          textAnchor={index === 0 ? 'start' : index === labels.length - 1 ? 'end' : 'middle'}
          fill={AXIS}
          fontSize={9}
        >
          {label}
        </SvgText>
      ))}
    </Svg>
  );
}

function Legend({ isFast, hasChannel }: { hasChannel: boolean; isFast: boolean }) {
  const lines = isFast ? FAST_LINES : SLOW_LINES;
  const labels = ['+2σ 極度貪婪', '+1σ 貪婪', '趨勢線', '-1σ 恐懼', '-2σ 極度恐懼'];

  return (
    <View style={s.legend}>
      {lines.map(({ color }, index) => (
        <View key={labels[index]} style={s.legendItem}>
          <View style={[s.legendLine, { backgroundColor: color }]} />
          <Text style={s.legendText}>{labels[index]}</Text>
        </View>
      ))}
      <View style={s.legendItem}>
        <View style={[s.legendLine, { backgroundColor: '#1d1d1f' }]} />
        <Text style={s.legendText}>收盤價</Text>
      </View>
      {hasChannel ? (
        <View style={s.legendItem}>
          <View style={[s.legendLine, { backgroundColor: '#0071e3' }]} />
          <Text style={s.legendText}>樂活通道</Text>
        </View>
      ) : null}
    </View>
  );
}

export function FiveLineChart({ data }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState(0);
  const screenW = Dimensions.get('window').width;
  const W = screenW - W_PAD;
  const PAD_FAST = { top: 12, right: 46, bottom: 20, left: 4 };
  const PAD_CHANNEL = { top: 8, right: 46, bottom: 24, left: 4 };
  const PAD_SLOW = { top: 12, right: 46, bottom: 28, left: 4 };
  const isFast = data.years < 1;
  const zoomRatios = [1, 0.72, 0.5, 0.32];

  const visibleWindow = useMemo(() => {
    const total = data.dates.length;
    if (total <= 1) return { endIndex: Math.max(total - 1, 0), startIndex: 0 };

    const ratio = zoomRatios[zoomLevel] ?? 1;
    const minWindow = Math.min(total, isFast ? 24 : 40);
    const windowSize = Math.max(minWindow, Math.round(total * ratio));

    if (windowSize >= total) {
      return { endIndex: total - 1, startIndex: 0 };
    }

    if (activeIndex == null) {
      return { endIndex: total - 1, startIndex: total - windowSize };
    }

    const half = Math.floor(windowSize / 2);
    let startIndex = activeIndex - half;
    let endIndex = startIndex + windowSize - 1;

    if (startIndex < 0) {
      startIndex = 0;
      endIndex = windowSize - 1;
    }

    if (endIndex >= total) {
      endIndex = total - 1;
      startIndex = total - windowSize;
    }

    return { endIndex, startIndex };
  }, [activeIndex, data.dates.length, isFast, zoomLevel]);

  const chartData = useMemo(
    () => sliceFiveLinesData(data, visibleWindow.startIndex, visibleWindow.endIndex),
    [data, visibleWindow.endIndex, visibleWindow.startIndex]
  );

  const chartWFast = W - PAD_FAST.left - PAD_FAST.right;
  const chartWSlow = W - PAD_SLOW.left - PAD_SLOW.right;
  const xPositionsFast = useMemo(
    () => createXPositions(chartData.dates, PAD_FAST.left, chartWFast),
    [chartData.dates, chartWFast]
  );
  const xPositionsSlow = useMemo(
    () => createXPositions(chartData.dates, PAD_SLOW.left, chartWSlow),
    [chartData.dates, chartWSlow]
  );

  const touchXPositions = isFast ? xPositionsFast : xPositionsSlow;
  const visibleActiveIndex =
    activeIndex == null ? null : clamp(activeIndex - visibleWindow.startIndex, 0, chartData.dates.length - 1);
  const selectedIndex = visibleActiveIndex ?? Math.max(chartData.dates.length - 1, 0);
  const canZoomIn = zoomLevel < zoomRatios.length - 1;
  const canZoomOut = zoomLevel > 0;

  const fastTooltipSections = useMemo<TooltipSection[]>(
    () => [buildFiveTooltipSection(chartData, selectedIndex, true), buildChannelTooltipSection(chartData, selectedIndex)],
    [chartData, selectedIndex]
  );

  const slowTooltipSections = useMemo<TooltipSection[]>(
    () => [buildFiveTooltipSection(chartData, selectedIndex, false), buildChannelTooltipSection(chartData, selectedIndex)],
    [chartData, selectedIndex]
  );

  const tooltipDate =
    visibleActiveIndex == null
      ? `${formatDate(chartData.dates[selectedIndex])}  最新`
      : formatDate(chartData.dates[selectedIndex]);

  const updateActiveIndex = (x: number) =>
    setActiveIndex(visibleWindow.startIndex + findNearestIndex(touchXPositions, x));

  const zoomControls = (
    <View style={s.zoomControls}>
      <TouchableOpacity
        style={[s.zoomButton, !canZoomOut && s.zoomButtonDisabled]}
        disabled={!canZoomOut}
        onPress={() => setZoomLevel(level => Math.max(0, level - 1))}
      >
        <Text style={[s.zoomButtonText, !canZoomOut && s.zoomButtonTextDisabled]}>-</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.zoomButton, !canZoomIn && s.zoomButtonDisabled]}
        disabled={!canZoomIn}
        onPress={() => setZoomLevel(level => Math.min(zoomRatios.length - 1, level + 1))}
      >
        <Text style={[s.zoomButtonText, !canZoomIn && s.zoomButtonTextDisabled]}>+</Text>
      </TouchableOpacity>
    </View>
  );

  if (isFast) {
    const upperHeight = 210;
    const lowerHeight = 150;
    const dividerHeight = 1;
    const chartAreaHeight = upperHeight + dividerHeight + lowerHeight;

    return (
      <View style={s.card}>
        <View style={[s.chartArea, { height: chartAreaHeight }]}>
          {zoomControls}
          <FivePanel
            activeIndex={visibleActiveIndex}
            data={chartData}
            H={upperHeight}
            PAD={PAD_FAST}
            showXLabel={false}
            W={W}
            xPositions={xPositionsFast}
          />
          <View style={s.divider} />
          <ChannelPanel
            activeIndex={visibleActiveIndex}
            data={chartData}
            H={lowerHeight}
            PAD={PAD_CHANNEL}
            showXLabel
            W={W}
            xPositions={xPositionsFast}
          />
          <TouchOverlay height={chartAreaHeight} onTouch={updateActiveIndex} />
        </View>

        <TooltipCard dateLabel={tooltipDate} sections={fastTooltipSections} />
        <Legend hasChannel isFast />
      </View>
    );
  }

  const slowHeight = 280;

  return (
    <View style={s.card}>
      <View style={[s.chartArea, { height: slowHeight }]}>
        {zoomControls}
        <SlowCombinedPanel
          activeIndex={visibleActiveIndex}
          data={chartData}
          H={slowHeight}
          PAD={PAD_SLOW}
          W={W}
          xPositions={xPositionsSlow}
        />
        <TouchOverlay height={slowHeight} onTouch={updateActiveIndex} />
      </View>

      <TooltipCard dateLabel={tooltipDate} sections={slowTooltipSections} />
      <Legend hasChannel isFast={false} />
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: '#f0f0f5',
  },
  chartArea: {
    position: 'relative',
  },
  zoomControls: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 3,
    flexDirection: 'row',
    gap: 8,
  },
  zoomButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: '#d0d7de',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  zoomButtonDisabled: {
    backgroundColor: '#f3f4f6',
    borderColor: '#e5e7eb',
  },
  zoomButtonText: {
    color: '#111827',
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '700',
  },
  zoomButtonTextDisabled: {
    color: '#9ca3af',
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f5',
    marginHorizontal: 4,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 10,
    rowGap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: BG,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendLine: {
    width: 14,
    height: 2,
    borderRadius: 1,
  },
  legendText: {
    color: '#555',
    fontSize: 11,
  },
  tooltip: {
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  tooltipDate: {
    color: '#1d1d1f',
    fontSize: 12,
    fontWeight: '700',
  },
  tooltipSectionsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  tooltipSection: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  tooltipSectionTitle: {
    color: '#555',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  tooltipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  tooltipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  tooltipLabel: {
    flex: 1,
    color: '#424245',
    fontSize: 10,
  },
  tooltipValue: {
    fontSize: 10,
    fontWeight: '600',
  },
});
