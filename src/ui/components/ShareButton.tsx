import { useEffect, useState } from 'react';
import { CheckIcon, ShareIcon } from '../tabIcons';

interface ShareButtonProps {
  /** Lien a partager : lieu, vue et, le cas echeant, modele choisi. */
  readonly url: string;
  /** Titre propose au partage natif (nom du lieu). */
  readonly title: string;
  readonly className?: string;
}

type Outcome = 'idle' | 'copied' | 'shared' | 'failed';

const CONFIRMATION_MS = 2500;

const MESSAGES: Readonly<Record<Outcome, string>> = {
  idle: '',
  copied: 'Lien copié.',
  shared: 'Lien partagé.',
  failed: 'Copie impossible : le navigateur refuse l’accès au presse-papiers.',
};

/**
 * « Copier le lien » : le partage natif quand le navigateur en propose un
 * (mobile), sinon le presse-papiers. Le lien porte le modele choisi : le
 * destinataire voit alors « Choix manuel », jamais un modele impose en silence.
 */
export function ShareButton({ url, title, className }: ShareButtonProps) {
  const [outcome, setOutcome] = useState<Outcome>('idle');

  useEffect(() => {
    if (outcome === 'idle') {
      return;
    }
    const timer = window.setTimeout(() => setOutcome('idle'), CONFIRMATION_MS);
    return () => window.clearTimeout(timer);
  }, [outcome]);

  const share = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url });
        setOutcome('shared');
        return;
      } catch (error) {
        // Partage ferme par l'utilisateur : rien a dire, rien a copier.
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setOutcome('copied');
    } catch {
      setOutcome('failed');
    }
  };

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => void share()}
        aria-label="Copier le lien de ce relevé"
        title="Copier le lien de ce relevé"
      >
        {outcome === 'copied' || outcome === 'shared' ? <CheckIcon /> : <ShareIcon />}
      </button>
      <span role="status" className="visually-hidden">
        {MESSAGES[outcome]}
      </span>
    </>
  );
}
