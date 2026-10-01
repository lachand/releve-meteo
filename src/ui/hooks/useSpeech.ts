import { useCallback, useEffect, useState } from 'react';

/*
 * Lecture vocale avec la synthese du navigateur (Web Speech API), sans
 * service externe : le texte ne quitte pas l'appareil. La qualite et la
 * langue dependent des voix installees ; sans voix francaise, le hook le
 * dit au lieu de lire du francais avec une voix qui ne le parle pas.
 */

/**
 * Etat des voix : `unknown` tant que le navigateur n'a pas charge sa liste ;
 * la lecture reste alors proposee, le navigateur choisissant sa voix francaise.
 */
export type VoiceAvailability = 'unsupported' | 'unknown' | 'french' | 'none';

export interface Speech {
  readonly availability: VoiceAvailability;
  readonly speaking: boolean;
  /** Lit le texte, ou arrete la lecture en cours. */
  readonly toggle: (text: string) => void;
  readonly stop: () => void;
}

function synthesis(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null;
}

function availabilityOf(engine: SpeechSynthesis | null): VoiceAvailability {
  if (engine === null || typeof SpeechSynthesisUtterance === 'undefined') {
    return 'unsupported';
  }
  const voices = engine.getVoices();
  if (voices.length === 0) {
    return 'unknown';
  }
  return voices.some((voice) => voice.lang.toLowerCase().startsWith('fr')) ? 'french' : 'none';
}

export function useSpeech(): Speech {
  const [availability, setAvailability] = useState<VoiceAvailability>(() =>
    availabilityOf(synthesis()),
  );
  const [speaking, setSpeaking] = useState(false);

  // La liste des voix arrive souvent apres le premier rendu.
  useEffect(() => {
    const engine = synthesis();
    if (engine === null) {
      return;
    }
    const update = () => setAvailability(availabilityOf(engine));
    engine.addEventListener('voiceschanged', update);
    return () => engine.removeEventListener('voiceschanged', update);
  }, []);

  const stop = useCallback(() => {
    synthesis()?.cancel();
    setSpeaking(false);
  }, []);

  // Une lecture ne survit pas a l'ecran qui l'a lancee.
  useEffect(() => () => synthesis()?.cancel(), []);

  const toggle = useCallback(
    (text: string) => {
      const engine = synthesis();
      if (engine === null) {
        return;
      }
      if (engine.speaking) {
        stop();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'fr-FR';
      const french = engine.getVoices().find((voice) => voice.lang.toLowerCase().startsWith('fr'));
      if (french !== undefined) {
        utterance.voice = french;
      }
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      setSpeaking(true);
      engine.speak(utterance);
    },
    [stop],
  );

  return { availability, speaking, toggle, stop };
}
