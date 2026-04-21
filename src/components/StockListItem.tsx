import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { WatchItemWithData, useWatchlist } from '../store/watchlist';
import { SignalBadge } from './SignalBadge';
import { Signal, SIGNAL_COLORS } from '../core/fiveLines';

interface Props {
  item: WatchItemWithData;
  index: number;
  total: number;
}

function SignalDot({ signal }: { signal?: Signal }) {
  if (!signal) return <View style={[styles.dot, { backgroundColor: '#444' }]} />;
  return <View style={[styles.dot, { backgroundColor: SIGNAL_COLORS[signal] }]} />;
}

export function StockListItem({ item, index, total }: Props) {
  const router = useRouter();
  const { remove, moveUp, moveDown } = useWatchlist();
  const changeColor = (item.change ?? 0) >= 0 ? '#43a047' : '#d32f2f';
  const changeStr = item.change != null
    ? `${item.change >= 0 ? '+' : ''}${item.change.toFixed(2)} (${item.changePercent?.toFixed(2)}%)`
    : '---';
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const displaySymbol = item.symbol.replace(/\.(TW|TWO)$/, '');
  const isTaiwanStock = /\.(TW|TWO)$/.test(item.symbol);
  const titleText = isTaiwanStock && item.name ? `${displaySymbol}${item.name}` : displaySymbol;

  function confirmRemove() {
    Alert.alert(
      '刪除最愛',
      `要刪除 ${item.name} 嗎？`,
      [
        { text: '取消', style: 'cancel' },
        { text: '刪除', style: 'destructive', onPress: () => remove(item.symbol) },
      ]
    );
  }

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.mainTap}
        onPress={() => router.push(`/stock/${encodeURIComponent(item.symbol)}`)}
        activeOpacity={0.7}
      >
        <View style={styles.left}>
          <Text style={styles.symbol} numberOfLines={1}>{titleText}</Text>
          {!isTaiwanStock && !!item.name && (
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          )}
        </View>

        <View style={styles.middle}>
          {item.loading ? (
            <ActivityIndicator size="small" color="#888" />
          ) : (
            <>
              <Text style={styles.price}>{item.price?.toFixed(2) ?? '---'}</Text>
              <Text style={[styles.change, { color: changeColor }]}>{changeStr}</Text>
            </>
          )}
        </View>

        <View style={styles.signals}>
          {item.signal3m && <SignalBadge signal={item.signal3m} small />}
          <View style={styles.timeAxis}>
            <SignalDot signal={item.signal3m} />
            <SignalDot signal={item.signal6m} />
            <SignalDot signal={item.signal3y} />
          </View>
          <Text style={styles.axisLabel}>3M 6M 3Y</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, isFirst && styles.disabledBtn]}
          onPress={() => moveUp(item.symbol)}
          activeOpacity={0.7}
          disabled={isFirst}
        >
          <Text style={[styles.actionBtnText, isFirst && styles.disabledBtnText]}>上移</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, isLast && styles.disabledBtn]}
          onPress={() => moveDown(item.symbol)}
          activeOpacity={0.7}
          disabled={isLast}
        >
          <Text style={[styles.actionBtnText, isLast && styles.disabledBtnText]}>下移</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.removeBtn} onPress={confirmRemove} activeOpacity={0.7}>
          <Text style={styles.removeBtnText}>刪除</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: '#161b22',
    borderRadius: 10,
    marginHorizontal: 16,
    marginVertical: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  mainTap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionRow: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  actionBtn: {
    backgroundColor: '#2d333b',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionBtnText: { color: '#c9d1d9', fontSize: 12, fontWeight: '600' },
  disabledBtn: {
    backgroundColor: '#22272e',
  },
  disabledBtnText: {
    color: '#6e7681',
  },
  removeBtn: {
    backgroundColor: '#2d333b',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  removeBtnText: { color: '#ff7b72', fontSize: 12, fontWeight: '600' },
  left: { flex: 1.2 },
  middle: { flex: 1.5, alignItems: 'flex-end', marginRight: 12 },
  signals: { alignItems: 'center' },
  symbol: { color: '#e6edf3', fontSize: 15, fontWeight: '700' },
  name: { color: '#8b949e', fontSize: 12, marginTop: 2 },
  price: { color: '#e6edf3', fontSize: 15, fontWeight: '600' },
  change: { fontSize: 12, marginTop: 2 },
  timeAxis: { flexDirection: 'row', gap: 4, marginVertical: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  axisLabel: { color: '#8b949e', fontSize: 10 },
});
