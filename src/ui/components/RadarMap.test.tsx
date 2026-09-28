import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as rainviewer from '../../data/clients/rainviewer';
import type { Place } from '../../domain/types';
import { RadarMap } from './RadarMap';

vi.mock('../../data/clients/rainviewer', () => ({
  fetchRadarFrames: vi.fn(),
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
  vi.mocked(rainviewer.fetchRadarFrames).mockReset();
});

describe('RadarMap', () => {
  it('rend un conteneur de carte avec un libelle accessible', () => {
    vi.mocked(rainviewer.fetchRadarFrames).mockResolvedValue({ ok: true, value: [] });
    render(<RadarMap place={place} />);
    expect(screen.getByLabelText(`Carte radar autour de ${place.name}`)).toBeInTheDocument();
  });

  it('demarre sur la derniere trame observee et distingue observe et prevu', async () => {
    vi.mocked(rainviewer.fetchRadarFrames).mockResolvedValue({
      ok: true,
      value: [
        {
          time: 1700000000,
          tileUrlTemplate: 'https://example.test/a/{z}/{x}/{y}.png',
          provenance: 'observed',
        },
        {
          time: 1700000600,
          tileUrlTemplate: 'https://example.test/b/{z}/{x}/{y}.png',
          provenance: 'observed',
        },
        {
          time: 1700001200,
          tileUrlTemplate: 'https://example.test/c/{z}/{x}/{y}.png',
          provenance: 'forecast',
        },
      ],
    });
    const user = userEvent.setup();
    render(<RadarMap place={place} />);
    const slider = await screen.findByRole('slider', { name: 'Trame radar' });
    expect(slider).toHaveValue('1');
    expect(screen.getByText('observé')).toBeInTheDocument();

    // Pause puis derniere trame : le nowcast est une prevision et le dit.
    const toggle = screen.getByRole('button', { name: /Pause|Lecture/ });
    if (toggle.getAttribute('aria-pressed') === 'true') {
      await user.click(toggle);
    }
    fireEvent.change(slider, { target: { value: '2' } });
    expect(await screen.findByText('prévu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lecture' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it("affiche un message d'indisponibilite si RainViewer echoue", async () => {
    vi.mocked(rainviewer.fetchRadarFrames).mockResolvedValue({
      ok: false,
      failure: { kind: 'network' },
    });
    render(<RadarMap place={place} />);
    expect(await screen.findByText('Radar indisponible pour l’instant.')).toBeInTheDocument();
  });
});
