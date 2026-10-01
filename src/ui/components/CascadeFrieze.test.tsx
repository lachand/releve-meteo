import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildBundle, buildHourlyTimeline } from '../../../tests/factories';
import { computeCascadeView } from '../hooks/useCascadeView';
import { CascadeFrieze } from './CascadeFrieze';

const NOW = new Date('2026-08-16T22:00:00Z'); // minuit local le 17 aout 2026

describe('CascadeFrieze', () => {
  it('affiche un etat vide quand la cascade ne couvre aucune echeance', () => {
    const timeline = buildHourlyTimeline('2026-08-17T00:00', 3);
    const bundle = buildBundle({ timeline, models: ['arome'] });
    // now tres en avance sur la timeline : aucun point n'a d'echeance positive.
    const farFuture = new Date('2026-09-01T00:00:00Z');
    const cascade = computeCascadeView(
      bundle,
      { terrain: null, verification: [], preferred: null },
      farFuture,
    );
    expect(cascade.segments).toHaveLength(0);
    render(<CascadeFrieze bundle={bundle} cascade={cascade} />);
    expect(screen.getByText('Aucune échéance couverte.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('rend un element de liste par segment de la cascade', () => {
    const timeline = buildHourlyTimeline('2026-08-17T00:00', 6);
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
    expect(cascade.segments.length).toBeGreaterThan(1);

    render(<CascadeFrieze bundle={bundle} cascade={cascade} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(cascade.segments.length);
    expect(screen.getByText('AROME')).toBeInTheDocument();
    expect(screen.getByText('ARPEGE')).toBeInTheDocument();
    // Relais ecrit en toutes lettres, lisible meme quand un troncon est etroit.
    expect(screen.getByText(/^AROME jusqu’à .+, puis ARPEGE jusqu’à .+\.$/)).toBeInTheDocument();
  });

  it('dit pourquoi le modele change : AROME n a plus de valeur, ARPEGE prend le relais', () => {
    const timeline = buildHourlyTimeline('2026-08-17T00:00', 6);
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
    expect(cascade.switches).toHaveLength(cascade.transitions.length);
    expect(cascade.switches[0]).toMatchObject({
      kind: 'availability',
      cause: 'noData',
      from: 'arome',
      to: 'arpege',
      index: 3,
    });
    render(<CascadeFrieze bundle={bundle} cascade={cascade} />);
    expect(screen.getByRole('region', { name: 'Pourquoi ces changements ?' })).toBeInTheDocument();
    expect(screen.getByText(/AROME n’a plus de valeur à partir de là/)).toBeInTheDocument();
  });

  it('n ajoute aucune explication quand le modele ne change pas', () => {
    const timeline = buildHourlyTimeline('2026-08-17T00:00', 4);
    const bundle = buildBundle({ timeline, models: ['arome'] });
    const cascade = computeCascadeView(
      bundle,
      { terrain: null, verification: [], preferred: null },
      NOW,
    );
    expect(cascade.switches).toEqual([]);
    render(<CascadeFrieze bundle={bundle} cascade={cascade} />);
    expect(screen.queryByText('Pourquoi ces changements ?')).not.toBeInTheDocument();
  });
});
