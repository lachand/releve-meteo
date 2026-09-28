import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AirQualitySeries } from '../../data/clients/airQuality';
import { MISSING } from '../format';
import type { DatasetState } from '../hooks/useDataset';
import { AirQualityPanel } from './AirQualityPanel';

function buildSeries(overrides: Partial<AirQualitySeries> = {}): AirQualitySeries {
  const timeline = ['2026-08-17T13:00', '2026-08-17T14:00'];
  const nulls = timeline.map(() => null);
  return {
    timeline,
    europeanAqi: nulls,
    pm2_5: nulls,
    pm10: nulls,
    ozone: nulls,
    nitrogenDioxide: nulls,
    uvIndex: nulls,
    pollen: {
      alder: nulls,
      birch: nulls,
      grass: nulls,
      mugwort: nulls,
      olive: nulls,
      ragweed: nulls,
    },
    ...overrides,
  };
}

function readyState(series: AirQualitySeries): DatasetState<AirQualitySeries> {
  return { status: 'ready', value: series, fetchedAt: 0, stale: false };
}

describe('AirQualityPanel', () => {
  it('ne rend rien a l etat idle', () => {
    const { container } = render(
      <AirQualityPanel state={{ status: 'idle' }} hour="2026-08-17T14:00" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('affiche un squelette de chargement a l etat loading', () => {
    const { container } = render(
      <AirQualityPanel state={{ status: 'loading' }} hour="2026-08-17T14:00" />,
    );
    const skeleton = container.querySelector('[aria-busy="true"]');
    expect(skeleton).not.toBeNull();
    expect(skeleton).toHaveAttribute('aria-label', "Chargement de la qualité de l'air");
  });

  it('affiche un message d indisponibilite a l etat error', () => {
    render(
      <AirQualityPanel
        state={{ status: 'error', failure: { kind: 'network' } }}
        hour="2026-08-17T14:00"
      />,
    );
    expect(screen.getByText('Qualité de l’air indisponible pour le moment.')).toBeInTheDocument();
  });

  it('affiche l indice et les polluants a l heure demandee, a l etat ready', () => {
    const series = buildSeries({
      europeanAqi: [10, 20],
      pm2_5: [4, 8.4],
      pm10: [9, 12],
      ozone: [50, 80],
      nitrogenDioxide: [4, 9],
    });
    render(<AirQualityPanel state={readyState(series)} hour="2026-08-17T14:00" />);
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('Bon')).toBeInTheDocument();
    expect(screen.getByText('8,4')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('affiche MISSING pour l indice quand l heure demandee n est pas dans la serie', () => {
    const series = buildSeries({ europeanAqi: [10, 20] });
    render(<AirQualityPanel state={readyState(series)} hour="2026-08-17T20:00" />);
    const aqiValue = screen
      .getByText('indice européen, maintenant')
      .closest('p')
      ?.querySelector('[data-donnee]');
    expect(aqiValue).not.toBeNull();
    expect(aqiValue?.textContent).toBe(MISSING);
    expect(aqiValue?.textContent).not.toBe('0');
  });

  it('annonce l absence de pollen notable quand toutes les concentrations restent sous le seuil', () => {
    const series = buildSeries();
    render(<AirQualityPanel state={readyState(series)} hour="2026-08-17T14:00" />);
    expect(
      screen.getByText('Pollens : aucun en quantité notable aujourd’hui.'),
    ).toBeInTheDocument();
  });

  it('cite chaque pollen notable avec son niveau', () => {
    const series = buildSeries({ pollen: { ...buildSeries().pollen, grass: [0.5, 25] } });
    render(<AirQualityPanel state={readyState(series)} hour="2026-08-17T14:00" />);
    expect(screen.getByText('Pollens : graminées moyen.')).toBeInTheDocument();
  });

  it('cite la source Copernicus CAMS Europe', () => {
    render(<AirQualityPanel state={readyState(buildSeries())} hour="2026-08-17T14:00" />);
    expect(screen.getByText('Prévision CAMS Europe (Copernicus)')).toBeInTheDocument();
  });
});
