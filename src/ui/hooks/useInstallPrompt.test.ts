import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as install from '../../pwa/install';
import { useInstallPrompt } from './useInstallPrompt';

vi.mock('../../pwa/install', () => ({
  watchInstallPrompt: vi.fn(),
  promptInstall: vi.fn(),
}));

describe('useInstallPrompt', () => {
  it('suit la disponibilite exposee par watchInstallPrompt', () => {
    let onAvailabilityChange: ((available: boolean) => void) | undefined;
    const unwatch = vi.fn();
    vi.mocked(install.watchInstallPrompt).mockImplementation((cb) => {
      onAvailabilityChange = cb;
      return unwatch;
    });

    const { result, unmount } = renderHook(() => useInstallPrompt());
    expect(result.current.available).toBe(false);

    act(() => onAvailabilityChange?.(true));
    expect(result.current.available).toBe(true);

    unmount();
    expect(unwatch).toHaveBeenCalledOnce();
  });

  it('promptInstall delegue au module pwa/install', async () => {
    vi.mocked(install.watchInstallPrompt).mockReturnValue(() => {});
    vi.mocked(install.promptInstall).mockResolvedValue(true);
    const { result } = renderHook(() => useInstallPrompt());

    await expect(result.current.promptInstall()).resolves.toBe(true);
  });
});
