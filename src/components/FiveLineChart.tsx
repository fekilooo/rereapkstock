/**
 * 五線譜圖表元件
 *
 * 3.5Y（slow）→ 單張圖：五線 + 通道疊加（對應 view.py render_combined_chart）
 * 6M / 3M（fast）→ 兩張圖：上圖五線、下圖通道（對應 view.py render_fast_five_lines_chart）
 */
import React, { useMemo, useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
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

function createXPositions(dates: number[], left: number, width: number): number[] {
  if (dates.length <= 1) return [left];
  const min = dates[0];
  const max = dates[dates.length - 1];
  const span = Math.max(max - min, 1);
  return dates.map(date => left + ((date - min) / span) * width);
}

function buildPath(
  values: (number | null)[],
  xPositions: number[],
  yFn: (v: number) => number
): string {
  let d = '';
  let pen = false;

  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value == null) {
      pen = false;
      continue;
    }

    const x = xPositions[i]?.toFixed(1);
    const y = yFn(value).toFixed(1);
    if (!x) continue;

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
  let current: { bottom: number; i: number; top: number }[] = [];

  const flush = () => {
    if (current.length < 2) {
      current = [];
      return;
    }

    const upper = current
      .map(point => `${xPositions[point.i].toFixed(1)},${yFn(point.top).toFixed(1)}`)
      .join(' L');
    const lower = current
      .slice()
      .reverse()
      .map(point => `${xPositions[point.i].toFixed(1)},${yFn(point.bottom).toFixed(1)}`)
      .join(' L');

    segments.push(`M${upper} L${lower} Z`);
    current = [];
  };

  for (let i = 0; i < top.length; i++) {
    const t = top[i];
    const b = bottom[i];
    if (t == null || b == null) {
      flush();
      continue;
    }
    current.push({ bottom: b, i, top: t });
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

  for (let k = 0; k <= count; k++) {
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

  for (let i = 0; i < xPositions.length; i++) {
    const distance = Math.abs(xPositions[i] - clamped);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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

function TooltipCard({
  dateLabel,
  sections,
}: {
  dateLabel: string;
  sections: TooltipSection[];
}) {
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

function TouchOverlay({
  height,
  onClear,
  onTouch,
}: {
  height: number;
  onClear: () => void;
  onTouch: (x: number) => void;
}) {
  return (
    <View
      style={[StyleSheet.absoluteFillObject, { height }]}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={event => onTouch(event.nativeEvent.locationX)}
      onResponderMove={event => onTouch(event.nativeEvent.locationX)}
      onResponderRelease={onClear}
      onResponderTerminate={onClear}
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

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let i = 0; i <= 4; i++) ticks.push(minY + ((maxY - minY) * i) / 4);
    return ticks;
  }, [maxY, minY]);

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
          <Line
            x1={PAD.left}
            y1={yFn(value)}
            x2={W - PAD.right}
            y2={yFn(value)}
            stroke={GRID}
            strokeWidth={1}
          />
          <SvgText
            x={W - PAD.right + 2}
            y={yFn(value) + 3}
            fill={AXIS}
            fontSize={9}
            textAnchor="start"
          >
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
        return path ? (
          <Path
            key={key}
            d={path}
            stroke={color}
            strokeWidth={1.2}
            fill="none"
            strokeDasharray={dash}
          />
        ) : null;
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

      {showXLabel &&
        labels.map(({ label, x }, index) => (
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
        ))}
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

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let i = 0; i <= 3; i++) ticks.push(minY + ((maxY - minY) * i) / 3);
    return ticks;
  }, [maxY, minY]);

  const channelFill = buildBand(data.channelTop, data.channelBot, xPositions, yFn);

  return (
    <Svg width={W} height={H}>
      <Rect x={0} y={0} width={W} height={H} fill={BG} />
      <Rect x={PAD.left} y={PAD.top} width={chartW} height={chartH} fill={PLOT} />

      {yTicks.map((value, index) => (
        <G key={`channel-grid-${index}`}>
          <Line
            x1={PAD.left}
            y1={yFn(value)}
            x2={W - PAD.right}
            y2={yFn(value)}
            stroke={GRID}
            strokeWidth={1}
          />
          <SvgText
            x={W - PAD.right + 2}
            y={yFn(value) + 3}
            fill={AXIS}
            fontSize={9}
            textAnchor="start"
          >
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
        return path ? (
          <Path d={path} stroke="#0071e3" strokeWidth={1.5} fill="none" strokeDasharray="1,3" />
        ) : null;
      })()}
      {(() => {
        const path = buildPath(data.channelMa, xPositions, yFn);
        return path ? (
          <Path d={path} stroke="#5ac8fa" strokeWidth={1} fill="none" strokeDasharray="4,2,1,2" />
        ) : null;
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

      {showXLabel &&
        labels.map(({ label, x }, index) => (
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
        ))}
    </Svg>
  );
}

function SlowCombinedPanel({ activeIndex, data, H, PAD, W, xPositions }: Omit<PanelBaseProps, 'showXLabel'>) {
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const allValues = [
    data.optimistic,
    data.pessimistic,
    data.close as (number | null)[],
    data.channelTop,
    data.channelBot,
  ];
  const { maxY, minY } = useMemo(() => yRange(allValues), [data]);
  const labels = useMemo(() => xLabels(data.dates, data.years, xPositions), [data.dates, data.years, xPositions]);
  const yFn = (value: number) => PAD.top + chartH - ((value - minY) / (maxY - minY)) * chartH;

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let i = 0; i <= 4; i++) ticks.push(minY + ((maxY - minY) * i) / 4);
    return ticks;
  }, [maxY, minY]);

  const allBand = buildBand(data.optimistic, data.pessimistic, xPositions, yFn);
  const channelFill = buildBand(data.channelTop, data.channelBot, xPositions, yFn);

  return (
    <Svg width={W} height={H}>
      <Rect x={0} y={0} width={W} height={H} fill={BG} />
      <Rect x={PAD.left} y={PAD.top} width={chartW} height={chartH} fill={PLOT} />

      {yTicks.map((value, index) => (
        <G key={`slow-grid-${index}`}>
          <Line
            x1={PAD.left}
            y1={yFn(value)}
            x2={W - PAD.right}
            y2={yFn(value)}
            stroke={GRID}
            strokeWidth={1}
          />
          <SvgText
            x={W - PAD.right + 2}
            y={yFn(value) + 3}
            fill={AXIS}
            fontSize={9}
            textAnchor="start"
          >
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
        return path ? (
          <Path d={path} stroke="#0071e3" strokeWidth={1} fill="none" opacity={0.5} strokeDasharray="3,2" />
        ) : null;
      })()}

      {SLOW_LINES.map(({ color, dash, key }) => {
        const path = buildPath(data[key], xPositions, yFn);
        return path ? (
          <Path key={key} d={path} stroke={color} strokeWidth={1.2} fill="none" strokeDasharray={dash} />
        ) : null;
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
  const labels = isFast
    ? ['+2σ 樂觀', '+1σ 壓力', '趨勢線', '-1σ 支撐', '-2σ 悲觀']
    : ['+2σ', '+1σ', '趨勢線', '-1σ', '-2σ'];

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
        <Text style={s.legendText}>收盤</Text>
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
  const screenW = Dimensions.get('window').width;
  const W = screenW - W_PAD;
  const PAD_FAST = { top: 12, right: 46, bottom: 20, left: 4 };
  const PAD_CHANNEL = { top: 8, right: 46, bottom: 24, left: 4 };
  const PAD_SLOW = { top: 12, right: 46, bottom: 28, left: 4 };
  const isFast = data.years < 1;

  const chartWFast = W - PAD_FAST.left - PAD_FAST.right;
  const chartWSlow = W - PAD_SLOW.left - PAD_SLOW.right;
  const xPositionsFast = useMemo(
    () => createXPositions(data.dates, PAD_FAST.left, chartWFast),
    [chartWFast, data.dates]
  );
  const xPositionsSlow = useMemo(
    () => createXPositions(data.dates, PAD_SLOW.left, chartWSlow),
    [chartWSlow, data.dates]
  );

  const touchXPositions = isFast ? xPositionsFast : xPositionsSlow;
  const selectedIndex = activeIndex ?? data.dates.length - 1;

  const fastTooltipSections = useMemo<TooltipSection[]>(
    () =>
        [
            {
              title: '五線譜',
              items: [
                {
                  color: '#1d1d1f',
                  label: '收盤價',
                  previousValue: data.close[selectedIndex - 1] ?? null,
                  value: data.close[selectedIndex] ?? null,
                },
                {
                  color: '#8e8e93',
                  label: '趨勢線',
                  previousValue: data.trend[selectedIndex - 1] ?? null,
                  value: data.trend[selectedIndex] ?? null,
                },
                {
                  color: '#ff3b30',
                  label: '+2σ 樂觀線',
                  previousValue: data.optimistic[selectedIndex - 1] ?? null,
                  value: data.optimistic[selectedIndex] ?? null,
                },
                {
                  color: '#ff9500',
                  label: '+1σ 壓力線',
                  previousValue: data.resistance[selectedIndex - 1] ?? null,
                  value: data.resistance[selectedIndex] ?? null,
                },
                {
                  color: '#ffcc00',
                  label: '-1σ 支撐線',
                  previousValue: data.support[selectedIndex - 1] ?? null,
                  value: data.support[selectedIndex] ?? null,
                },
                {
                  color: '#34c759',
                  label: '-2σ 悲觀線',
                  previousValue: data.pessimistic[selectedIndex - 1] ?? null,
                  value: data.pessimistic[selectedIndex] ?? null,
                },
              ],
            },
            {
              title: '樂活通道',
              items: [
                {
                  color: '#1d1d1f',
                  label: '收盤價',
                  previousValue: data.close[selectedIndex - 1] ?? null,
                  value: data.close[selectedIndex] ?? null,
                },
                {
                  color: '#0071e3',
                  label: '通道上軌',
                  previousValue: data.channelTop[selectedIndex - 1] ?? null,
                  value: data.channelTop[selectedIndex] ?? null,
                },
                {
                  color: '#0071e3',
                  label: '通道下軌',
                  previousValue: data.channelBot[selectedIndex - 1] ?? null,
                  value: data.channelBot[selectedIndex] ?? null,
                },
                {
                  color: '#5ac8fa',
                  label: '20週均線',
                  previousValue: data.channelMa[selectedIndex - 1] ?? null,
                  value: data.channelMa[selectedIndex] ?? null,
                },
              ].filter(item => item.value != null),
            },
          ],
    [data, selectedIndex]
  );

  const slowTooltipSections = useMemo<TooltipSection[]>(
    () =>
        [
            {
              title: '五線譜',
              items: [
                {
                  color: '#1d1d1f',
                  label: '收盤價',
                  previousValue: data.close[selectedIndex - 1] ?? null,
                  value: data.close[selectedIndex] ?? null,
                },
                {
                  color: '#86868b',
                  label: '趨勢線',
                  previousValue: data.trend[selectedIndex - 1] ?? null,
                  value: data.trend[selectedIndex] ?? null,
                },
                {
                  color: '#d1d1d6',
                  label: '+1σ 壓力線',
                  previousValue: data.resistance[selectedIndex - 1] ?? null,
                  value: data.resistance[selectedIndex] ?? null,
                },
                {
                  color: '#e1e1e6',
                  label: '+2σ 樂觀線',
                  previousValue: data.optimistic[selectedIndex - 1] ?? null,
                  value: data.optimistic[selectedIndex] ?? null,
                },
                {
                  color: '#d1d1d6',
                  label: '-1σ 支撐線',
                  previousValue: data.support[selectedIndex - 1] ?? null,
                  value: data.support[selectedIndex] ?? null,
                },
                {
                  color: '#e1e1e6',
                  label: '-2σ 悲觀線',
                  previousValue: data.pessimistic[selectedIndex - 1] ?? null,
                  value: data.pessimistic[selectedIndex] ?? null,
                },
              ],
            },
            {
              title: '樂活通道',
              items: [
                {
                  color: '#0071e3',
                  label: '通道上軌',
                  previousValue: data.channelTop[selectedIndex - 1] ?? null,
                  value: data.channelTop[selectedIndex] ?? null,
                },
                {
                  color: '#0071e3',
                  label: '通道下軌',
                  previousValue: data.channelBot[selectedIndex - 1] ?? null,
                  value: data.channelBot[selectedIndex] ?? null,
                },
                {
                  color: '#5ac8fa',
                  label: '20週均線',
                  previousValue: data.channelMa[selectedIndex - 1] ?? null,
                  value: data.channelMa[selectedIndex] ?? null,
                },
              ].filter(item => item.value != null),
            },
          ],
    [data, selectedIndex]
  );

  const tooltipDate =
    activeIndex == null
      ? `${formatDate(data.dates[selectedIndex])}  最新`
      : formatDate(data.dates[selectedIndex]);
  const updateActiveIndex = (x: number) => setActiveIndex(findNearestIndex(touchXPositions, x));
  const clearActiveIndex = () => setActiveIndex(null);

  if (isFast) {
    const upperHeight = 210;
    const lowerHeight = 150;
    const dividerHeight = 1;
    const chartAreaHeight = upperHeight + dividerHeight + lowerHeight;

    return (
      <View style={s.card}>
        <View style={[s.chartArea, { height: chartAreaHeight }]}>
          <FivePanel
            activeIndex={activeIndex}
            data={data}
            H={upperHeight}
            PAD={PAD_FAST}
            showXLabel={false}
            W={W}
            xPositions={xPositionsFast}
          />
          <View style={s.divider} />
          <ChannelPanel
            activeIndex={activeIndex}
            data={data}
            H={lowerHeight}
            PAD={PAD_CHANNEL}
            showXLabel
            W={W}
            xPositions={xPositionsFast}
          />

          <TouchOverlay height={chartAreaHeight} onClear={clearActiveIndex} onTouch={updateActiveIndex} />
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
        <SlowCombinedPanel
          activeIndex={activeIndex}
          data={data}
          H={slowHeight}
          PAD={PAD_SLOW}
          W={W}
          xPositions={xPositionsSlow}
        />

        <TouchOverlay height={slowHeight} onClear={clearActiveIndex} onTouch={updateActiveIndex} />
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
  tooltipSectionTitle: { color: '#555', fontSize: 10, fontWeight: '700', marginBottom: 5, textTransform: 'uppercase' },
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
