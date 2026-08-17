import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as install from '../../pwa/install';
import { useServiceWorkerUpdate } from './useServiceWorkerUpdate';

vi.mock('../../pwa/install', () => ({
  registerServiceWorker: vi.fn(),
  activatePendingUpdate: vi.fn(),
}));

describe('useServiceWorkerUpdate', () => {
  it("enregistre le service worker et passe a jour disponible quand le callback s'execute", () => {
    let onUpdateAvailable: (() => void) | undefined;
    vi.mocked(install.registerServiceWorker).mockImplementation((cb) => {
      onUpdateAvailable = cb;
    });

    const { result } = renderHook(() => useServiceWorkerUpdate());
    expect(result.current.updateAvailable).toBe(false);

    act(() => onUpdateAvailable?.());
    expect(result.current.updateAvailable).toBe(true);
  });

  it('applyUpdate delegue a activatePendingUpdate', () => {
    vi.mocked(install.registerServiceWorker).mockImplementation(() => {});
    const { result } = renderHook(() => useServiceWorkerUpdate());

    result.current.applyUpdate();
    expect(install.activatePendingUpdate).toHaveBeenCalledOnce();
  });
});
