import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpeakButton } from './SpeakButton';

interface FakeVoice {
  readonly lang: string;
}

class FakeUtterance {
  lang = '';
  voice: FakeVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly text: string) {}
}

function installSynthesis(voices: readonly FakeVoice[]) {
  const listeners = new Set<() => void>();
  const spoken: FakeUtterance[] = [];
  const engine = {
    speaking: false,
    getVoices: () => voices,
    speak: vi.fn((utterance: FakeUtterance) => {
      spoken.push(utterance);
      engine.speaking = true;
    }),
    cancel: vi.fn(() => {
      engine.speaking = false;
    }),
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal('speechSynthesis', engine);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: engine });
  return {
    engine,
    spoken,
    setVoices: (next: FakeVoice[]) => {
      voices = next;
      listeners.forEach((listener) => listener());
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  // @ts-expect-error nettoyage de la propriete posee pour le test
  delete window.speechSynthesis;
});

describe('SpeakButton', () => {
  it('ne montre rien quand le navigateur n a pas de synthese vocale', () => {
    const { container } = render(<SpeakButton text="Bulletin." />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lit le bulletin avec une voix francaise, puis s arrete a la demande', async () => {
    const user = userEvent.setup();
    const { engine, spoken } = installSynthesis([{ lang: 'en-US' }, { lang: 'fr-FR' }]);
    render(<SpeakButton text="Relevé de Lyon. AROME prévoit 14 °C." />);
    const button = screen.getByRole('button', { name: 'Écouter le bulletin' });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await user.click(button);
    expect(spoken).toHaveLength(1);
    expect(spoken[0]?.text).toBe('Relevé de Lyon. AROME prévoit 14 °C.');
    expect(spoken[0]?.lang).toBe('fr-FR');
    expect(spoken[0]?.voice).toEqual({ lang: 'fr-FR' });
    expect(screen.getByRole('button', { name: 'Arrêter la lecture' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Arrêter la lecture' }));
    expect(engine.cancel).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Écouter le bulletin' })).toBeInTheDocument();
  });

  it('revient au bouton quand la lecture se termine ou echoue', async () => {
    const user = userEvent.setup();
    const { spoken, engine } = installSynthesis([{ lang: 'fr-CA' }]);
    render(<SpeakButton text="Bulletin." />);
    await user.click(screen.getByRole('button', { name: 'Écouter le bulletin' }));
    act(() => {
      engine.speaking = false;
      spoken[0]?.onend?.();
    });
    expect(screen.getByRole('button', { name: 'Écouter le bulletin' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Écouter le bulletin' }));
    act(() => {
      engine.speaking = false;
      spoken[1]?.onerror?.();
    });
    expect(screen.getByRole('button', { name: 'Écouter le bulletin' })).toBeInTheDocument();
  });

  it('dit qu il n y a pas de voix francaise plutot que de lire avec une autre', () => {
    installSynthesis([{ lang: 'en-US' }, { lang: 'de-DE' }]);
    render(<SpeakButton text="Bulletin." />);
    expect(screen.getByText(/aucune voix française n’est installée/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('propose la lecture tant que la liste des voix n est pas chargee, puis corrige selon les voix', () => {
    const { setVoices } = installSynthesis([]);
    render(<SpeakButton text="Bulletin." />);
    // Liste encore vide : le navigateur choisira une voix francaise s'il en a une ; pas de mensonge.
    expect(screen.getByRole('button', { name: 'Écouter le bulletin' })).toBeInTheDocument();
    expect(screen.queryByText(/aucune voix française/)).not.toBeInTheDocument();
    act(() => setVoices([{ lang: 'en-US' }]));
    expect(screen.getByText(/aucune voix française n’est installée/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    act(() => setVoices([{ lang: 'fr-FR' }]));
    expect(screen.getByRole('button', { name: 'Écouter le bulletin' })).toBeInTheDocument();
  });

  it('arrete la lecture quand le texte change ou que l ecran se ferme', async () => {
    const user = userEvent.setup();
    const { engine } = installSynthesis([{ lang: 'fr-FR' }]);
    const { rerender, unmount } = render(<SpeakButton text="Lyon." />);
    await user.click(screen.getByRole('button', { name: 'Écouter le bulletin' }));
    engine.cancel.mockClear();
    rerender(<SpeakButton text="Brest." />);
    expect(engine.cancel).toHaveBeenCalled();
    engine.cancel.mockClear();
    unmount();
    expect(engine.cancel).toHaveBeenCalled();
  });
});
