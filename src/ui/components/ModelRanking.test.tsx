import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ModelRanking as Ranking } from '../../domain/modelSelection';
import { MISSING } from '../format';
import { ModelRankingTable } from './ModelRanking';

const ranking: readonly Ranking[] = [
  {
    model: 'arome',
    score: 8.4,
    eligible: true,
    ineligibility: null,
    criteria: [
      { kind: 'resolution', points: 8.4, detail: { resolutionKm: 1.3, terrain: 'plain' } },
    ],
  },
  {
    model: 'arpege',
    score: 5.1,
    eligible: true,
    ineligibility: null,
    criteria: [{ kind: 'resolution', points: 5.1, detail: { resolutionKm: 10, terrain: 'plain' } }],
  },
  {
    model: 'icon_d2',
    score: 0,
    eligible: false,
    ineligibility: 'outOfDomain',
    criteria: [],
  },
];

describe('ModelRankingTable', () => {
  it('numerote les modeles eligibles selon leur ordre dans le classement', () => {
    render(<ModelRankingTable ranking={ranking} verification={[]} activeModel="arome" />);
    const aromeRow = screen.getByText('AROME').closest('tr');
    const arpegeRow = screen.getByText('ARPEGE').closest('tr');
    expect(aromeRow?.querySelector('[data-donnee]')?.textContent).toBe('1');
    expect(arpegeRow?.querySelector('[data-donnee]')?.textContent).toBe('2');
  });

  it('n attribue aucun rang chiffre a un modele inelegible, MISSING a la place', () => {
    render(<ModelRankingTable ranking={ranking} verification={[]} activeModel="arome" />);
    const iconRow = screen.getByText('ICON-D2').closest('tr');
    expect(iconRow?.querySelector('[data-donnee]')?.textContent).toBe(MISSING);
  });

  it('affiche la raison d inegilibilite a la place du score', () => {
    render(<ModelRankingTable ranking={ranking} verification={[]} activeModel="arome" />);
    const iconRow = screen.getByText('ICON-D2').closest('tr');
    expect(iconRow?.textContent).toContain('ce lieu est hors de son domaine de calcul');
  });

  it('marque la ligne du modele actif avec data-active', () => {
    render(<ModelRankingTable ranking={ranking} verification={[]} activeModel="arome" />);
    expect(screen.getByText('AROME').closest('tr')).toHaveAttribute('data-active', 'true');
    expect(screen.getByText('ARPEGE').closest('tr')).not.toHaveAttribute('data-active');
  });

  it('marque chaque ligne avec son eligibilite', () => {
    render(<ModelRankingTable ranking={ranking} verification={[]} activeModel="arome" />);
    expect(screen.getByText('AROME').closest('tr')).toHaveAttribute('data-eligible', 'true');
    expect(screen.getByText('ICON-D2').closest('tr')).toHaveAttribute('data-eligible', 'false');
  });
});
