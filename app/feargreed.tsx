import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Svg, { Path, Line, Text as SvgText, Rect, G } from 'react-native-svg';
import { ratingColor } from '../src/api/cnn';

export default function FearGreedHistoryScreen() {
  const params = useLocalSearchParams<{ historyJson: string }>();
  const history: { date: number; score: number }[] = useMemo(() => {
    try { return JSON.parse(params.historyJson ?? '[]'); }
    catch { return []; }
  }, [params.historyJson]);

  const screenW = Dimensions.get('window').width;
  const W = screenW - 32;
  const H = 300;
  const PAD = { top: 16, right: 12, bottom: 40, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const n = history.length;
  const xFn = (i: number) => PAD.left + (i / Math.max(n - 1, 1)) * chartW;
  const yFn = (v: number) => PAD.top + chartH - (v / 100) * chartH;

  // Y 軸刻度
  const yTicks = [0, 25, 50, 75, 100];

  // X 軸標籤（每隔 ~2 個月取一個）
  const xLabels = useMemo(() => {
    if (!n) return [];
    const labels: { i: number; label: string }[] = [];
    const step = Math.max(1, Math.floor(n / 6));
    for (let i = 0; i < n; i += step) {
      const dt = new Date(history[i].date);
      labels.push({
        i,
        label: `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, '0')}`,
      });
    }
    if (labels[labels.length - 1]?.i !== n - 1) {
      const dt = new Date(history[n - 1].date);
      labels.push({ i: n - 1, label: `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, '0')}` });
    }
    return labels;
  }, [history]);

  // 走勢線路徑
  const linePath = useMemo(() => {
    let d = '';
    for (let i = 0; i < n; i++) {
      const x = xFn(i).toFixed(1), y = yFn(history[i].score).toFixed(1);
      d += i === 0 ? `M${x},${y}` : ` L${x},${y}`;
    }
    return d;
  }, [history, xFn, yFn]);

  // 面積填色路徑
  const areaPath = n > 0
    ? `${linePath} L${xFn(n - 1).toFixed(1)},${yFn(0).toFixed(1)} L${xFn(0).toFixed(1)},${yFn(0).toFixed(1)} Z`
    : '';

  const latestScore = n > 0 ? history[n - 1].score : 0;

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      {/* 標題 */}
      <View style={styles.header}>
        <Text style={styles.title}>恐慌貪婪指數｜歷史走勢</Text>
        <Text style={styles.subtitle}>近一年資料（{n} 個交易日）</Text>
      </View>

      {n === 0 ? (
        <Text style={styles.noData}>歷史資料不足</Text>
      ) : (
        <View style={styles.chartCard}>
          <Svg width={W} height={H}>
            <Rect x={0} y={0} width={W} height={H} fill="#161b22" rx={10} />

            {/* Y 格線 + 標籤 */}
            {yTicks.map(v => (
              <G key={v}>
                <Line
                  x1={PAD.left} y1={yFn(v)}
                  x2={W - PAD.right} y2={yFn(v)}
                  stroke={v === 25 || v === 75 ? 'rgba(255,255,255,0.1)' : '#21262d'}
                  strokeWidth={1}
                  strokeDasharray={v === 25 || v === 75 ? '3,2' : undefined}
                />
                <SvgText x={PAD.left - 4} y={yFn(v) + 4}
                  textAnchor="end" fill="#8b949e" fontSize={10}>
                  {v}
                </SvgText>
              </G>
            ))}

            {/* 極度恐慌線 (25) — 紅色虛線 */}
            <Line
              x1={PAD.left} y1={yFn(25)} x2={W - PAD.right} y2={yFn(25)}
              stroke="#d32f2f" strokeWidth={1} strokeDasharray="4,3" opacity={0.7}
            />
            <SvgText x={W - PAD.right + 2} y={yFn(25) + 3} fill="#d32f2f" fontSize={9}>
              極度恐慌
            </SvgText>

            {/* 極度貪婪線 (75) — 綠色虛線 */}
            <Line
              x1={PAD.left} y1={yFn(75)} x2={W - PAD.right} y2={yFn(75)}
              stroke="#43a047" strokeWidth={1} strokeDasharray="4,3" opacity={0.7}
            />
            <SvgText x={W - PAD.right + 2} y={yFn(75) + 3} fill="#43a047" fontSize={9}>
              極度貪婪
            </SvgText>

            {/* 面積填色 */}
            {areaPath ? (
              <Path d={areaPath} fill="rgba(88,166,255,0.08)" stroke="none" />
            ) : null}

            {/* 走勢線 */}
            {linePath ? (
              <Path d={linePath} stroke="#58a6ff" strokeWidth={2} fill="none" />
            ) : null}

            {/* X 軸標籤 */}
            {xLabels.map(({ i, label }, k) => (
              <SvgText key={k}
                x={xFn(i)} y={H - 8}
                textAnchor={k === 0 ? 'start' : k === xLabels.length - 1 ? 'end' : 'middle'}
                fill="#8b949e" fontSize={10}>
                {label}
              </SvgText>
            ))}
          </Svg>
        </View>
      )}

      {/* 當前值卡片 */}
      <View style={styles.currentCard}>
        <Text style={styles.currentLabel}>最新指數</Text>
        <Text style={[styles.currentScore, { color: ratingColor(latestScore) }]}>
          {latestScore}
        </Text>
        {history.length > 0 && (
          <Text style={styles.currentDate}>
            {new Date(history[n - 1].date).toLocaleDateString('zh-TW')}
          </Text>
        )}
      </View>

      {/* 說明卡 */}
      <View style={styles.infoCard}>
        {[
          { range: '0 – 24',  label: '極度恐慌', color: '#d32f2f', desc: '市場極度悲觀，逢低布局機會' },
          { range: '25 – 44', label: '恐慌',     color: '#ff7043', desc: '謹慎偏空，關注支撐' },
          { range: '45 – 55', label: '中性',     color: '#fbc02d', desc: '觀望' },
          { range: '56 – 74', label: '貪婪',     color: '#43a047', desc: '市場樂觀，適度注意風險' },
          { range: '75 – 100',label: '極度貪婪', color: '#1b5e20', desc: '市場過熱，提高警覺' },
        ].map(row => (
          <View key={row.label} style={styles.infoRow}>
            <Text style={[styles.infoRange, { color: row.color }]}>{row.range}</Text>
            <Text style={[styles.infoLabel, { color: row.color }]}>{row.label}</Text>
            <Text style={styles.infoDesc}>{row.desc}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg:           { flex: 1, backgroundColor: '#0d1117' },
  content:      { padding: 16, paddingBottom: 40 },
  header:       { marginBottom: 12 },
  title:        { color: '#e6edf3', fontSize: 17, fontWeight: '700' },
  subtitle:     { color: '#8b949e', fontSize: 13, marginTop: 2 },
  noData:       { color: '#8b949e', textAlign: 'center', marginTop: 40 },
  chartCard:    { borderRadius: 10, overflow: 'hidden', marginBottom: 12 },
  currentCard:  {
    backgroundColor: '#161b22', borderRadius: 12, padding: 16,
    alignItems: 'center', marginBottom: 12,
  },
  currentLabel: { color: '#8b949e', fontSize: 13 },
  currentScore: { fontSize: 48, fontWeight: '700', lineHeight: 56 },
  currentDate:  { color: '#8b949e', fontSize: 12 },
  infoCard:     { backgroundColor: '#161b22', borderRadius: 12, padding: 16 },
  infoRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  infoRange:    { width: 60, fontSize: 12, fontWeight: '600' },
  infoLabel:    { width: 56, fontSize: 13, fontWeight: '700' },
  infoDesc:     { flex: 1, color: '#8b949e', fontSize: 12 },
});
