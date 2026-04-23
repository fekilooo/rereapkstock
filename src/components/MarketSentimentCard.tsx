import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';
import { ratingColor, ratingLabel } from '../api/cnn';

type Props = {
  title: string;
  score?: number | null;
  rating?: string | null;
  updatedLabel?: string;
  loading?: boolean;
  error?: string;
  onPress?: () => void;
};

function scoreToAngle(score: number): number {
  return 180 - (Math.max(0, Math.min(100, score)) / 100) * 180;
}

function toXY(cx: number, cy: number, angleDeg: number, radius: number) {
  const angle = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy - radius * Math.sin(angle),
  };
}

function buildArcPoints(
  cx: number,
  cy: number,
  radius: number,
  startScore: number,
  endScore: number,
  steps = 24
) {
  const startAngle = scoreToAngle(startScore);
  const endAngle = scoreToAngle(endScore);
  const points: Array<{ x: number; y: number }> = [];

  for (let i = 0; i <= steps; i += 1) {
    const ratio = i / steps;
    const angle = startAngle + (endAngle - startAngle) * ratio;
    points.push(toXY(cx, cy, angle, radius));
  }

  return points;
}

function linePath(points: Array<{ x: number; y: number }>) {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
}

function bandPath(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startScore: number,
  endScore: number
) {
  const outer = buildArcPoints(cx, cy, outerRadius, startScore, endScore);
  const inner = buildArcPoints(cx, cy, innerRadius, endScore, startScore);
  return `${linePath(outer)} ${linePath(inner).replace(/^M /, 'L ')} Z`;
}

const SEGMENTS = [
  { from: 0, to: 25, color: '#ef4444' },
  { from: 25, to: 45, color: '#f59e0b' },
  { from: 45, to: 55, color: '#7dd3fc' },
  { from: 55, to: 75, color: '#86efac' },
  { from: 75, to: 100, color: '#166534' },
];

const TICKS = [0, 50, 100];

export function MarketSentimentCard({
  title,
  score,
  rating,
  updatedLabel,
  loading = false,
  error = '',
  onPress,
}: Props) {
  const hasValue = Number.isFinite(score);
  const safeScore = hasValue ? Math.round(score as number) : 0;
  const width = 154;
  const height = 108;
  const cx = width / 2;
  const cy = 90;
  const outerRadius = 50;
  const innerRadius = 36;
  const progressRadius = 43;
  const angle = scoreToAngle(safeScore);
  const thresholdOuter = toXY(cx, cy, angle, outerRadius + 2);
  const thresholdInner = toXY(cx, cy, angle, innerRadius - 2);
  const progressPath = linePath(buildArcPoints(cx, cy, progressRadius, 0, safeScore, 32));

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      disabled={!onPress}
      onPress={onPress}
      style={styles.card}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.link}>1Y</Text>
      </View>

      <Svg height={height} viewBox={`0 0 ${width} ${height}`} width="100%">
        {SEGMENTS.map(segment => (
          <Path
            key={`${segment.from}-${segment.to}`}
            d={bandPath(cx, cy, innerRadius, outerRadius, segment.from, segment.to)}
            fill={segment.color}
          />
        ))}

        {TICKS.map(tick => {
          const point = toXY(cx, cy, scoreToAngle(tick), outerRadius + 12);
          return (
            <SvgText
              key={tick}
              fill="#8b949e"
              fontSize={9}
              textAnchor="middle"
              x={point.x}
              y={point.y}
            >
              {tick}
            </SvgText>
          );
        })}

        {hasValue ? (
          <>
            <Path
              d={progressPath}
              fill="none"
              stroke="#0d1117"
              strokeLinecap="butt"
              strokeWidth={8}
            />
            <Line
              stroke="#0d1117"
              strokeWidth={3}
              x1={thresholdInner.x}
              x2={thresholdOuter.x}
              y1={thresholdInner.y}
              y2={thresholdOuter.y}
            />
          </>
        ) : null}

        <SvgText
          fill="#e6edf3"
          fontSize={26}
          fontWeight="700"
          textAnchor="middle"
          x={cx}
          y={94}
        >
          {loading ? '--' : hasValue ? safeScore : '--'}
        </SvgText>

        <SvgText
          fill={hasValue ? ratingColor(safeScore) : '#8b949e'}
          fontSize={10}
          fontWeight="700"
          textAnchor="middle"
          x={cx}
          y={106}
        >
          {loading ? 'Loading' : rating ? ratingLabel(rating) : error ? 'Unavailable' : '--'}
        </SvgText>
      </Svg>

      <Text numberOfLines={1} style={styles.updatedText}>
        {error ? '資料暫時無法載入' : updatedLabel ?? 'Tap to view history'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#21262d',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    minHeight: 180,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  title: {
    color: '#e6edf3',
    fontSize: 15,
    fontWeight: '700',
  },
  link: {
    color: '#58a6ff',
    fontSize: 11,
    fontWeight: '700',
  },
  updatedText: {
    color: '#8b949e',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 2,
  },
});
