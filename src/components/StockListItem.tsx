import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { WatchItemWithData, useWatchlist } from '../store/watchlist';
import { SignalBadge } from './SignalBadge';
import { Signal } from '../core/fiveLines';

interface Props {
  item: WatchItemWithData;
  index: number;
  total: number;
  showActions: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export function StockListItem({ item, index, total, showActions, onMoveUp, onMoveDown }: Props) {
  const router = useRouter();
  const { remove, moveUp, moveDown } = useWatchlist();
  const changeColor = (item.change ?? 0) >= 0 ? '#43a047' : '#d32f2f';
  const changeStr = item.change != null
    ? `${item.change >= 0 ? '+' : ''}${item.change.toFixed(2)} (${item.changePercent?.toFixed(2)}%)`
    : '---';
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const displaySymbol = item.symbol.replace(/\.(TW|TWO)$/, '');
  const hasName = !!item.name;
  const primarySignal = item.signal3m ?? item.signal6m ?? item.signal3y;

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
        <Text style={styles.symbol} numberOfLines={1}>
          {displaySymbol}
          {hasName ? <Text style={styles.nameInline}>{` ${item.name}`}</Text> : null}
        </Text>

        <View style={styles.detailRow}>
          {item.loading ? (
            <ActivityIndicator size="small" color="#888" />
          ) : (
            <View style={styles.detailContent}>
              <View style={styles.priceWrap}>
                <Text style={styles.price}>{item.price?.toFixed(2) ?? '---'}</Text>
                <Text style={[styles.change, { color: changeColor }]}>{changeStr}</Text>
              </View>

              <View style={styles.signalWrap}>
                {primarySignal ? <SignalBadge signal={primarySignal} small /> : null}
              </View>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {showActions ? (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, isFirst && styles.disabledBtn]}
            onPress={() => (onMoveUp ? onMoveUp() : moveUp(item.symbol))}
            activeOpacity={0.7}
            disabled={isFirst}
          >
            <Text style={[styles.actionBtnText, isFirst && styles.disabledBtnText]}>上移</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, isLast && styles.disabledBtn]}
            onPress={() => (onMoveDown ? onMoveDown() : moveDown(item.symbol))}
            activeOpacity={0.7}
            disabled={isLast}
          >
            <Text style={[styles.actionBtnText, isLast && styles.disabledBtnText]}>下移</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.removeBtn} onPress={confirmRemove} activeOpacity={0.7}>
            <Text style={styles.removeBtnText}>刪除</Text>
          </TouchableOpacity>
        </View>
      ) : null}
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
    gap: 8,
  },
  detailRow: {
    minHeight: 28,
    justifyContent: 'center',
  },
  detailContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  priceWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  signalWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
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
  symbol: { color: '#e6edf3', fontSize: 15, fontWeight: '700' },
  nameInline: { color: '#8b949e', fontSize: 13, fontWeight: '500' },
  price: { color: '#e6edf3', fontSize: 17, fontWeight: '700' },
  change: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
});
