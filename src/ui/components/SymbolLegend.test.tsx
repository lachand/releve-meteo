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

  it('explique chaque fleche de vent, ou elle va et d ou vient le vent', () => {
    render(<SymbolLegend />);
    const list = screen.getByRole('list', { name: 'Flèches de vent' });
    expect(within(list).getByText('Calme, moins de 5 km/h')).toBeInTheDocument();
    expect(within(list).getByText('Vent du sud modéré : il va vers le nord')).toBeInTheDocument();
  });

  it('rappelle que le symbole ne porte jamais seul l information', () => {
    render(<SymbolLegend />);
    expect(screen.getByText(/Plus il y a de gouttes ou de flocons/)).toBeInTheDocument();
  });

  it('montre la lune a la place du soleil, la nuit', () => {
    const { container } = render(<SymbolLegend />);
    expect(screen.getByText('Ciel dégagé, la nuit')).toBeInTheDocument();
    expect(container.querySelectorAll('svg[data-night]')).toHaveLength(3);
  });
});
