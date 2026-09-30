import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MountainOutlook } from '../../domain/mountainOutlook';
import { MountainPanel } from './MountainPanel';

const OUTLOOK: MountainOutlook = {
  freezingNow: 2050,
  relativeNow: 550,
  freezingMin: 1800,
  freezingMax: 2375,
  freezingModel: 'arome',
  snowCm: 3.4,
  snowHours: 3,
  firstSnow: '2026-09-28T14:00',
  snowModels: ['arome'],
};

describe('MountainPanel', () => {
  it('ecrit l isotherme et la neige, chacune avec son modele, et explique les mots', () => {
    render(<MountainPanel outlook={OUTLOOK} />);
    expect(
      screen.getByText(/L’isotherme 0\s°C est à 2\s050\sm, 550\sm au-dessus de vous/),
    ).toHaveTextContent('selon AROME');
    expect(screen.getByText(/Neige : 3,4\scm sur 72 h/)).toHaveTextContent('selon AROME');
    expect(screen.getByText(/au-dessus, la précipitation tombe en neige/)).toBeInTheDocument();
  });

  it('dit l absence de valeur plutot que de l inventer', () => {
    render(
      <MountainPanel
        outlook={{
          ...OUTLOOK,
          freezingNow: null,
          relativeNow: null,
          freezingMin: null,
          freezingMax: null,
          freezingModel: null,
          snowCm: null,
        }}
      />,
    );
    expect(screen.getByText(/Isotherme 0\s°C : pas de valeur des modèles/)).toBeInTheDocument();
    expect(screen.getByText('Neige : pas de valeur des modèles.')).toBeInTheDocument();
  });
});
