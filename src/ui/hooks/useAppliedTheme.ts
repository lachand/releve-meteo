import { useEffect } from 'react';
import type { Preferences } from '../../domain/types';

/** Applique le theme choisi dans les reglages sur `<html>` (styles/tokens.css). */
export function useAppliedTheme(theme: Preferences['theme']): void {
  useEffect(() => {
    if (theme === 'auto') {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);
}
