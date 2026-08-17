import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Place } from '../../domain/types';
import { useTerrain } from './useTerrain';

const virieu: Place = {
  id: '45.4900:5.4700',
  name: 'Val de Virieu',
  latitude: 45.4936,
  longitude: 5.4708,
  elevation: 468,
  admin: 'Isère',
  alias: null,
};

const morbihan: Place = {
  id: '47.5667:-2.8167',
  name: 'Golfe du Morbihan',
  latitude: 47.5667,
  longitude: -2.8167,
  elevation: 5,
  admin: 'Morbihan',
  alias: null,
};

describe('useTerrain', () => {
  it('retourne null sans lieu selectionne', () => {
    const { result } = renderHook(() => useTerrain(null));
    expect(result.current).toBeNull();
  });

  it('classe Val de Virieu en plateau', () => {
    const { result } = renderHook(() => useTerrain(virieu));
    expect(result.current?.kind).toBe('plateau');
  });

  it('classe le Golfe du Morbihan en coastal', () => {
    const { result } = renderHook(() => useTerrain(morbihan));
    expect(result.current?.kind).toBe('coastal');
  });
});
