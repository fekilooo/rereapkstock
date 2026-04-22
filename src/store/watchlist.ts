import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Signal } from '../core/fiveLines';

const STORAGE_KEY = '@lohas_watchlist';

export interface WatchItem {
  symbol: string;
  name: string;
  addedAt: number;
}

export interface WatchItemWithData extends WatchItem {
  price?: number;
  change?: number;
  changePercent?: number;
  signal3m?: Signal;
  signal6m?: Signal;
  signal3y?: Signal;
  loading?: boolean;
  error?: string;
}

interface WatchlistState {
  items: WatchItemWithData[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (symbol: string, name: string) => Promise<void>;
  remove: (symbol: string) => Promise<void>;
  moveUp: (symbol: string) => Promise<void>;
  moveDown: (symbol: string) => Promise<void>;
  reorder: (symbols: string[]) => Promise<void>;
  updateData: (symbol: string, data: Partial<WatchItemWithData>) => void;
  has: (symbol: string) => boolean;
}

function persistItems(items: WatchItemWithData[]) {
  return AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(items.map(({ symbol, name, addedAt }) => ({ symbol, name, addedAt })))
  );
}

export const useWatchlist = create<WatchlistState>((set, get) => ({
  items: [],
  loaded: false,

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const items: WatchItem[] = raw ? JSON.parse(raw) : [];
      set({ items: items.map(i => ({ ...i, loading: false })), loaded: true });
    } catch {
      set({ items: [], loaded: true });
    }
  },

  add: async (symbol, name) => {
    const { items } = get();
    if (items.some(i => i.symbol === symbol)) return;
    const next: WatchItemWithData[] = [
      ...items,
      { symbol, name, addedAt: Date.now(), loading: true },
    ];
    set({ items: next });
    await persistItems(next);
  },

  remove: async (symbol) => {
    const next = get().items.filter(i => i.symbol !== symbol);
    set({ items: next });
    await persistItems(next);
  },

  moveUp: async (symbol) => {
    const items = [...get().items];
    const index = items.findIndex(i => i.symbol === symbol);
    if (index <= 0) return;
    [items[index - 1], items[index]] = [items[index], items[index - 1]];
    set({ items });
    await persistItems(items);
  },

  moveDown: async (symbol) => {
    const items = [...get().items];
    const index = items.findIndex(i => i.symbol === symbol);
    if (index === -1 || index >= items.length - 1) return;
    [items[index], items[index + 1]] = [items[index + 1], items[index]];
    set({ items });
    await persistItems(items);
  },

  reorder: async (symbols) => {
    const current = get().items;
    const lookup = new Map(current.map(item => [item.symbol, item]));
    const next = symbols
      .map(symbol => lookup.get(symbol))
      .filter((item): item is WatchItemWithData => !!item);

    if (next.length !== current.length) return;

    set({ items: next });
    await persistItems(next);
  },

  updateData: (symbol, data) => {
    let nextItems: WatchItemWithData[] = [];
    set(state => {
      nextItems = state.items.map(i => i.symbol === symbol ? { ...i, ...data, loading: false } : i);
      return { items: nextItems };
    });
    if (data.name !== undefined) {
      void persistItems(nextItems);
    }
  },

  has: (symbol) => get().items.some(i => i.symbol === symbol),
}));
