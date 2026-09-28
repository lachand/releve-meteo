import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { VigilanceReport } from '../../data/repository';
import { summarizeVigilance } from '../../domain/vigilance';
import type { VigilanceBulletin } from '../../domain/vigilance';
import type { DatasetState } from '../hooks/useDataset';
import { VigilanceBanner, VigilanceLine } from './Vigilance';

// 15h27 a Paris.
const NOW = new Date('2026-09-28T13:27:00Z');
const RHONE = { code: '69', name: 'Rhône' };

const ORANGE_STORMS: VigilanceBulletin = {
  department: '69',
  issuedUtcMs: Date.parse('2026-09-28T14:00:00Z'),
  periods: [
    {
      phenomenon: 'thunderstorm',
      level: 3,
      beginUtcMs: Date.parse('2026-09-28T16:00:00Z'),
      endUtcMs: Date.parse('2026-09-28T22:00:00Z'),
      coastal: false,
    },
    {
      phenomenon: 'rain',
      level: 2,
      beginUtcMs: Date.parse('2026-09-28T10:00:00Z'),
      endUtcMs: Date.parse('2026-09-29T04:00:00Z'),
      coastal: false,
    },
    {
      phenomenon: 'wind',
      level: 1,
      beginUtcMs: Date.parse('2026-09-28T00:00:00Z'),
      endUtcMs: Date.parse('2026-09-29T22:00:00Z'),
      coastal: false,
    },
  ],
};

const GREEN: VigilanceBulletin = {
  ...ORANGE_STORMS,
  periods: ORANGE_STORMS.periods.map((period) => ({ ...period, level: 1 })),
};

function ready(bulletin: VigilanceBulletin | null, stale = false): DatasetState<VigilanceReport> {
  return {
    status: 'ready',
    value: { department: bulletin === null ? null : RHONE, bulletin },
    fetchedAt: 0,
    stale,
  };
}

describe('VigilanceBanner', () => {
  it('annonce le niveau le plus fort, le departement et chaque phenomene date', () => {
    render(
      <VigilanceBanner
        state={ready(ORANGE_STORMS)}
        summary={summarizeVigilance(ORANGE_STORMS, NOW)}
        now={NOW}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Vigilance orange · Rhône (69)' }),
    ).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Orange orages : aujourd’hui, de 18h à minuit (soyez très vigilant)',
      'Jaune pluie-inondation : en cours, jusqu’à demain 06h (soyez attentif)',
    ]);
    // Provenance : produit officiel, pas un calcul de Relevé.
    expect(screen.getByText(/Vigilance officielle de Météo-France/)).toHaveTextContent(
      'Bulletin de 16h.',
    );
    expect(screen.getByRole('link', { name: 'Carte officielle' })).toHaveAttribute(
      'href',
      'https://vigilance.meteofrance.fr/fr',
    );
  });

  it('precise le littoral, la copie hors ligne et un bulletin trop ancien', () => {
    const bulletin: VigilanceBulletin = {
      department: '33',
      issuedUtcMs: Date.parse('2026-09-27T04:00:00Z'),
      periods: [
        {
          phenomenon: 'waves',
          level: 2,
          beginUtcMs: Date.parse('2026-09-28T10:00:00Z'),
          endUtcMs: Date.parse('2026-09-28T22:00:00Z'),
          coastal: true,
        },
      ],
    };
    render(
      <VigilanceBanner
        state={ready(bulletin, true)}
        summary={summarizeVigilance(bulletin, NOW)}
        now={NOW}
      />,
    );
    expect(screen.getByRole('listitem')).toHaveTextContent(
      'Jaune vagues-submersion, sur le littoral : en cours, jusqu’à minuit',
    );
    expect(screen.getByText(/Vigilance officielle/)).toHaveTextContent(
      'Bulletin de hier 06h, copie enregistrée : le réseau ne répond pas.',
    );
    expect(screen.getByText(/date de plus d’un jour/)).toBeInTheDocument();
  });

  it('reste muet quand tout est vert ou que rien n est charge', () => {
    const { container, rerender } = render(
      <VigilanceBanner state={ready(GREEN)} summary={summarizeVigilance(GREEN, NOW)} now={NOW} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<VigilanceBanner state={{ status: 'loading' }} summary={null} now={NOW} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('VigilanceLine', () => {
  it.each<[string, DatasetState<VigilanceReport>, VigilanceBulletin | null, RegExp]>([
    ['chargement', { status: 'loading' }, null, /chargement/],
    [
      'echec',
      { status: 'error', failure: { kind: 'network' } },
      null,
      /indisponible pour l’instant/,
    ],
    ['hors departement', ready(null), null, /hors de France métropolitaine/],
    [
      'vert',
      ready(GREEN),
      GREEN,
      /verte pour Rhône \(69\), aujourd’hui et demain \(bulletin de 16h\)/,
    ],
    ['vigilance', ready(ORANGE_STORMS), ORANGE_STORMS, /orange pour Rhône \(69\) : détail en tête/],
  ])('%s', (_, state, bulletin, text) => {
    render(
      <VigilanceLine
        state={state}
        summary={bulletin === null ? null : summarizeVigilance(bulletin, NOW)}
        now={NOW}
      />,
    );
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Carte officielle' })).toBeInTheDocument();
  });
});
