import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { StationReport } from '../../data/repository';
import type { StationCheck, StationRecord } from '../../domain/stationCheck';
import type { StationMatch } from '../../domain/stations';
import { measure } from '../../../tests/factories';
import { formatSignedOneDecimal } from '../format';
import type { DatasetState } from '../hooks/useDataset';
import { StationCheckPanel, StationLine } from './StationCheck';

const MATCH: StationMatch = {
  station: { id: '07480', name: 'Lyon / Bron', latitude: 45.72, longitude: 4.95, elevation: 200 },
  distanceKm: 7.3,
  elevationDelta: -38,
};

function latest(values: Partial<Record<Exclude<keyof StationRecord, 'time'>, number | null>>) {
  const m = (field: Exclude<keyof StationRecord, 'time'>, fallback: number | null) =>
    measure(field in values ? (values[field] ?? null) : fallback, 'observed');
  return {
    time: '2026-09-28T12:00',
    temperature: m('temperature', 26),
    humidity: m('humidity', 37),
    precipitation: m('precipitation', null),
    windSpeed: m('windSpeed', 15),
    windDirection: m('windDirection', 170),
    windGust: m('windGust', null),
    pressure: m('pressure', 1021),
  } satisfies StationRecord;
}

function ready(match: StationMatch | null = MATCH): DatasetState<StationReport> {
  return { status: 'ready', value: { match, records: [] }, fetchedAt: 0, stale: false };
}

const CHECK: StationCheck = {
  latest: latest({}),
  ageMinutes: 207,
  stale: false,
  gaps: [
    { model: 'icon_d2', temperature: 25.8, gap: -0.2, recentMeanGap: 0.1, recentPairs: 6 },
    { model: 'arome', temperature: 25.6, gap: -0.4, recentMeanGap: -0.9, recentPairs: 6 },
    { model: 'ecmwf', temperature: 23.1, gap: -2.9, recentMeanGap: null, recentPairs: 2 },
    { model: 'gfs', temperature: null, gap: null, recentMeanGap: null, recentPairs: 0 },
  ],
};

describe('StationLine', () => {
  it.each([
    [{ status: 'idle' } as const, 'Lecture du dernier relevé de la station…'],
    [{ status: 'loading' } as const, 'Lecture du dernier relevé de la station…'],
    [
      { status: 'error', failure: { kind: 'network', detail: 'hors ligne' } } as const,
      'Relevé de station indisponible pour l’instant.',
    ],
  ])('affiche un etat d attente ou d erreur explicite (%o)', (state, text) => {
    render(<StationLine state={state} check={null} activeModel="arome" onDetail={vi.fn()} />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('dit qu aucune station ne represente le lieu', () => {
    render(<StationLine state={ready(null)} check={null} activeModel="arome" onDetail={vi.fn()} />);
    expect(screen.getByText(/Aucune station de mesure représentative/)).toHaveTextContent(
      'moins de 30 km et 200 m de dénivelé',
    );
  });

  it('dit que la station se tait quand aucun releve recent n existe', () => {
    render(<StationLine state={ready()} check={null} activeModel="arome" onDetail={vi.fn()} />);
    expect(
      screen.getByText(/La station Lyon \/ Bron n’a publié aucun relevé de température/),
    ).toBeInTheDocument();
  });

  it('confronte la mesure a la valeur du modele retenu et ouvre le detail', async () => {
    const onDetail = vi.fn();
    render(<StationLine state={ready()} check={CHECK} activeModel="arome" onDetail={onDetail} />);
    const text = screen.getByText(/Mesuré à/);
    expect(text).toHaveTextContent(
      'Mesuré à Lyon / Bron à 12h : 26 °C (il y a 3 h 27). AROME donnait 25,6 °C ici à la même heure (écart −0,4 °C).',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Tous les modèles face à la mesure' }),
    );
    expect(onDetail).toHaveBeenCalledOnce();
  });

  it("n'invente pas d'ecart quand le modele retenu n'a pas de valeur a cette heure", () => {
    render(<StationLine state={ready()} check={CHECK} activeModel="gfs" onDetail={vi.fn()} />);
    expect(screen.getByText(/Mesuré à/)).not.toHaveTextContent('donnait');
  });

  it('previent quand le releve est ancien', () => {
    render(
      <StationLine
        state={ready()}
        check={{ ...CHECK, ageMinutes: 480, stale: true }}
        activeModel="arome"
        onDetail={vi.fn()}
      />,
    );
    expect(screen.getByText(/Relevé ancien/)).toBeInTheDocument();
  });
});

describe('StationCheckPanel', () => {
  it('affiche les etats sans releve comme la ligne', () => {
    render(
      <StationCheckPanel
        state={{ status: 'loading' }}
        check={null}
        activeModel="arome"
        windUnit="kmh"
      />,
    );
    expect(screen.getByText('Lecture du dernier relevé de la station…')).toBeInTheDocument();
  });

  it('presente la station, les mesures et chaque modele du plus proche au plus eloigne', () => {
    render(<StationCheckPanel state={ready()} check={CHECK} activeModel="arome" windUnit="kmh" />);
    expect(screen.getByText(/Station/)).toHaveTextContent(
      'Station Lyon / Bron, à 7,3 km du lieu, 38 m plus bas. Relevé de 12h, il y a 3 h 27.',
    );

    const measures = within(screen.getByLabelText('Mesures de 12h'));
    expect(measures.getByText('Température').nextSibling).toHaveTextContent('26°C');
    expect(measures.getByText('Vent').nextSibling).toHaveTextContent('S 15km/h');
    // Rafale et pluie non mesurees : tiret de valeur absente, jamais zero.
    expect(measures.getByText('Rafales').nextSibling).toHaveTextContent('–');
    expect(measures.getByText('Pluie').nextSibling).toHaveTextContent('–');

    const table = screen.getByRole('table', { name: /face à la mesure/ });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual([
      'ICON-D2',
      'AROMEretenu',
      'ECMWF IFS',
      'GFS',
    ]);
    expect(rows[1]).toHaveTextContent('25,6 °C−0,4 °C−0,9 °C trop froid');
    expect(rows[0]).toHaveTextContent('au plus près de la mesure');
    expect(rows[2]).toHaveTextContent('trop peu d’heures');
    expect(rows[3]).toHaveTextContent('GFS––trop peu d’heures');
  });

  it('convertit le vent dans l unite choisie et signale un vent non mesure', () => {
    const { rerender } = render(
      <StationCheckPanel state={ready()} check={CHECK} activeModel="arome" windUnit="kt" />,
    );
    const measures = () => within(screen.getByLabelText('Mesures de 12h'));
    expect(measures().getByText('Vent').nextSibling).toHaveTextContent('S 8kt');
    rerender(
      <StationCheckPanel
        state={ready()}
        check={{ ...CHECK, latest: latest({ windSpeed: null }) }}
        activeModel="arome"
        windUnit="kmh"
      />,
    );
    expect(measures().getByText('Vent').nextSibling).toHaveTextContent('–');
  });

  it.each([
    [120, '120 m plus haut'],
    [4, 'même altitude'],
    [null, 'altitude inconnue'],
  ])('decrit le denivele de la station (%s m)', (elevationDelta, phrase) => {
    render(
      <StationCheckPanel
        state={ready({ ...MATCH, elevationDelta })}
        check={CHECK}
        activeModel="arome"
        windUnit="kmh"
      />,
    );
    expect(screen.getByText(/Station/)).toHaveTextContent(phrase);
  });
});

describe('formatSignedOneDecimal', () => {
  it('signe les ecarts avec un moins typographique, sans « −0,0 »', () => {
    expect(formatSignedOneDecimal(1.26)).toBe('+1,3');
    expect(formatSignedOneDecimal(-0.94)).toBe('−0,9');
    expect(formatSignedOneDecimal(-0.04)).toBe('0,0');
    expect(formatSignedOneDecimal(0)).toBe('0,0');
    expect(formatSignedOneDecimal(null)).toBe('–');
  });
});
