import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as rainviewer from '../../data/clients/rainviewer';
import type { Place } from '../../domain/types';
import { RadarMap } from './RadarMap';

vi.mock('../../data/clients/rainviewer', () => ({
  fetchLatestRadarFrame: vi.fn(),
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

afterEach(() => {
  vi.mocked(rainviewer.fetchLatestRadarFrame).mockReset();
});

describe('RadarMap', () => {
  it('rend un conteneur de carte avec un libelle accessible', () => {
    vi.mocked(rainviewer.fetchLatestRadarFrame).mockResolvedValue({ ok: true, value: null });
    render(<RadarMap place={place} />);
    expect(screen.getByLabelText(`Carte radar autour de ${place.name}`)).toBeInTheDocument();
  });

  it("affiche l'heure de la trame radar une fois chargee", async () => {
    vi.mocked(rainviewer.fetchLatestRadarFrame).mockResolvedValue({
      ok: true,
      value: { time: 1700000000, tileUrlTemplate: 'https://example.test/{z}/{x}/{y}.png' },
    });
    render(<RadarMap place={place} />);
    expect(await screen.findByText(/^Radar : \d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it("affiche un message d'indisponibilite si RainViewer echoue", async () => {
    vi.mocked(rainviewer.fetchLatestRadarFrame).mockResolvedValue({
      ok: false,
      failure: { kind: 'network' },
    });
    render(<RadarMap place={place} />);
    expect(
      await screen.findByText("Overlay radar indisponible pour l'instant."),
    ).toBeInTheDocument();
  });
});
