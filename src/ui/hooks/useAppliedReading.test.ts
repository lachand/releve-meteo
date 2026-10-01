import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useAppliedReading } from './useAppliedReading';

afterEach(() => {
  delete document.documentElement.dataset.lecture;
});

describe('useAppliedReading', () => {
  it('pose data-lecture sur <html> en lecture rapide, et le retire sinon', () => {
    const { rerender, unmount } = renderHook(({ quick }) => useAppliedReading(quick), {
      initialProps: { quick: true },
    });
    expect(document.documentElement.dataset.lecture).toBe('rapide');
    rerender({ quick: false });
    expect(document.documentElement.dataset.lecture).toBeUndefined();
    rerender({ quick: true });
    unmount();
    expect(document.documentElement.dataset.lecture).toBeUndefined();
  });
});
