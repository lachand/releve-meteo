import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TemperatureSpaghetti } from '../../domain/ensemble';
import { EnsembleSpaghetti } from './EnsembleSpaghetti';

const SPAGHETTI: TemperatureSpaghetti = {
  times: ['2026-09-28T10:00', '2026-09-28T11:00', '2026-09-28T12:00'],
  members: [
    [11, 12, 13],
    [11, 13, null],
    [11, 14, 18],
  ],
  median: [11, 13, 15],
  p10: [11, 12.2, 13.5],
  p90: [11, 13.8, 17.5],
  widest: { time: '2026-09-28T12:00', p10: 13.5, p90: 17.5 },
};

describe('EnsembleSpaghetti', () => {
  it('trace une trajectoire par membre, dit l etalement le plus lointain et que c est une prevision', () => {
    render(<EnsembleSpaghetti spaghetti={SPAGHETTI} />);
    expect(
      screen.getByRole('img', {
        name: /Trajectoires de température des 3 membres de l’ensemble ECMWF/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/neuf membres sur dix annoncent entre/)).toHaveTextContent(
      /lundi 12h, neuf membres sur dix annoncent entre 14 °C et 18 °C/,
    );
    expect(screen.getByText(/Prévision, pas mesure/)).toBeInTheDocument();
    expect(
      screen.getByText(/Plus les traits s’écartent, moins la température est sûre/),
    ).toBeInTheDocument();
  });

  it('se tait sur l etalement quand aucune heure n a de valeur', () => {
    render(<EnsembleSpaghetti spaghetti={{ ...SPAGHETTI, widest: null }} />);
    expect(screen.queryByText(/neuf membres sur dix annoncent/)).not.toBeInTheDocument();
    expect(screen.getByText(/Chaque trait fin est un membre/)).toBeInTheDocument();
  });

  it('dit quand l ensemble manque, au lieu de tracer un graphique vide', () => {
    render(<EnsembleSpaghetti spaghetti={null} />);
    expect(screen.getByText(/pas de trajectoires de température/)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
