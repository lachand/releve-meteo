import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as db from '../../data/cache/db';
import { defaultPreferences, resetMemoryPreferencesForTests } from '../../data/cache/preferences';
import type { Place } from '../../domain/types';
import * as storage from '../../pwa/storage';
import { usePreferences } from './usePreferences';

vi.mock('../../data/cache/db', () => ({
  clearAllLocalData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../pwa/storage', () => ({
  requestPersistentStorageOnce: vi.fn().mockResolvedValue(undefined),
}));

const virieu: Place = {
  id: '45.4840:5.4759',
  name: 'Virieu',
  latitude: 45.484,
  longitude: 5.4759,
  elevation: 415,
  admin: 'Isère',
  alias: null,
};

const golfeDuMorbihan: Place = {
  id: '47.5700:-2.8000',
  name: 'Golfe du Morbihan',
  latitude: 47.57,
  longitude: -2.8,
  elevation: 5,
  admin: 'Morbihan',
  alias: null,
};

beforeEach(() => {
  localStorage.clear();
  resetMemoryPreferencesForTests();
  vi.mocked(storage.requestPersistentStorageOnce).mockClear();
  vi.mocked(db.clearAllLocalData).mockClear();
});

describe('usePreferences', () => {
  it('demarre avec les preferences par defaut', () => {
    const { result } = renderHook(() => usePreferences());
    expect(result.current.preferences).toEqual(defaultPreferences());
  });

  it('ajoute un favori, le persiste et demande le stockage persistant une seule fois', () => {
    const { result } = renderHook(() => usePreferences());

    act(() => result.current.addFavourite(virieu));
    expect(result.current.preferences.favourites).toEqual([virieu]);
    expect(storage.requestPersistentStorageOnce).toHaveBeenCalledOnce();

    act(() => result.current.addFavourite(golfeDuMorbihan));
    expect(result.current.preferences.favourites).toEqual([virieu, golfeDuMorbihan]);
    expect(storage.requestPersistentStorageOnce).toHaveBeenCalledOnce();
  });

  it('reordonne et persiste le nouvel ordre', () => {
    const { result } = renderHook(() => usePreferences());
    act(() => result.current.addFavourite(virieu));
    act(() => result.current.addFavourite(golfeDuMorbihan));

    act(() => result.current.reorderFavourites([golfeDuMorbihan.id, virieu.id]));
    expect(result.current.preferences.favourites).toEqual([golfeDuMorbihan, virieu]);

    // Un nouveau montage relit depuis le stockage : verifie la persistance reelle.
    const { result: reloaded } = renderHook(() => usePreferences());
    expect(reloaded.current.preferences.favourites).toEqual([golfeDuMorbihan, virieu]);
  });

  it('retire un favori', () => {
    const { result } = renderHook(() => usePreferences());
    act(() => result.current.addFavourite(virieu));
    act(() => result.current.removeFavourite(virieu.id));
    expect(result.current.preferences.favourites).toEqual([]);
  });

  it('modifie un alias', () => {
    const { result } = renderHook(() => usePreferences());
    act(() => result.current.addFavourite(virieu));
    act(() => result.current.setAlias(virieu.id, 'Chez mamie'));
    expect(result.current.preferences.favourites[0]?.alias).toBe('Chez mamie');
  });

  it('change unite de vent et theme', () => {
    const { result } = renderHook(() => usePreferences());
    act(() => result.current.setWindUnit('kt'));
    expect(result.current.preferences.units.wind).toBe('kt');
    act(() => result.current.setTheme('dark'));
    expect(result.current.preferences.theme).toBe('dark');
  });

  it('purgeLocalData vide le cache indexedDB et reinitialise les preferences', async () => {
    const { result } = renderHook(() => usePreferences());
    act(() => result.current.addFavourite(virieu));
    act(() => result.current.setTheme('dark'));

    await act(async () => {
      await result.current.purgeLocalData();
    });

    expect(db.clearAllLocalData).toHaveBeenCalledOnce();
    expect(result.current.preferences).toEqual(defaultPreferences());
  });
});
