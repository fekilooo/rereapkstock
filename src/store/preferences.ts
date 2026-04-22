import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const STORAGE_KEY = '@lohas_preferences';

interface PreferencesState {
  loaded: boolean;
  showHomeActionButtons: boolean;
  load: () => Promise<void>;
  setShowHomeActionButtons: (value: boolean) => Promise<void>;
}

export const usePreferences = create<PreferencesState>((set, get) => ({
  loaded: false,
  showHomeActionButtons: true,

  load: async () => {
    if (get().loaded) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      set({
        loaded: true,
        showHomeActionButtons:
          typeof parsed.showHomeActionButtons === 'boolean' ? parsed.showHomeActionButtons : true,
      });
    } catch {
      set({ loaded: true, showHomeActionButtons: true });
    }
  },

  setShowHomeActionButtons: async value => {
    set({ showHomeActionButtons: value });
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        showHomeActionButtons: value,
      })
    );
  },
}));
