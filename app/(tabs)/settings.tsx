import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { useWatchlist } from '../../src/store/watchlist';

export default function SettingsScreen() {
  const { items, remove } = useWatchlist();

  function clearAll() {
    Alert.alert(
      '清空最愛清單',
      '確定要移除全部股票？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '確定清空',
          style: 'destructive',
          onPress: () => items.forEach(i => remove(i.symbol)),
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      <Text style={styles.section}>關於</Text>
      <View style={styles.card}>
        <InfoRow label="版本" value="1.0.0" />
        <InfoRow label="資料來源" value="Yahoo Finance / TWSE / CNN" />
        <InfoRow label="演算法" value="樂活五線譜 (MA ± 2σ)" />
      </View>

      <Text style={styles.section}>說明</Text>
      <View style={styles.card}>
        <Text style={styles.desc}>
          <Text style={styles.bold}>五線譜訊號說明{'\n'}</Text>
          {signalRows.map(r => `${r.label}：${r.desc}\n`).join('')}
        </Text>
        <Text style={[styles.desc, { marginTop: 12 }]}>
          <Text style={styles.bold}>三時間軸{'\n'}</Text>
          3M 短線（3個月）、6M 中線（6個月）、3Y 長線（3.5年）{'\n'}
          同步出現 buy1/buy2 訊號時強度最高
        </Text>
      </View>

      <Text style={styles.section}>資料管理</Text>
      <TouchableOpacity style={styles.dangerBtn} onPress={clearAll}>
        <Text style={styles.dangerText}>清空最愛清單 ({items.length} 支)</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>
        樂活五線譜 Android App{'\n'}
        資料僅供參考，不構成投資建議
      </Text>
    </ScrollView>
  );
}

const signalRows = [
  { label: '強力買進', desc: '低於 -2σ，超跌區' },
  { label: '偏低買進', desc: '低於 -1σ，偏低區' },
  { label: '合理持有', desc: '介於 ±1σ，合理區' },
  { label: '偏高觀望', desc: '高於 +1σ，偏高區' },
  { label: '強力賣出', desc: '高於 +2σ，超漲區' },
];

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#0d1117' },
  content: { paddingBottom: 40 },
  section: { color: '#8b949e', fontSize: 12, fontWeight: '600', marginHorizontal: 16, marginTop: 24, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 },
  card: { backgroundColor: '#161b22', marginHorizontal: 16, borderRadius: 10, padding: 14 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#21262d' },
  infoLabel: { color: '#8b949e', fontSize: 14 },
  infoValue: { color: '#e6edf3', fontSize: 14, fontWeight: '500' },
  desc: { color: '#c9d1d9', fontSize: 13, lineHeight: 22 },
  bold: { fontWeight: '700', color: '#e6edf3' },
  dangerBtn: { backgroundColor: '#6e1a1a', marginHorizontal: 16, borderRadius: 10, padding: 14, alignItems: 'center' },
  dangerText: { color: '#ff7b72', fontSize: 15, fontWeight: '600' },
  footer: { color: '#8b949e', fontSize: 12, textAlign: 'center', marginTop: 32, lineHeight: 20 },
});
