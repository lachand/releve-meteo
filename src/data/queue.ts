const pending = new Map<string, Promise<unknown>>();

/**
 * Deduplique les appels concurrents sur la meme cle : si une tache est deja
 * en vol pour cette cle, les appelants suivants recoivent la meme promesse
 * plutot que de declencher une nouvelle requete.
 */
export function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const existing = pending.get(key);
  if (existing !== undefined) {
    return existing as Promise<T>;
  }
  const promise = task().finally(() => {
    pending.delete(key);
  });
  pending.set(key, promise);
  return promise;
}

export function pendingCount(): number {
  return pending.size;
}
