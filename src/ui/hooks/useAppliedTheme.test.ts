import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Preferences } from '../../domain/types';
import { useAppliedTheme } from './useAppliedTheme';

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe('useAppliedTheme', () => {
  it('pose data-theme sur <html> pour un choix explicite', () => {
    renderHook(() => useAppliedTheme('dark'));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it("retire data-theme pour 'auto'", () => {
    document.documentElement.dataset.theme = 'light';
    renderHook(() => useAppliedTheme('auto'));
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('met a jour data-theme quand le choix change', () => {
    const { rerender } = renderHook(
      ({ theme }: { theme: Preferences['theme'] }) => useAppliedTheme(theme),
      { initialProps: { theme: 'light' } },
    );
    expect(document.documentElement.dataset.theme).toBe('light');
    rerender({ theme: 'dark' });
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
