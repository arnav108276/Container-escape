import { create } from 'zustand';

type ThemeOption = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: ThemeOption;
  setTheme: (value: ThemeOption) => void;
  getEffectiveTheme: () => ThemeOption;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'dark',
  setTheme: (theme) => {
    // No-op to lock theme to dark
  },
  getEffectiveTheme: () => 'dark',
}));
