import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { HttpResult } from '../../data/clients/http';
import type { DatasetResult } from '../../data/repository';
import { useDataset } from './useDataset';

type Result = HttpResult<DatasetResult<string>>;

/** Promesse controlee depuis le test, pour observer l'etat 'loading' avant resolution. */
function deferred(): {
  readonly promise: Promise<Result>;
  readonly resolve: (value: Result) => void;
} {
  let resolveFn: (value: Result) => void = () => {};
  const promise = new Promise<Result>((resolve) => {
    resolveFn = resolve;
  });
  return { promise, resolve: resolveFn };
}

describe('useDataset', () => {
  it('rend le meme objet d un rendu a l autre tant que rien n a change', async () => {
    // Regression : un objet neuf a chaque rendu faisait recalculer tout ce qui en depend
    // (selection des modeles, vue du jour) et recreer les graphiques a chaque rendu de l'application.
    const first = deferred();
    const loader = () => first.promise;
    const { result, rerender } = renderHook(() => useDataset('lyon', loader));
    const loading = result.current;
    rerender();
    expect(result.current).toBe(loading);

    await act(async () => {
      first.resolve({ ok: true, value: { value: 'donnee', fetchedAt: 123, stale: false } });
      await first.promise;
    });
    const ready = result.current;
    expect(ready.status).toBe('ready');
    rerender();
    expect(result.current).toBe(ready);
  });

  it("reste 'idle' et n appelle pas le chargeur quand la cle est nulle", () => {
    let calls = 0;
    const loader = () => {
      calls += 1;
      return Promise.resolve<Result>({
        ok: true,
        value: { value: 'X', fetchedAt: 0, stale: false },
      });
    };
    const { result } = renderHook(() => useDataset<string>(null, loader));
    expect(result.current).toEqual({ status: 'idle' });
    expect(calls).toBe(0);
  });

  it("passe par 'loading' avant de se resoudre en 'ready'", async () => {
    const first = deferred();
    const { result } = renderHook(() => useDataset('lyon', () => first.promise));
    expect(result.current).toEqual({ status: 'loading' });

    await act(async () => {
      first.resolve({ ok: true, value: { value: 'donnee', fetchedAt: 123, stale: false } });
      await first.promise;
    });

    expect(result.current).toEqual({
      status: 'ready',
      value: 'donnee',
      fetchedAt: 123,
      stale: false,
    });
  });

  it("passe a l etat 'error' avec l echec transmis quand le chargeur echoue", async () => {
    const first = deferred();
    const { result } = renderHook(() => useDataset('lyon', () => first.promise));

    await act(async () => {
      first.resolve({ ok: false, failure: { kind: 'network' } });
      await first.promise;
    });

    expect(result.current).toEqual({ status: 'error', failure: { kind: 'network' } });
  });

  it('revient a loading des que la cle change, meme si l ancienne valeur etait prete', async () => {
    const first = deferred();
    const second = deferred();
    const { result, rerender } = renderHook(
      ({ key, loader }: { key: string; loader: () => Promise<Result> }) => useDataset(key, loader),
      { initialProps: { key: 'a', loader: () => first.promise } },
    );

    await act(async () => {
      first.resolve({ ok: true, value: { value: 'A', fetchedAt: 1, stale: false } });
      await first.promise;
    });
    expect(result.current).toEqual({ status: 'ready', value: 'A', fetchedAt: 1, stale: false });

    rerender({ key: 'b', loader: () => second.promise });
    // La nouvelle cle n'a encore aucun resultat : l'ancienne valeur ne doit
    // pas rester affichee comme si elle repondait a la nouvelle cle.
    expect(result.current).toEqual({ status: 'loading' });

    await act(async () => {
      second.resolve({ ok: true, value: { value: 'B', fetchedAt: 2, stale: false } });
      await second.promise;
    });
    expect(result.current).toEqual({ status: 'ready', value: 'B', fetchedAt: 2, stale: false });
  });
});
