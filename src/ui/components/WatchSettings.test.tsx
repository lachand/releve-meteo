import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NOTIFY } from '../../domain/weatherNotices';
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
    notify: DEFAULT_NOTIFY,
    setNotify: vi.fn(),
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

  describe('dans l application Android', () => {
    afterEach(() => {
      delete (window as unknown as { ReleveAndroid?: unknown }).ReleveAndroid;
    });

    it('dit ce que fait l application au lieu de renvoyer au navigateur', async () => {
      const refreshWidgets = vi.fn();
      (window as unknown as { ReleveAndroid?: unknown }).ReleveAndroid = { refreshWidgets };
      render(<WatchSettings watch={watch('unsupported')} />);
      expect(screen.getByRole('status')).toHaveTextContent(/widgets/);
      expect(screen.getByRole('status')).not.toHaveTextContent(/Ce navigateur/);
      expect(screen.queryByRole('button', { name: 'Activer la veille' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Mettre à jour les widgets' }));
      expect(refreshWidgets).toHaveBeenCalledOnce();
    });
  });

  describe('notifications natives', () => {
    afterEach(() => {
      delete (window as unknown as { ReleveAndroid?: unknown }).ReleveAndroid;
    });

    function bridge(initial: 'on' | 'off' | 'denied') {
      const state = { value: initial };
      const setNotifications = vi.fn((on: boolean) => {
        state.value = on ? 'on' : 'off';
      });
      (window as unknown as { ReleveAndroid?: unknown }).ReleveAndroid = {
        refreshWidgets: vi.fn(),
        notificationsState: () => state.value,
        setNotifications,
      };
      return { setNotifications };
    }

    it('propose d activer, puis relit l etat quand l application le dit', async () => {
      const { setNotifications } = bridge('off');
      render(<WatchSettings watch={watch('unsupported')} />);
      expect(screen.getAllByRole('status')[1]).toHaveTextContent(/Notifications coupées/);
      await userEvent.click(screen.getByRole('button', { name: 'Activer les notifications' }));
      expect(setNotifications).toHaveBeenCalledWith(true);
      act(() => {
        window.dispatchEvent(new Event('releve-notifications'));
      });
      expect(screen.getAllByRole('status')[1]).toHaveTextContent(/Notifications actives/);
      await userEvent.click(screen.getByRole('button', { name: 'Couper les notifications' }));
      expect(setNotifications).toHaveBeenLastCalledWith(false);
    });

    it('dit quand Android a refuse l autorisation', () => {
      bridge('denied');
      render(<WatchSettings watch={watch('unsupported')} />);
      expect(screen.getAllByRole('status')[1]).toHaveTextContent(/refusées par Android/);
    });

    it('ne dit jamais temps reel et renvoie a la vigilance officielle', () => {
      bridge('on');
      render(<WatchSettings watch={watch('unsupported')} />);
      expect(screen.getByText(/Ce n’est pas du temps réel/)).toBeInTheDocument();
      expect(screen.getByText(/vigilance officielle de Météo-France/)).toBeInTheDocument();
    });
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
    expect(screen.getByText(/l’heure n’est pas garantie/)).toBeInTheDocument();
    await userEvent.click(box);
    expect(on.setDigest).toHaveBeenCalledWith(true);

    rerender(<WatchSettings watch={watch('on', { digest: true })} />);
    expect(screen.getByRole('checkbox', { name: /Résumé du matin/ })).toBeChecked();
  });

  it('laisse choisir risques, pluie et pollens, chacun avec ce qui partira', async () => {
    const on = watch('on');
    render(<WatchSettings watch={on} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /Phénomènes violents à venir/ }));
    expect(on.setNotify).toHaveBeenLastCalledWith({ risks: true });
    await userEvent.click(screen.getByRole('checkbox', { name: /Pluie à venir/ }));
    expect(on.setNotify).toHaveBeenLastCalledWith({ rain: true });
    await userEvent.click(screen.getByRole('checkbox', { name: /Pollens à un niveau élevé/ }));
    expect(on.setNotify).toHaveBeenLastCalledWith({ pollen: true });
    await userEvent.click(screen.getByRole('checkbox', { name: /Foudre à proximité/ }));
    expect(on.setNotify).toHaveBeenLastCalledWith({ lightning: true });
  });

  it('laisse choisir le matin a une heure precise, ou des la detection', async () => {
    const on = watch('on');
    const { rerender } = render(<WatchSettings watch={on} />);
    expect(screen.getByRole('radio', { name: /Le matin, une notification groupée/ })).toBeChecked();
    const hour = screen.getByRole('combobox', { name: 'Heure visée' });
    expect(hour).toHaveValue('7');
    await userEvent.selectOptions(hour, '6');
    expect(on.setNotify).toHaveBeenLastCalledWith({ hour: 6 });
    await userEvent.click(screen.getByRole('radio', { name: /Dès qu’un avis est détecté/ }));
    expect(on.setNotify).toHaveBeenLastCalledWith({ mode: 'instant' });

    rerender(
      <WatchSettings watch={watch('on', { notify: { ...DEFAULT_NOTIFY, mode: 'instant' } })} />,
    );
    expect(screen.getByRole('radio', { name: /Dès qu’un avis est détecté/ })).toBeChecked();
    await userEvent.click(
      screen.getByRole('radio', { name: /Le matin, une notification groupée/ }),
    );
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
      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
      unmount();
    }
  });
});
