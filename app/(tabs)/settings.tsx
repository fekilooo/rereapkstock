import React, { useEffect } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useWatchlist } from '../../src/store/watchlist';
import { usePreferences } from '../../src/store/preferences';

const signalRows = [
  { label: '強勢續漲', desc: '位於 -2σ 下方後回升' },
  { label: '相對樂觀', desc: '位於 -1σ 到趨勢線之間' },
  { label: '正常區間', desc: '接近趨勢線附近' },
  { label: '相對貪婪', desc: '位於趨勢線到 +1σ 之間' },
  { label: '極度貪婪', desc: '位於 +2σ 上方' },
];

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const { items, remove } = useWatchlist();
  const { loaded, load, setShowHomeActionButtons, showHomeActionButtons } = usePreferences();

  useEffect(() => {
    if (!loaded) {
      void load();
    }
  }, [loaded, load]);

  function clearAll() {
    Alert.alert('清空觀察清單', '要把目前加入的觀察股票全部刪除嗎？', [
      { text: '取消', style: 'cancel' },
      {
        text: '全部刪除',
        style: 'destructive',
        onPress: () => {
          items.forEach(item => {
            void remove(item.symbol);
          });
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      <Text style={styles.section}>資訊</Text>
      <View style={styles.card}>
        <InfoRow label="版本" value="1.0.0" />
        <InfoRow label="資料來源" value="Yahoo Finance / TWSE / CNN" />
        <InfoRow label="分析模型" value="樂活五線譜 (MA ± 2σ)" />
      </View>

      <Text style={styles.section}>說明</Text>
      <View style={styles.card}>
        <Text style={styles.desc}>
          <Text style={styles.bold}>五線譜訊號{'\n'}</Text>
          {signalRows.map(row => `${row.label}：${row.desc}\n`).join('')}
        </Text>
        <Text style={[styles.desc, styles.descSpacer]}>
          <Text style={styles.bold}>區間定義{'\n'}</Text>
          3M 代表 3 個月，6M 代表 6 個月，3Y 代表 3.5 年。{'\n'}
          訊號會依照 buy1/buy2 等規則顯示不同燈號。
        </Text>
      </View>

      <Text style={styles.section}>資料管理</Text>
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <View style={styles.switchTextWrap}>
            <Text style={styles.switchTitle}>首頁顯示排序 / 刪除按鈕</Text>
            <Text style={styles.switchDesc}>關閉後，首頁會隱藏上移、下移、刪除這些操作按鈕。</Text>
          </View>
          <Switch
            value={showHomeActionButtons}
            onValueChange={value => void setShowHomeActionButtons(value)}
            trackColor={{ false: '#30363d', true: '#2ea043' }}
            thumbColor="#f0f6fc"
          />
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.dangerSection}>
          <Text style={styles.dangerTitle}>清空觀察清單</Text>
          <Text style={styles.dangerDesc}>一次移除目前所有觀察股票，這個動作無法復原。</Text>

          <TouchableOpacity style={styles.dangerBtn} onPress={clearAll}>
            <Text style={styles.dangerText}>清空觀察清單 ({items.length})</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.footer}>
        樂活五線譜 Android App{'\n'}
        提供股票追蹤、五線譜分析與市場情緒觀察
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#0d1117' },
  content: { paddingBottom: 40 },
  section: {
    color: '#8b949e',
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  card: {
    backgroundColor: '#161b22',
    marginHorizontal: 16,
    borderRadius: 10,
    padding: 14,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  switchTextWrap: { flex: 1 },
  switchTitle: { color: '#e6edf3', fontSize: 14, fontWeight: '600' },
  switchDesc: { color: '#8b949e', fontSize: 12, marginTop: 4, lineHeight: 18 },
  cardDivider: {
    height: 1,
    backgroundColor: '#21262d',
    marginTop: 16,
    marginBottom: 18,
  },
  dangerSection: {
    gap: 10,
  },
  dangerTitle: {
    color: '#ffb4a9',
    fontSize: 14,
    fontWeight: '700',
  },
  dangerDesc: {
    color: '#8b949e',
    fontSize: 12,
    lineHeight: 18,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
  },
  infoLabel: { color: '#8b949e', fontSize: 14 },
  infoValue: { color: '#e6edf3', fontSize: 14, fontWeight: '500' },
  desc: { color: '#c9d1d9', fontSize: 13, lineHeight: 22 },
  descSpacer: { marginTop: 12 },
  bold: { fontWeight: '700', color: '#e6edf3' },
  dangerBtn: {
    backgroundColor: '#6e1a1a',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 2,
  },
  dangerText: { color: '#ff7b72', fontSize: 15, fontWeight: '600' },
  footer: { color: '#8b949e', fontSize: 12, textAlign: 'center', marginTop: 32, lineHeight: 20 },
});
