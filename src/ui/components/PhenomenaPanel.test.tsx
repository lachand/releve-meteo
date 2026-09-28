import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PhenomenonEpisode, PhenomenonKind, RiskLevel } from '../../domain/phenomena';
import type { ModelId } from '../../domain/types';
import { PhenomenaPanel } from './PhenomenaPanel';

function episode(
  kind: PhenomenonKind,
  level: RiskLevel,
  overrides: {
    readonly start?: string;
    readonly end?: string;
    readonly peakValue?: number | null;
    readonly cape?: number | null;
    readonly model?: ModelId | null;
  } = {},
): PhenomenonEpisode {
  const start = overrides.start ?? '2026-08-17T14:00';
  return {
    kind,
    level,
    start,
    end: overrides.end ?? start,
    peakTime: start,
    evidence: {
      peakValue: overrides.peakValue ?? null,
      cape: overrides.cape ?? null,
      weatherCode: null,
    },
    model: 'model' in overrides ? (overrides.model ?? null) : 'arome',
  };
}

describe('PhenomenaPanel', () => {
  it('affiche la phrase de calme et cite tous les phenomenes surveilles quand la liste est vide', () => {
    render(<PhenomenaPanel episodes={[]} horizonHours={48} />);
    const sentence = screen.getByText(/Aucun phénomène notable prévu sur 48 heures/);
    expect(sentence).toBeInTheDocument();
    for (const word of [
      'orage',
      'forte pluie',
      'neige',
      'gel',
      'brouillard',
      'vent fort',
      'chaleur',
    ]) {
      expect(sentence.textContent).toContain(word);
    }
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('reprend l horizon fourni dans la phrase de calme', () => {
    render(<PhenomenaPanel episodes={[]} horizonHours={24} />);
    expect(screen.getByText(/sur 24 heures/)).toBeInTheDocument();
  });

  it('liste chaque episode avec son libelle, son niveau de risque et sa periode', () => {
    const episodes = [
      episode('thunderstorm', 'high', { cape: 800 }),
      episode('frost', 'low', { peakValue: -1, start: '2026-08-18T05:00' }),
    ];
    render(<PhenomenaPanel episodes={episodes} horizonHours={48} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);

    expect(items[0]).toHaveAttribute('data-level', 'high');
    expect(items[0]?.textContent).toContain('Orage');
    expect(items[0]?.textContent).toContain('risque fort');
    expect(items[0]?.textContent).toContain('800');

    expect(items[1]).toHaveAttribute('data-level', 'low');
    expect(items[1]?.textContent).toContain('Gel');
    expect(items[1]?.textContent).toContain('risque faible');
  });

  it('cite le modele source quand il est connu', () => {
    render(
      <PhenomenaPanel
        episodes={[episode('fog', 'moderate', { model: 'icon_d2' })]}
        horizonHours={48}
      />,
    );
    expect(screen.getByText(/selon ICON-D2/)).toBeInTheDocument();
  });

  it('n affiche pas de source quand le modele est inconnu', () => {
    render(
      <PhenomenaPanel episodes={[episode('fog', 'moderate', { model: null })]} horizonHours={48} />,
    );
    expect(screen.queryByText(/selon /)).not.toBeInTheDocument();
  });
});
