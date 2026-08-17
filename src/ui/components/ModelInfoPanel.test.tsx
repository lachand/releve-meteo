import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ForecastBundle, HourlyPoint, Place, TerrainProfile } from '../../domain/types';
import { ModelInfoPanel } from './ModelInfoPanel';

const place: Place = {
  id: '45.4900:5.4700',
  name: 'Val de Virieu',
  latitude: 45.49,
  longitude: 5.47,
  elevation: 468,
  admin: 'Isère',
  alias: null,
};

const plain: TerrainProfile = { kind: 'plain', elevation: 200, distanceToCoastKm: 100 };

function point(temperature: number, windSpeed: number): HourlyPoint {
  const measure = (value: number) => ({ value, provenance: 'forecast' as const });
  return {
    time: '2026-08-17T14:00',
    temperature: measure(temperature),
    precipitation: measure(0),
    windSpeed: measure(windSpeed),
    windGust: measure(windSpeed * 2),
    windDirection: measure(180),
    pressure: measure(1013),
    dewPoint: measure(8),
    cloudCover: measure(50),
    radiation: measure(200),
    weatherCode: 1,
  };
}

const bundle: ForecastBundle = {
  place,
  fetchedAt: 0,
  timeline: ['2026-08-17T14:00'],
  series: {
    arome: { model: 'arome', hourly: [point(14, 10)], daily: [] },
    arpege: { model: 'arpege', hourly: [point(14.5, 11)], daily: [] },
  },
};

describe('ModelInfoPanel', () => {
  it('affiche le modele actif, son producteur et son echeance', () => {
    render(
      <ModelInfoPanel
        bundle={bundle}
        nowIndex={0}
        activeModel="arome"
        available={['arome', 'arpege']}
        terrain={plain}
        onCompareClick={vi.fn()}
      />,
    );
    expect(screen.getAllByText(/AROME/).length).toBeGreaterThan(0);
    expect(screen.getByText('Météo-France')).toBeInTheDocument();
    expect(screen.getAllByText(/36 h/).length).toBeGreaterThan(0);
  });

  it('affiche le niveau de confiance et les ecarts entre modeles', () => {
    render(
      <ModelInfoPanel
        bundle={bundle}
        nowIndex={0}
        activeModel="arome"
        available={['arome', 'arpege']}
        terrain={plain}
        onCompareClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Élevée')).toBeInTheDocument();
    expect(screen.getByText('0,5 °C')).toBeInTheDocument();
  });

  it('appelle onCompareClick au clic sur le bouton comparer', async () => {
    const onCompareClick = vi.fn();
    const user = userEvent.setup();
    render(
      <ModelInfoPanel
        bundle={bundle}
        nowIndex={0}
        activeModel="arome"
        available={['arome', 'arpege']}
        terrain={plain}
        onCompareClick={onCompareClick}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Comparer les modèles' }));
    expect(onCompareClick).toHaveBeenCalledOnce();
  });
});
