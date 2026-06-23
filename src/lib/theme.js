export const THEME_STORAGE_KEY = 'scrappy-theme';

export const THEMES = {
  DARK: 'dark',
  LIGHT: 'light',
};

export function getSystemTheme() {
  if (typeof window === 'undefined') {
    return THEMES.DARK;
  }

  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? THEMES.LIGHT
    : THEMES.DARK;
}

export function getStoredTheme() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === THEMES.LIGHT || stored === THEMES.DARK ? stored : null;
  } catch {
    return null;
  }
}

export function resolveTheme() {
  return getStoredTheme() || getSystemTheme();
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.setAttribute('data-theme', theme);
}

export function storeTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // localStorage unavailable
  }
}
