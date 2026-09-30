import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DryWindowPanel } from './DryWindowPanel';

describe('DryWindowPanel', () => {
  it('ecrit la fenetre, son modele, et les criteres du mot « sec »', () => {
    render(
      <DryWindowPanel
        window={{
          status: 'window',
          start: '2026-09-28T14:00',
          end: '2026-09-28T18:00',
          hours: 4,
          models: ['arome'],
        }}
        windUnit="kmh"
      />,
    );
    expect(
      screen.getByText('Meilleur créneau sec : de 14h à 18h (4 h), selon AROME.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/au plus 0,2\smm par heure, avec des rafales sous 50\skm\/h/),
    ).toBeInTheDocument();
  });

  it('donne le seuil de rafales dans l unite choisie', () => {
    render(<DryWindowPanel window={{ status: 'none', reason: 'wet-or-windy' }} windUnit="kt" />);
    expect(screen.getByText(/rafales sous 27\skt/)).toBeInTheDocument();
    expect(screen.getByText(/Pas de créneau sec de 2 heures/)).toBeInTheDocument();
  });
});
