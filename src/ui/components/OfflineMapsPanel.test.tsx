import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../../domain/types';
import { OfflineMapsPanel } from './OfflineMapsPanel';

function place(id: string, latitude: number, longitude: number): Place {
  return { id, name: id, latitude, longitude, elevation: 100, admin: null, alias: null };
}

const LYON = place('lyon', 45.7578, 4.832);
const BREST = place('brest', 48.3904, -4.4861);

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

function controlled() {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { controller: {} },
  });
}

describe('OfflineMapsPanel', () => {
  it('invite a ajouter un favori quand il n y en a pas', () => {
    render(<OfflineMapsPanel favourites={[]} />);
    expect(screen.getByText(/Ajoutez un lieu aux favoris/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Télécharger les cartes' }),
    ).not.toBeInTheDocument();
  });

  it('annonce le nombre de tuiles et le poids estime avant tout telechargement', () => {
    controlled();
    render(<OfflineMapsPanel favourites={[LYON, BREST]} />);
    const text = document.body.textContent?.replace(/[\u00a0\u202f]/g, ' ') ?? '';
    expect(text).toMatch(/\d+ tuiles, environ \d+(,\d)? Mo \(estimation\)/);
    expect(text).toContain('OpenStreetMap demande un usage mesuré');
    expect(screen.queryByText(/ne contrôle pas encore cette page/)).not.toBeInTheDocument();
  });

  it('dit quand le service worker ne controle pas encore la page', () => {
    render(<OfflineMapsPanel favourites={[LYON]} />);
    expect(screen.getByText(/ne contrôle pas encore cette page/)).toBeInTheDocument();
  });

  it('telecharge a la demande, montre la progression et le bilan, dont les echecs', async () => {
    controlled();
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        return calls % 5 === 0
          ? new Response(null, { status: 429 })
          : new Response(new Uint8Array([1]), { status: 200 });
      }),
    );
    const user = userEvent.setup();
    render(<OfflineMapsPanel favourites={[LYON]} />);
    await user.click(screen.getByRole('button', { name: 'Télécharger les cartes' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/tuiles téléchargées sur/),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      /en échec \(réseau, ou limite du service\)/,
    );
    expect(calls).toBeGreaterThan(10);
  });

  it('peut etre arrete en cours de route', async () => {
    controlled();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await gate;
        return new Response(new Uint8Array([1]), { status: 200 });
      }),
    );
    const user = userEvent.setup();
    render(<OfflineMapsPanel favourites={[LYON]} />);
    await user.click(screen.getByRole('button', { name: 'Télécharger les cartes' }));
    await user.click(await screen.findByRole('button', { name: 'Arrêter' }));
    release();
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/tuiles téléchargées sur/),
    );
    const done = Number(
      /(\d+) tuiles téléchargées/.exec(screen.getByRole('status').textContent ?? '')?.[1],
    );
    expect(done).toBeLessThanOrEqual(2);
  });
});
