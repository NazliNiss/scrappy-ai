'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/theme/ThemeProvider';
import { THEMES } from '@/lib/theme';
import styles from './ThemeToggle.module.css';

export default function ThemeToggle({ compact = false, className = '' }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === THEMES.DARK;

  return (
    <button
      type="button"
      className={`${styles.toggle} ${compact ? styles.compact : ''} ${className}`.trim()}
      onClick={toggleTheme}
      aria-label={isDark ? 'Aydınlık moda geç' : 'Karanlık moda geç'}
      title={isDark ? 'Aydınlık mod' : 'Karanlık mod'}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
      <span className={styles.label}>{isDark ? 'Aydınlık' : 'Karanlık'}</span>
    </button>
  );
}
