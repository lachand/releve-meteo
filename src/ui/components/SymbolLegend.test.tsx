import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SymbolLegend } from './SymbolLegend';

describe('SymbolLegend', () => {
  it('associe chaque symbole de temps present a son libelle francais', () => {
    render(<SymbolLegend />);
    const list = screen.getByRole('list', { name: 'Symboles de temps présent' });
    expect(within(list).getByText('Pluie')).toBeInTheDocument();
    expect(within(list).getByText('Orage avec grêle')).toBeInTheDocument();
    expect(within(list).getByText('Ciel dégagé')).toBeInTheDocument();
  });

  it('associe chaque barbule a son libelle de vitesse', () => {
    render(<SymbolLegend />);
    const list = screen.getByRole('list', { name: 'Barbules de vent' });
    expect(within(list).getByText('Vent d’ouest, calme')).toBeInTheDocument();
    expect(within(list).getByText('Vent d’ouest, 50 nœuds')).toBeInTheDocument();
  });

  it('rappelle que le symbole ne porte jamais seul l information', () => {
    render(<SymbolLegend />);
    expect(screen.getByText(/Le cercle de station se remplit par huitièmes/)).toBeInTheDocument();
  });
});
