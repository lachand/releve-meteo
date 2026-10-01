import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { WatchStatus } from '../../pwa/backgroundWatch';
import type { BackgroundWatch } from '../hooks/useBackgroundWatch';
import { WatchSettings } from './WatchSettings';

function watch(status: WatchStatus | null, overrides: Partial<BackgroundWatch> = {}) {
  return {
    status,
    lastRunUtcMs: null,
    busy: false,
    enable: vi.fn(),
    collect: vi.fn(),
    allow: vi.fn(),
    disable: vi.fn(),
    digest: false,
    setDigest: vi.fn(),
    ...overrides,
  } satisfies BackgroundWatch;
}

describe('WatchSettings', () => {
  it.each<[WatchStatus | null, RegExp]>([
    [null, /Vérification de ce que permet ce navigateur/],
    [
      'unsupported',
      /ne permet pas la veille en arrière-plan : vos alertes sont évaluées à chaque ouverture/,
    ],
    ['blocked', /notifications de Relevé sont bloquées/],
    ['needs-install', /n’accorde la veille qu’aux applications installées/],
    ['off', /vigilance Météo-France orange ou rouge, application fermée/],
    ['collecting', /Collecte active, sans notification/],
  ])('dit ce que permet l etat %s', (status, text) => {
    render(<WatchSettings watch={watch(status)} />);
    expect(screen.getByRole('status')).toHaveTextContent(text);
  });

  it('ne promet jamais le temps reel, sauf la ou rien n est possible', () => {
    const { rerender } = render(<WatchSettings watch={watch('off')} />);
    expect(screen.getByText(/Ce n’est pas une alerte en temps réel/)).toBeInTheDocument();
    rerender(<WatchSettings watch={watch('unsupported')} />);
    expect(screen.queryByText(/temps réel/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('active la veille, puis dit quand a eu lieu la derniere', async () => {
    const off = watch('off');
    const { rerender } = render(<WatchSettings watch={off} />);
    await userEvent.click(screen.getByRole('button', { name: 'Activer la veille' }));
    expect(off.enable).toHaveBeenCalledOnce();

    rerender(<WatchSettings watch={watch('on')} />);
    expect(screen.getByRole('status')).toHaveTextContent('Aucune veille menée pour l’instant.');

    const on = watch('on', { lastRunUtcMs: Date.parse('2026-09-28T14:00:00Z') });
    rerender(<WatchSettings watch={on} />);
    expect(screen.getByRole('status')).toHaveTextContent('Dernière veille : lundi 16h.');
    await userEvent.click(screen.getByRole('button', { name: 'Arrêter la veille' }));
    expect(on.disable).toHaveBeenCalledOnce();
  });

  it('desactive le bouton pendant une demande', () => {
    render(<WatchSettings watch={watch('needs-install', { busy: true })} />);
    expect(screen.getByRole('button', { name: 'Activer la veille' })).toBeDisabled();
  });

  it('propose la collecte sans notification, en disant ce qu elle enregistre et ce qu elle n affiche pas', async () => {
    const off = watch('off');
    render(<WatchSettings watch={off} />);
    await userEvent.click(screen.getByRole('button', { name: 'Collecter sans notification' }));
    expect(off.collect).toHaveBeenCalledOnce();
    expect(screen.getByText(/enregistrer en arrière-plan les prévisions/)).toBeInTheDocument();
  });

  it('propose la collecte seule meme quand les notifications sont bloquees', async () => {
    const blocked = watch('blocked');
    render(<WatchSettings watch={blocked} />);
    expect(screen.queryByRole('button', { name: 'Activer la veille' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Collecter sans notification' }));
    expect(blocked.collect).toHaveBeenCalledOnce();
  });

  it('en collecte seule, demande la permission de notifier sur geste, ou arrete', async () => {
    const collecting = watch('collecting');
    render(<WatchSettings watch={collecting} />);
    await userEvent.click(screen.getByRole('button', { name: 'Autoriser les notifications' }));
    expect(collecting.allow).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Arrêter la veille' }));
    expect(collecting.disable).toHaveBeenCalledOnce();
  });

  it('n offre pas la collecte quand la veille est deja active ou impossible', () => {
    const { rerender } = render(<WatchSettings watch={watch('on')} />);
    expect(screen.queryByRole('button', { name: 'Collecter sans notification' })).toBeNull();
    rerender(<WatchSettings watch={watch('needs-install')} />);
    expect(screen.queryByRole('button', { name: 'Collecter sans notification' })).toBeNull();
  });

  it('propose le resume du matin quand la veille notifie, en disant que l heure n est pas garantie', async () => {
    const on = watch('on');
    const { rerender } = render(<WatchSettings watch={on} />);
    const box = screen.getByRole('checkbox', { name: /Résumé du matin/ });
    expect(box).not.toBeChecked();
    expect(screen.getByText(/l’heure exacte dépend du navigateur/)).toBeInTheDocument();
    await userEvent.click(box);
    expect(on.setDigest).toHaveBeenCalledWith(true);

    rerender(<WatchSettings watch={watch('on', { digest: true })} />);
    expect(screen.getByRole('checkbox', { name: /Résumé du matin/ })).toBeChecked();
  });

  it('ne propose pas le resume sans notification possible', () => {
    for (const status of [
      'off',
      'collecting',
      'blocked',
      'unsupported',
      'needs-install',
    ] as const) {
      const { unmount } = render(<WatchSettings watch={watch(status)} />);
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      unmount();
    }
  });
});
