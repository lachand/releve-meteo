import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DAY_PERIODS } from '../../domain/reliability';
import type { ModelVerification, PeriodBias } from '../../domain/reliability';
import type { ModelId } from '../../domain/types';
import { PeriodBiasTable } from './PeriodBiasTable';

function periods(values: readonly (number | null)[]): PeriodBias[] {
  return values.flatMap((bias, index) =>
    bias === null ? [] : [{ period: DAY_PERIODS[index] as PeriodBias['period'], count: 30, bias }],
  );
}

function entry(
  model: ModelId,
  values: readonly (number | null)[] | null,
  leadDays = 1,
): ModelVerification {
  return {
    model,
    variable: 'temperature',
    leadDays,
    stats: { mae: 1, bias: 0, rmse: 1, count: 40 },
    rain: null,
    periods: values === null ? null : periods(values),
    sampleCount: 40,
    status: 'ready',
    reference: 'observed',
  };
}

describe('PeriodBiasTable', () => {
  it('dit en premier le biais du modele retenu, puis chiffre chaque modele par moment', () => {
    render(
      <PeriodBiasTable
        verification={[entry('arome', [-1.4, 0.2, 1.1, 0]), entry('gfs', [0.1, 0, -0.3, null])]}
        activeModel="gfs"
      />,
    );
    expect(screen.getByText(/GFS, prévu la veille : pas de biais marqué/)).toBeInTheDocument();
    const table = screen.getByRole('table', {
      name: /Écart moyen de la température prévue la veille/,
    });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    const arome = rows[1] as HTMLElement;
    expect(within(arome).getByRole('rowheader')).toHaveTextContent('AROME');
    // Un biais marque est dit aussi aux lecteurs d'ecran ; un moment sans assez de paires est un tiret.
    expect(arome).toHaveTextContent('−1,4 (trop froid)');
    expect(arome).toHaveTextContent('+1,1 (trop chaud)');
    expect(within(rows[2] as HTMLElement).getAllByRole('cell')[3]).toHaveTextContent('—');
  });

  it('se rabat sur le premier modele quand le modele retenu n a pas de biais calcule', () => {
    render(
      <PeriodBiasTable
        verification={[entry('arome', [1.5, 0, 0, 0]), entry('gfs', null)]}
        activeModel="gfs"
      />,
    );
    expect(screen.getByText(/AROME, prévu la veille : trop chaud la nuit/)).toBeInTheDocument();
    expect(screen.queryByText('GFS')).not.toBeInTheDocument();
  });

  it('ne se prononce que sur la prevision de la veille, et n affiche rien sans donnees', () => {
    const { container } = render(
      <PeriodBiasTable
        verification={[entry('arome', [1, 1, 1, 1], 2), entry('gfs', null)]}
        activeModel={null}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('rend le tableau atteignable au clavier et dit que rien n est corrige', () => {
    render(<PeriodBiasTable verification={[entry('arome', [1, 0, 0, 0])]} activeModel={null} />);
    expect(
      screen.getByRole('region', { name: /Écart moyen de la température prévue/ }),
    ).toHaveAttribute('tabindex', '0');
    expect(screen.getByText(/ne sont pas corrigées de ces écarts/)).toBeInTheDocument();
  });
});
