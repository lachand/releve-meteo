import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import L from 'leaflet';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as repository from '../../data/repository';
import { lightningArea } from '../../domain/lightning';
import type { Place } from '../../domain/types';
import { LightningMap } from './LightningMap';

vi.mock('../../data/repository', async (importOriginal) => ({
  ...(await importOriginal<typeof repository>()),
  getLightning: vi.fn(),
}));

const place: Place = {
  id: '45.4900:5.4700',
  name: 'Val de Virieu',
  latitude: 45.49,
  longitude: 5.47,
  elevation: 468,
  admin: 'Isère',
  alias: null,
};

// 13 h 42 UTC, 15 h 42 a Paris.
const NOW = new Date('2026-09-28T13:42:00Z');
const LATEST = Date.UTC(2026, 8, 28, 13, 30);

function frames(count: number) {
  return {
    area: lightningArea(place),
    frames: Array.from({ length: count }, (_, i) => ({
      time: LATEST - (count - 1 - i) * 300_000,
      imageUrl: `https://view.eumetsat.test/frame-${i}.png`,
    })),
  };
}

afterEach(() => {
  vi.mocked(repository.getLightning).mockReset();
});

describe('LightningMap', () => {
  it('rend une carte nommee et annonce le chargement', () => {
    vi.mocked(repository.getLightning).mockReturnValue(new Promise(() => undefined));
    render(<LightningMap place={place} now={NOW} />);
    expect(
      screen.getByLabelText('Carte de la foudre observée autour de Val de Virieu'),
    ).toBeInTheDocument();
    expect(screen.getByText('Chargement des éclairs observés…')).toBeInTheDocument();
  });

  it('demarre sur la derniere image, dit son age, sa provenance et ses limites', async () => {
    vi.mocked(repository.getLightning).mockResolvedValue({ ok: true, value: frames(4) });
    const user = userEvent.setup();
    render(<LightningMap place={place} now={NOW} />);
    const slider = await screen.findByRole('slider', { name: 'Image des éclairs' });
    expect(slider).toHaveValue('3');
    expect(slider).toHaveAttribute('aria-valuetext', '15:30, observé');
    expect(screen.getByText('observé')).toBeInTheDocument();
    expect(screen.getByText(/dernière image de 15:30, il y a 12 min/)).toBeInTheDocument();
    expect(screen.getByText(/ce ne sont pas des impacts localisés au sol/)).toBeInTheDocument();
    expect(
      screen.getByText(/aucun éclair n’a été détecté, ou qu’aucune image/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Légende des éclairs/)).toHaveTextContent('1 éclair');

    // Pause puis image plus ancienne : l'heure suit le curseur.
    const toggle = screen.getByRole('button', { name: /Pause|Lecture/ });
    if (toggle.getAttribute('aria-pressed') === 'true') {
      await user.click(toggle);
    }
    fireEvent.change(slider, { target: { value: '0' } });
    expect(slider).toHaveAttribute('aria-valuetext', '15:15, observé');
    expect(screen.getByRole('button', { name: 'Lecture' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('pose une image par instant sur la zone couverte, demandee avec CORS', async () => {
    const spy = vi.spyOn(L, 'imageOverlay');
    vi.mocked(repository.getLightning).mockResolvedValue({ ok: true, value: frames(3) });
    render(<LightningMap place={place} now={NOW} />);
    await screen.findByRole('slider', { name: 'Image des éclairs' });
    expect(spy).toHaveBeenCalledTimes(3);
    const [, bounds, options] = spy.mock.calls[0] ?? [];
    expect((bounds as L.LatLngBounds).getCenter().lat).toBeCloseTo(place.latitude, 4);
    expect(options?.crossOrigin).toBe(true);
    spy.mockRestore();
  });

  it("n'affiche pas de commande pour une seule image", async () => {
    vi.mocked(repository.getLightning).mockResolvedValue({ ok: true, value: frames(1) });
    render(<LightningMap place={place} now={NOW} />);
    expect(await screen.findByText(/dernière image de 15:30/)).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it("dit l'indisponibilite quand le satellite ne repond pas ou ne publie rien", async () => {
    vi.mocked(repository.getLightning).mockResolvedValueOnce({
      ok: false,
      failure: { kind: 'network' },
    });
    const { unmount } = render(<LightningMap place={place} now={NOW} />);
    expect(
      await screen.findByText('Foudre observée indisponible pour l’instant.'),
    ).toBeInTheDocument();
    unmount();

    vi.mocked(repository.getLightning).mockResolvedValueOnce({
      ok: true,
      value: { area: lightningArea(place), frames: [] },
    });
    render(<LightningMap place={place} now={NOW} />);
    expect(
      await screen.findByText('Foudre observée indisponible pour l’instant.'),
    ).toBeInTheDocument();
  });

  it("ne reclame pas de lecture au service quand l'ecran est quitte avant la reponse", async () => {
    let resolve: (value: Awaited<ReturnType<typeof repository.getLightning>>) => void = () => {};
    vi.mocked(repository.getLightning).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { unmount } = render(<LightningMap place={place} now={NOW} />);
    unmount();
    resolve({ ok: true, value: frames(2) });
    // Rien a afficher ni a nettoyer : la reponse tardive est ignoree sans erreur.
    await Promise.resolve();
    expect(vi.mocked(repository.getLightning)).toHaveBeenCalledTimes(1);
  });
});
