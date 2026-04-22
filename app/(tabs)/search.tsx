import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { searchSymbol, fetchQuote, StockInfo } from '../../src/api/yahoo';
import { useWatchlist } from '../../src/store/watchlist';
import { debounce } from 'lodash';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const { add, remove, has } = useWatchlist();

  const doSearch = useCallback(
    debounce(async (q: string) => {
      if (q.trim().length < 1) { setResults([]); return; }
      setLoading(true);
      try {
        const res = await searchSymbol(q.trim());
        setResults(res);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 600),
    []
  );

  async function handleAdd(item: StockInfo) {
    if (has(item.symbol)) {
      Alert.alert('移除確認', `確定要從觀察清單移除 ${item.shortName}？`, [
        { text: '取消', style: 'cancel' },
        { text: '移除', style: 'destructive', onPress: () => remove(item.symbol) },
      ]);
      return;
    }
    await add(item.symbol, item.shortName);
    Alert.alert('已加入', `${item.shortName} 已加入觀察清單`);
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          placeholder="輸入股票代號或名稱 (e.g. 2330, AAPL)"
          placeholderTextColor="#8b949e"
          value={query}
          onChangeText={t => { setQuery(t); doSearch(t); }}
          autoCapitalize="characters"
          returnKeyType="search"
          onSubmitEditing={() => doSearch(query)}
          clearButtonMode="while-editing"
        />
        {loading && <ActivityIndicator color="#58a6ff" style={styles.spin} />}
      </View>

      <Text style={styles.hint}>
        台股輸入 4 位代號（如 2330），美股輸入英文代號（如 AAPL）
      </Text>

      <FlatList
        data={results}
        keyExtractor={i => i.symbol}
        renderItem={({ item }) => (
          <SearchResultRow item={item} inWatchlist={has(item.symbol)} onPress={() => handleAdd(item)} />
        )}
        ListEmptyComponent={
          query.length > 0 && !loading
            ? <Text style={styles.empty}>找不到結果</Text>
            : null
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

function SearchResultRow({
  item,
  inWatchlist,
  onPress,
}: {
  item: StockInfo;
  inWatchlist: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowSymbol}>{item.symbol}</Text>
        <Text style={styles.rowName} numberOfLines={1}>{item.shortName}</Text>
      </View>
      <View style={[styles.addBtn, inWatchlist && styles.removeBtn]}>
        <Text style={styles.addBtnText}>{inWatchlist ? '✓ 已加入' : '+ 加入觀察'}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    backgroundColor: '#161b22',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#30363d',
    paddingHorizontal: 14,
  },
  input: { flex: 1, color: '#e6edf3', fontSize: 15, paddingVertical: 12 },
  spin: { marginLeft: 8 },
  hint: { color: '#8b949e', fontSize: 12, marginHorizontal: 16, marginBottom: 8 },
  list: { paddingBottom: 24 },
  empty: { color: '#8b949e', textAlign: 'center', marginTop: 40, fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161b22',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rowLeft: { flex: 1 },
  rowSymbol: { color: '#e6edf3', fontSize: 15, fontWeight: '700' },
  rowName: { color: '#8b949e', fontSize: 12, marginTop: 2 },
  addBtn: {
    backgroundColor: '#1f6feb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  removeBtn: { backgroundColor: '#30363d' },
  addBtnText: { color: '#e6edf3', fontSize: 13, fontWeight: '600' },
});
