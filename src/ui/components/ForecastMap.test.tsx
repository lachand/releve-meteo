import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { gridPoints } from '../../domain/grid';
import type { ForecastGrid, GridSeries } from '../../domain/grid';
import type { Place } from '../../domain/types';
import type { DatasetState } from '../hooks/useDataset';
import { ForecastMap } from './ForecastMap';

const place: Place = {
  id: '45.7485:4.8467',
  name: 'Lyon',
  latitude: 45.7485,
  longitude: 4.8467,
  elevation: 170,
  admin: 'Rhône',
  alias: null,
};

// 15 h 27 locale.
const NOW = new Date('2026-09-28T13:27:00Z');
const POINTS = gridPoints(place, 3, 12.5);
const TIMES = ['2026-09-28T14:00', '2026-09-28T15:00', '2026-09-28T16:00', '2026-09-28T17:00'];

function series(fn: (time: number, point: number) => number | null): GridSeries {
  return TIMES.map((_, t) => POINTS.map((__, p) => fn(t, p)));
}

function ready(grid: Partial<ForecastGrid> = {}): DatasetState<ForecastGrid> {
  return {
    status: 'ready',
    fetchedAt: 0,
    stale: false,
    value: {
      model: 'arome',
      provenance: 'forecast',
      points: POINTS,
      stepKm: 12.5,
      times: TIMES,
      // Derniere heure hors portee du modele.
      temperature: series((t, p) => (t === 3 ? null : 18 + t + p / 2)),
      precipitation: series((t, p) => (t === 3 ? null : t === 2 && p < 3 ? 1.5 + p : 0)),
      windSpeed: series(() => 10),
      windDirection: series(() => 200),
      ...grid,
    },
  };
}

describe('ForecastMap', () => {
  it('rend une carte nommee et annonce le chargement', () => {
    render(<ForecastMap place={place} model="arome" state={{ status: 'loading' }} now={NOW} />);
    expect(screen.getByLabelText('Carte de prévision AROME autour de Lyon')).toBeInTheDocument();
    expect(screen.getByText('Chargement de la carte de prévision…')).toBeInTheDocument();
  });

  it("dit que la carte est indisponible en cas d'echec", () => {
    render(
      <ForecastMap
        place={place}
        model="arome"
        state={{ status: 'error', failure: { kind: 'network' } }}
        now={NOW}
      />,
    );
    expect(screen.getByText('Carte de prévision indisponible pour l’instant.')).toBeInTheDocument();
  });

  it('dit quand le modele ne couvre pas la zone', () => {
    render(
      <ForecastMap
        place={place}
        model="icon_d2"
        state={ready({ temperature: series(() => null) })}
        now={NOW}
      />,
    );
    expect(
      screen.getByText('ICON-D2 ne fournit aucune valeur pour cette zone en ce moment.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it("part de l'heure en cours, montre la pluie s'il en tombe, et borne le curseur a la portee", () => {
    render(<ForecastMap place={place} model="arome" state={ready()} now={NOW} />);
    const slider = screen.getByRole('slider', { name: 'Échéance de la carte' });
    // 14 h est passee : la carte commence a 15 h ; 17 h est hors portee.
    expect(slider).toHaveAttribute('min', '1');
    expect(slider).toHaveAttribute('max', '2');
    expect(slider).toHaveValue('1');
    expect(slider).toHaveAttribute('aria-valuetext', 'lundi 15h, heure en cours');
    expect(screen.getByRole('button', { name: 'Pluie' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Aucune pluie prévue sur les 9 cases.')).toBeInTheDocument();

    fireEvent.change(slider, { target: { value: '2' } });
    expect(
      screen.getByText('Pluie prévue sur 3 cases sur 9, jusqu’à 3,5 mm en une heure.'),
    ).toBeInTheDocument();
    expect(slider).toHaveAttribute('aria-valuetext', 'lundi 16h, dans 1 h');
    expect(
      screen.getByText(/Au-delà de lundi 16h, AROME ne couvre plus cette zone/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Légende de la pluie, mm en une heure' }),
    ).toHaveTextContent('dès 0,1');
  });

  it('bascule sur la temperature et affiche les bornes de son echelle', async () => {
    const user = userEvent.setup();
    render(<ForecastMap place={place} model="arome" state={ready()} now={NOW} />);
    await user.click(screen.getByRole('button', { name: 'Température' }));
    expect(screen.getByRole('button', { name: 'Température' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // 15 h : 19 + p/2 pour p de 0 a 8.
    expect(screen.getByText('De 19 à 23 °C sur la zone.')).toBeInTheDocument();
    // Echelle sur toute la periode couverte (15 h et 16 h).
    expect(screen.getByText('19 °C')).toBeInTheDocument();
    expect(screen.getByText('24 °C')).toBeInTheDocument();
  });

  it('commence sur la temperature quand aucune pluie n est prevue', () => {
    render(
      <ForecastMap
        place={place}
        model="arome"
        state={ready({ precipitation: series(() => 0) })}
        now={NOW}
      />,
    );
    expect(screen.getByRole('button', { name: 'Température' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('avance d une heure en lecture', async () => {
    const user = userEvent.setup();
    render(<ForecastMap place={place} model="arome" state={ready()} now={NOW} />);
    await user.click(screen.getByRole('button', { name: 'Lecture' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true');
    expect(
      await screen.findByText(/Pluie prévue sur 3 cases/, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
  });
});
