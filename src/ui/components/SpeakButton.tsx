import { useEffect } from 'react';
import { useSpeech } from '../hooks/useSpeech';
import styles from './SpeakButton.module.css';

/**
 * Lit le bulletin a voix haute avec la voix francaise du navigateur. Sans voix
 * francaise sur l'appareil, il le dit plutot que de lire avec une voix qui ne
 * parle pas la langue ; sans synthese vocale, il ne montre rien.
 */
export function SpeakButton({ text }: { readonly text: string }) {
  const { availability, speaking, toggle, stop } = useSpeech();

  // Le texte change (autre lieu, autre heure) : l'ancienne lecture s'arrete.
  useEffect(() => stop, [text, stop]);

  if (availability === 'unsupported') {
    return null;
  }
  if (availability === 'none') {
    return (
      <p className={styles.note}>
        Lecture vocale : aucune voix française n’est installée sur cet appareil.
      </p>
    );
  }
  return (
    <button
      type="button"
      className={styles.button}
      aria-pressed={speaking}
      onClick={() => toggle(text)}
    >
      {speaking ? 'Arrêter la lecture' : 'Écouter le bulletin'}
    </button>
  );
}
