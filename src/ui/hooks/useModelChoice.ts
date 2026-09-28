import { useCallback, useState } from 'react';
import { readModelChoice, writeModelChoice } from '../../data/cache/modelChoice';
import type { ModelId } from '../../domain/types';

interface Choice {
  readonly placeId: string | null;
  readonly model: ModelId | null;
}

/** Choix manuel du modele de reference pour le lieu courant (null = automatique). */
export function useModelChoice(
  placeId: string | null,
): readonly [ModelId | null, (model: ModelId | null) => void] {
  const [choice, setChoice] = useState<Choice>(() => ({
    placeId,
    model: placeId === null ? null : readModelChoice(placeId),
  }));

  // Changement de lieu : relecture synchrone pendant le rendu (motif
  // « state derive » de React), sans effet ni rendu intermediaire faux.
  let current = choice;
  if (choice.placeId !== placeId) {
    current = { placeId, model: placeId === null ? null : readModelChoice(placeId) };
    setChoice(current);
  }

  const update = useCallback(
    (model: ModelId | null) => {
      if (placeId === null) {
        return;
      }
      writeModelChoice(placeId, model);
      setChoice({ placeId, model });
    },
    [placeId],
  );

  return [current.model, update] as const;
}
