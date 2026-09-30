import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { VerificationReference, VerificationReport } from '../../data/clients/verification';
import type { ModelVerification } from '../../domain/reliability';
import type { DatasetState } from '../hooks/useDataset';
import { ReliabilityPanel } from './ReliabilityPanel';

function readyState(
  report: Omit<VerificationReport, 'observedUntil'> & {
    readonly observedUntil?: VerificationReport['observedUntil'];
  },
): DatasetState<VerificationReport> {
  return {
    status: 'ready',
    value: { observedUntil: null, ...report },
    fetchedAt: 0,
    stale: false,
  };
}

const OBSERVED_TEMPERATURE_REFERENCE: VerificationReference = {
  variable: 'temperature',
  provenance: 'observed',
  window: { startDate: '2026-07-01', endDate: '2026-07-30' },
  station: {
    station: {
      id: '07480',
      name: 'Lyon / Bron',
      latitude: 45.7167,
      longitude: 4.95,
      elevation: 200,
    },
    distanceKm: 12.3,
    elevationDelta: -15,
  },
};

const ESTIMATED_PRECIPITATION_REFERENCE: VerificationReference = {
  variable: 'precipitation',
  provenance: 'estimated',
  window: { startDate: '2026-07-01', endDate: '2026-07-30' },
  station: null,
};

const VERIFICATIONS: readonly ModelVerification[] = [
  {
    model: 'arome',
    variable: 'temperature',
    leadDays: 1,
    stats: { mae: 1.2, bias: 0.3, rmse: 1.4, count: 40 },
    rain: null,
    sampleCount: 40,
    status: 'ready',
    reference: 'observed',
  },
  {
    model: 'arome',
    variable: 'temperature',
    leadDays: 2,
    stats: null,
    rain: null,
    sampleCount: 3,
    status: 'collecting',
    reference: 'observed',
  },
  {
    model: 'arpege',
    variable: 'temperature',
    leadDays: 1,
    stats: { mae: 2, bias: -0.2, rmse: 2.2, count: 35 },
    rain: null,
    sampleCount: 35,
    status: 'ready',
    reference: 'observed',
  },
];

describe('ReliabilityPanel', () => {
  it('ne rend rien a l etat idle', () => {
    const { container } = render(<ReliabilityPanel state={{ status: 'idle' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('affiche un message de chargement a l etat loading', () => {
    const { container } = render(<ReliabilityPanel state={{ status: 'loading' }} />);
    expect(
      screen.getByText('Rapprochement des prévisions passées et des mesures…'),
    ).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('affiche une alerte a l etat error, sans faire disparaitre les previsions deja affichees', () => {
    render(<ReliabilityPanel state={{ status: 'error', failure: { kind: 'network' } }} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(
      'Vérification indisponible : le service des prévisions passées ou des mesures ne répond pas.',
    );
  });

  it('affiche un message d attente quand aucune statistique n est encore prete (en collecte)', () => {
    const collecting: readonly ModelVerification[] = VERIFICATIONS.map((v) => ({
      ...v,
      stats: null,
      status: 'collecting',
    }));
    render(
      <ReliabilityPanel
        state={readyState({
          verifications: collecting,
          references: [OBSERVED_TEMPERATURE_REFERENCE],
        })}
      />,
    );
    expect(
      screen.getByText(/Pas encore assez d’heures appariées pour noter les modèles ici\./),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('redige la phrase de reference pour une station observee', () => {
    render(
      <ReliabilityPanel
        state={readyState({
          verifications: VERIFICATIONS,
          references: [OBSERVED_TEMPERATURE_REFERENCE],
        })}
      />,
    );
    const item = document.querySelector('li[data-provenance="observed"]');
    expect(item).not.toBeNull();
    expect(item?.textContent).toBe(
      'Température : mesures de la station Lyon / Bron (12,3 km, −15 m), du 1 juillet au 30 juillet.',
    );
  });

  it('dit jusqu a quelle heure la station a mesure, et que les scores suivent les heures', () => {
    render(
      <ReliabilityPanel
        state={readyState({
          verifications: VERIFICATIONS,
          references: [OBSERVED_TEMPERATURE_REFERENCE],
          observedUntil: '2026-09-28T12:00',
        })}
      />,
    );
    expect(screen.getByText(/Dernière mesure de la station : lundi 12h/)).toBeInTheDocument();
    expect(screen.getByText(/Les scores se mettent à jour toutes les heures/)).toBeInTheDocument();
  });

  it('ne parle pas de derniere mesure quand la reference est la reanalyse', () => {
    render(
      <ReliabilityPanel
        state={readyState({
          verifications: VERIFICATIONS,
          references: [ESTIMATED_PRECIPITATION_REFERENCE],
        })}
      />,
    );
    expect(screen.queryByText(/Dernière mesure de la station/)).not.toBeInTheDocument();
  });

  it('redige la phrase de reference pour une reanalyse ERA5 et affiche la mise en garde', () => {
    render(
      <ReliabilityPanel
        state={readyState({
          verifications: VERIFICATIONS,
          references: [OBSERVED_TEMPERATURE_REFERENCE, ESTIMATED_PRECIPITATION_REFERENCE],
        })}
      />,
    );
    const item = document.querySelector('li[data-provenance="estimated"]');
    expect(item?.textContent).toBe(
      'Précipitations : réanalyse ERA5, une estimation et non une mesure, du 1 juillet au 30 juillet.',
    );
    expect(
      screen.getByText(/ERA5 est produite par l’ECMWF sur une maille d’environ 30 km/),
    ).toBeInTheDocument();
  });

  it('n affiche pas la mise en garde ERA5 quand toutes les references sont observees', () => {
    render(
      <ReliabilityPanel
        state={readyState({
          verifications: VERIFICATIONS,
          references: [OBSERVED_TEMPERATURE_REFERENCE],
        })}
      />,
    );
    expect(screen.queryByText(/ERA5 est produite/)).not.toBeInTheDocument();
  });

  it('rend un tableau par grandeur avec une ligne par modele verifie', () => {
    render(
      <ReliabilityPanel
        state={readyState({
          verifications: VERIFICATIONS,
          references: [OBSERVED_TEMPERATURE_REFERENCE],
        })}
      />,
    );
    const aromeRow = screen.getByText('AROME').closest('tr');
    expect(aromeRow).not.toBeNull();
    expect(aromeRow?.textContent).toContain('1,2'); // erreur J+1
    expect(aromeRow?.textContent).toContain('en collecte'); // J+2, sans statistiques
    expect(aromeRow?.textContent).toContain('+0,3 °C'); // biais J+1

    const arpegeRow = screen.getByText('ARPEGE').closest('tr');
    expect(arpegeRow?.textContent).toContain('2,0');
  });

  it('marque la valeur la plus juste a chaque echeance', () => {
    render(
      <ReliabilityPanel
        state={readyState({
          verifications: VERIFICATIONS,
          references: [OBSERVED_TEMPERATURE_REFERENCE],
        })}
      />,
    );
    const aromeRow = screen.getByText('AROME').closest('tr') as HTMLElement;
    const arpegeRow = screen.getByText('ARPEGE').closest('tr') as HTMLElement;
    // AROME (1,2 °C) est plus juste que ARPEGE (2,0 °C) a J+1.
    expect(aromeRow.querySelector('[data-best="true"]')).not.toBeNull();
    expect(arpegeRow.querySelector('[data-best="true"]')).toBeNull();
  });

  it('rappelle que le calcul reste local et alimente la selection automatique', () => {
    render(
      <ReliabilityPanel
        state={readyState({
          verifications: VERIFICATIONS,
          references: [OBSERVED_TEMPERATURE_REFERENCE],
        })}
      />,
    );
    expect(
      screen.getByText(/Calcul effectué sur cet appareil à partir de données publiques/),
    ).toBeInTheDocument();
  });
});
