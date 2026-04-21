import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import Svg, { Circle, Path, Line, Text as SvgText } from 'react-native-svg';
import { FearGreedData, ratingColor, ratingLabel } from '../api/cnn';

interface Props {
  data: FearGreedData;
  onPressHistory?: () => void;
}

function scoreToAngle(score: number): number {
  return 180 - (Math.max(0, Math.min(100, score)) / 100) * 180;
}

function toXY(cx: number, cy: number, angleDeg: number, r: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
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
  const points: { x: number; y: number }[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = startAngle + (endAngle - startAngle) * t;
    points.push(toXY(cx, cy, angle, radius));
  }

  return points;
}

function linePath(points: { x: number; y: number }[]): string {
  return points
    .map((point, index) =>
      `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`
    )
    .join(' ');
}

function bandPath(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startScore: number,
  endScore: number
): string {
  const outer = buildArcPoints(cx, cy, outerRadius, startScore, endScore);
  const inner = buildArcPoints(cx, cy, innerRadius, endScore, startScore);
  return `${linePath(outer)} ${linePath(inner).replace(/^M /, 'L ')} Z`;
}

const SEGMENTS = [
  { from: 0, to: 25, color: '#ef4444' },
  { from: 25, to: 45, color: '#facc15' },
  { from: 45, to: 55, color: '#7dd3fc' },
  { from: 55, to: 75, color: '#86efac' },
  { from: 75, to: 100, color: '#166534' },
];

const TICK_SCORES = [0, 20, 40, 60, 80, 100];

export function FearGreedGauge({ data, onPressHistory }: Props) {
  const screenW = Dimensions.get('window').width;
  const W = Math.min(screenW - 32, 360);
  const H = Math.round(W * 0.68);
  const CX = W / 2;
  const CY = H - 12;
  const outerRadius = Math.min(W * 0.44, 154);
  const innerRadius = outerRadius - 28;
  const progressRadius = outerRadius - 13;
  const angle = scoreToAngle(data.score);
  const thresholdOuter = toXY(CX, CY, angle, outerRadius + 2);
  const thresholdInner = toXY(CX, CY, angle, innerRadius - 4);
  const needleHead = toXY(CX, CY, angle, progressRadius + 3);
  const needleTail = toXY(CX, CY, angle + 180, 18);
  const progressPath = linePath(buildArcPoints(CX, CY, progressRadius, 0, data.score, 40));
  const scoreText =
    Number.isInteger(data.score) ? String(data.score) : data.score.toFixed(1);

  return (
    <View style={styles.card}>
      <Text style={styles.subTitle}>市場情緒 (Fear & Greed)</Text>

      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <SvgText
          x={CX}
          y={28}
          textAnchor="middle"
          fill="#e6edf3"
          fontSize={22}
          fontWeight="700"
        >
          {ratingLabel(data.rating)}
        </SvgText>

        {SEGMENTS.map((seg, i) => (
          <Path
            key={i}
            d={bandPath(CX, CY, innerRadius, outerRadius, seg.from, seg.to)}
            fill={seg.color}
          />
        ))}

        {TICK_SCORES.map(s => {
          const p = toXY(CX, CY, scoreToAngle(s), outerRadius + 18);
          return (
            <SvgText
              key={s}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              fill="#8b949e"
              fontSize={11}
            >
              {s}
            </SvgText>
          );
        })}

        <Path
          d={progressPath}
          stroke="#1d1d1f"
          strokeWidth={10}
          fill="none"
          strokeLinecap="butt"
        />
        <Line
          x1={needleTail.x}
          y1={needleTail.y}
          x2={needleHead.x}
          y2={needleHead.y}
          stroke="#f3f4f6"
          strokeWidth={3}
          strokeLinecap="round"
        />
        <Circle cx={CX} cy={CY} r={7} fill="#f3f4f6" />
        <Line
          x1={thresholdInner.x}
          y1={thresholdInner.y}
          x2={thresholdOuter.x}
          y2={thresholdOuter.y}
          stroke="#1d1d1f"
          strokeWidth={4}
        />

        <SvgText
          x={CX}
          y={CY - 66}
          textAnchor="middle"
          fill="#e6edf3"
          fontSize={48}
          fontWeight="400"
        >
          {scoreText}
        </SvgText>

        <SvgText
          x={CX}
          y={CY - 24}
          textAnchor="middle"
          fill={ratingColor(data.score)}
          fontSize={15}
          fontWeight="700"
        >
          {ratingLabel(data.rating)}
        </SvgText>
      </Svg>

      <View style={styles.compRow}>
        <CompCell label="前日收盤" value={data.previousClose} />
        <CompCell label="一週前"   value={data.previousWeek}  />
        <CompCell label="一個月前" value={data.previousMonth} />
        <CompCell label="一年前"   value={data.previousYear}  />
      </View>

      {onPressHistory && (
        <TouchableOpacity style={styles.histBtn} onPress={onPressHistory} activeOpacity={0.7}>
          <Text style={styles.histBtnText}>📈 歷史走勢</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function CompCell({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={[styles.cellValue, { color: ratingColor(value) }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#161b22',
    borderRadius: 14,
    marginHorizontal: 16,
    marginVertical: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  subTitle:    { color: '#8b949e', fontSize: 13, marginBottom: 6 },
  compRow:     { flexDirection: 'row', gap: 12, marginBottom: 12 },
  cell:        { alignItems: 'center', minWidth: 64 },
  cellLabel:   { color: '#8b949e', fontSize: 11 },
  cellValue:   { fontSize: 15, fontWeight: '600' },
  histBtn:     {
    backgroundColor: '#21262d', paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: '#30363d',
  },
  histBtnText: { color: '#58a6ff', fontSize: 13, fontWeight: '600' },
});
