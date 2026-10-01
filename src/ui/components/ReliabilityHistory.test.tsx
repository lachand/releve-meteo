import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DailyError, ModelVerification } from '../../domain/reliability';
import type { ModelId } from '../../domain/types';
import { ReliabilityHistory } from './ReliabilityHistory';

function days(from: number, to: number, mae: number): DailyError[] {
  return Array.from({ length: to - from + 1 }, (_, i) => ({
    date: `2026-09-${String(from + i).padStart(2, '0')}`,
    mae,
    count: 24,
  }));
}

function entry(
  model: ModelId,
  daily: readonly DailyError[] | null,
  variable: ModelVerification['variable'] = 'temperature',
  leadDays = 1,
): ModelVerification {
  return {
    model,
    variable,
    leadDays,
    stats: { mae: 1, bias: 0, rmse: 1, count: 40 },
    rain: null,
    daily,
    sampleCount: 40,
    status: 'ready',
    reference: 'observed',
  };
}

describe('ReliabilityHistory', () => {
  it('dit qui a ete le plus juste ces 7 derniers jours et trace l erreur de chaque jour', () => {
    render(
      <ReliabilityHistory
        verification={[
          entry('arome', [...days(15, 21, 2), ...days(22, 28, 0.8)]),
          entry('arpege', [...days(15, 21, 1.1), ...days(22, 28, 1.5)]),
        ]}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Historique de fiabilité' })).toBeInTheDocument();
    expect(screen.getByText(/Le classement a changé\./)).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Erreur moyenne de température par modèle et par jour/ }),
    ).toBeInTheDocument();
  });

  it('se contente de tracer quand un seul modele a un historique, sans rien designer', () => {
    render(<ReliabilityHistory verification={[entry('arome', days(24, 28, 1))]} />);
    expect(screen.queryByText(/le plus juste/)).not.toBeInTheDocument();
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('ne lit que la temperature a J+1, et se tait sans assez de jours', () => {
    const { container } = render(
      <ReliabilityHistory
        verification={[
          entry('arome', days(20, 28, 1), 'wind'),
          entry('arome', days(20, 28, 1), 'temperature', 2),
          entry('arpege', null),
          entry('gfs', days(28, 28, 1)),
        ]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
