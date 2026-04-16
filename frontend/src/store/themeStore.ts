import { create } from 'zustand';

type ThemeOption = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: ThemeOption;
  setTheme: (value: ThemeOption) => void;
  getEffectiveTheme: () => ThemeOption;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: 'system',
  setTheme: (theme) => set({ theme }),
  getEffectiveTheme: () => {
    if (typeof window === 'undefined') return 'light';
    const stored = window.localStorage.getItem('theme') as ThemeOption | null;
    if (stored) return stored;
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  },
}));
