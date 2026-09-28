import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { clearModelChoices, readModelChoice, writeModelChoice } from '../../data/cache/modelChoice';
import { useModelChoice } from './useModelChoice';

afterEach(() => {
  clearModelChoices();
});

describe('useModelChoice', () => {
  it('demarre en selection automatique (null) quand rien n est stocke pour ce lieu', () => {
    const { result } = renderHook(() => useModelChoice('place-sans-choix'));
    expect(result.current[0]).toBeNull();
  });

  it('lit le choix deja stocke pour le lieu', () => {
    writeModelChoice('place-a', 'arpege');
    const { result } = renderHook(() => useModelChoice('place-a'));
    expect(result.current[0]).toBe('arpege');
  });

  it('reste a null quand aucun lieu n est selectionne', () => {
    const { result } = renderHook(() => useModelChoice(null));
    expect(result.current[0]).toBeNull();
  });

  it('met a jour le choix et le persiste pour ce lieu', () => {
    const { result } = renderHook(() => useModelChoice('place-b'));
    act(() => {
      result.current[1]('ecmwf');
    });
    expect(result.current[0]).toBe('ecmwf');
    expect(readModelChoice('place-b')).toBe('ecmwf');
  });

  it('revient a l automatique quand on choisit null', () => {
    writeModelChoice('place-c', 'gfs');
    const { result } = renderHook(() => useModelChoice('place-c'));
    expect(result.current[0]).toBe('gfs');
    act(() => {
      result.current[1](null);
    });
    expect(result.current[0]).toBeNull();
    expect(readModelChoice('place-c')).toBeNull();
  });

  it('n ecrit rien quand on tente de changer le choix sans lieu selectionne', () => {
    const { result } = renderHook(() => useModelChoice(null));
    act(() => {
      result.current[1]('arome');
    });
    expect(result.current[0]).toBeNull();
  });

  it('relit le choix stocke pour le nouveau lieu quand on change de lieu', () => {
    writeModelChoice('place-a', 'arpege');
    writeModelChoice('place-b', 'gfs');
    const { result, rerender } = renderHook(
      ({ placeId }: { placeId: string | null }) => useModelChoice(placeId),
      {
        initialProps: { placeId: 'place-a' as string | null },
      },
    );
    expect(result.current[0]).toBe('arpege');

    rerender({ placeId: 'place-b' });
    expect(result.current[0]).toBe('gfs');

    // Retour au premier lieu : son choix propre est toujours celui memorise,
    // pas celui laisse par le second lieu.
    rerender({ placeId: 'place-a' });
    expect(result.current[0]).toBe('arpege');
  });

  it('bascule vers l automatique en changeant de lieu quand le nouveau lieu n a pas de choix stocke', () => {
    writeModelChoice('place-a', 'arpege');
    const { result, rerender } = renderHook(
      ({ placeId }: { placeId: string | null }) => useModelChoice(placeId),
      {
        initialProps: { placeId: 'place-a' as string | null },
      },
    );
    expect(result.current[0]).toBe('arpege');

    rerender({ placeId: 'place-sans-choix' });
    expect(result.current[0]).toBeNull();
  });
});
