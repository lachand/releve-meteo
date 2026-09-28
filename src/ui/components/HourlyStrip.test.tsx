import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildBundle, buildHourlyTimeline } from '../../../tests/factories';
import { computeCascadeView } from '../hooks/useCascadeView';
import { MISSING } from '../format';
import { HourlyStrip } from './HourlyStrip';

// Minuit local (Europe/Paris, heure d'ete) le 17 aout 2026 : l'index 0 de la
// timeline construite a partir de cet instant correspond a une echeance nulle.
const NOW = new Date('2026-08-16T22:00:00Z');

describe('HourlyStrip', () => {
  it("affiche un etat vide quand aucune colonne n'est demandee", () => {
    const timeline = buildHourlyTimeline('2026-08-17T00:00', 3);
    const bundle = buildBundle({ timeline, models: ['arome'] });
    const cascade = computeCascadeView(
      bundle,
      { terrain: null, verification: [], preferred: null },
      NOW,
    );
    render(
      <HourlyStrip bundle={bundle} cascade={cascade} hours={0} windUnit="kmh" caption="Test" />,
    );
    expect(screen.getByText('Aucune échéance couverte par un modèle.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('marque la colonne ou le modele change avec data-transition', () => {
    const timeline = buildHourlyTimeline('2026-08-17T00:00', 6);
    // AROME s'arrete a l'index 3 (plus de temperature au-dela) : la cascade
    // doit basculer sur ARPEGE, seul modele encore couvrant, a partir de la.
    const bundle = buildBundle({
      timeline,
      models: ['arome', 'arpege'],
      values: (model, index) => (model === 'arome' && index >= 3 ? { temperature: null } : {}),
    });
    const cascade = computeCascadeView(
      bundle,
      { terrain: null, verification: [], preferred: null },
      NOW,
    );
    expect(cascade.transitions.length).toBeGreaterThan(0);

    render(
      <HourlyStrip bundle={bundle} cascade={cascade} hours={6} windUnit="kmh" caption="Test" />,
    );
    const headerCells = screen
      .getAllByRole('columnheader')
      .filter((cell) => cell.hasAttribute('scope') && cell.getAttribute('scope') === 'col');
    const transitionCells = headerCells.filter((cell) => cell.hasAttribute('data-transition'));
    expect(transitionCells).toHaveLength(cascade.transitions.length);

    // Le modele change bien de nom autour de la bascule marquee.
    const modelRow = screen.getByText('Modèle').closest('tr');
    expect(modelRow).not.toBeNull();
    expect(within(modelRow as HTMLElement).getAllByText('AROME').length).toBeGreaterThan(0);
    expect(within(modelRow as HTMLElement).getAllByText('ARPEGE').length).toBeGreaterThan(0);
  });

  it('ne marque aucune colonne quand le modele ne change pas sur la fenetre affichee', () => {
    const timeline = buildHourlyTimeline('2026-08-17T00:00', 4);
    const bundle = buildBundle({ timeline, models: ['arome'] });
    const cascade = computeCascadeView(
      bundle,
      { terrain: null, verification: [], preferred: null },
      NOW,
    );
    expect(cascade.transitions).toHaveLength(0);
    render(
      <HourlyStrip bundle={bundle} cascade={cascade} hours={4} windUnit="kmh" caption="Test" />,
    );
    const headerCells = screen
      .getAllByRole('columnheader')
      .filter((cell) => cell.getAttribute('scope') === 'col');
    expect(headerCells.some((cell) => cell.hasAttribute('data-transition'))).toBe(false);
  });

  it('separe les jours : la colonne de minuit local porte le nom du jour', () => {
    const timeline = buildHourlyTimeline('2026-08-17T22:00', 4); // ...22h,23h,18-00h,18-01h
    const bundle = buildBundle({ timeline, models: ['arome'] });
    // now = 22h locales le 17 aout, pour couvrir toute la fenetre depuis l'index 0.
    const now = new Date('2026-08-17T20:00:00Z');
    const cascade = computeCascadeView(
      bundle,
      { terrain: null, verification: [], preferred: null },
      now,
    );
    render(
      <HourlyStrip bundle={bundle} cascade={cascade} hours={4} windUnit="kmh" caption="Test" />,
    );
    expect(screen.getByText('mar. 18')).toBeInTheDocument();
    const headerCells = screen
      .getAllByRole('columnheader')
      .filter((cell) => cell.getAttribute('scope') === 'col');
    const newDayCells = headerCells.filter((cell) => cell.hasAttribute('data-new-day'));
    expect(newDayCells).toHaveLength(1);
    expect(within(newDayCells[0] as HTMLElement).getByText('00h')).toBeInTheDocument();
  });

  it('masque la ligne de probabilite quand toutes les valeurs restent sous 10 %', () => {
    const timeline = buildHourlyTimeline('2026-08-17T00:00', 3);
    const bundle = buildBundle({
      timeline,
      models: ['arome'],
      values: (_model, index) => ({
        precipitationProbability: [null, 5, 9][index] ?? null,
      }),
    });
    const cascade = computeCascadeView(
      bundle,
      { terrain: null, verification: [], preferred: null },
      NOW,
    );
    render(
      <HourlyStrip bundle={bundle} cascade={cascade} hours={3} windUnit="kmh" caption="Test" />,
    );
    expect(screen.queryByText('Proba.')).not.toBeInTheDocument();
  });

  it("affiche la ligne de probabilite des qu'une valeur atteint 10 %", () => {
    const timeline = buildHourlyTimeline('2026-08-17T00:00', 3);
    const bundle = buildBundle({
      timeline,
      models: ['arome'],
      values: (_model, index) => ({
        precipitationProbability: [5, 15, null][index] ?? null,
      }),
    });
    const cascade = computeCascadeView(
      bundle,
      { terrain: null, verification: [], preferred: null },
      NOW,
    );
    render(
      <HourlyStrip bundle={bundle} cascade={cascade} hours={3} windUnit="kmh" caption="Test" />,
    );
    const probabilityRow = screen.getByText('Proba.').closest('tr');
    expect(probabilityRow).not.toBeNull();
    const row = within(probabilityRow as HTMLElement);
    expect(row.getByText('5%')).toBeInTheDocument();
    expect(row.getByText('15%')).toBeInTheDocument();
    expect(row.getAllByText(MISSING)).toHaveLength(1); // valeur absente pour le 3e point
  });
});
