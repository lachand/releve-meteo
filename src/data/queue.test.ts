import { describe, expect, it } from 'vitest';
import { enqueue, pendingCount } from './queue';

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('enqueue', () => {
  it("ne declenche qu'une seule tache pour deux appels concurrents sur la meme cle", async () => {
    let calls = 0;
    const { promise, resolve } = deferred<string>();
    const task = () => {
      calls += 1;
      return promise;
    };

    const first = enqueue('key', task);
    const second = enqueue('key', task);
    resolve('valeur');

    await expect(first).resolves.toBe('valeur');
    await expect(second).resolves.toBe('valeur');
    expect(calls).toBe(1);
  });

  it('declenche une tache par cle sur des cles differentes', async () => {
    let calls = 0;
    const task = async () => {
      calls += 1;
      return calls;
    };
    await Promise.all([enqueue('a', task), enqueue('b', task)]);
    expect(calls).toBe(2);
  });

  it('retire la cle une fois la tache reglee, une nouvelle tache demarre ensuite', async () => {
    let calls = 0;
    const task = async () => {
      calls += 1;
      return calls;
    };
    await enqueue('key', task);
    expect(pendingCount()).toBe(0);
    await enqueue('key', task);
    expect(calls).toBe(2);
  });

  it('retire aussi la cle quand la tache echoue, sans empoisonner les appels suivants', async () => {
    const failing = enqueue('key', () => Promise.reject(new Error('echec reseau')));
    await expect(failing).rejects.toThrow('echec reseau');
    expect(pendingCount()).toBe(0);

    const succeeding = enqueue('key', () => Promise.resolve('ok'));
    await expect(succeeding).resolves.toBe('ok');
  });

  it('pendingCount reflete les taches en vol', async () => {
    expect(pendingCount()).toBe(0);
    const { promise, resolve } = deferred<void>();
    const inFlight = enqueue('key', () => promise);
    expect(pendingCount()).toBe(1);
    resolve();
    await inFlight;
    expect(pendingCount()).toBe(0);
  });
});
