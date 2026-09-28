import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HourlyValues } from '../../../tests/factories';
import { hourlyPoint } from '../../../tests/factories';
import type { ConfidenceVerdict } from '../../domain/confidence';
import type { BlendedPoint, FillableField } from '../../domain/modelCascade';
import type { ModelId } from '../../domain/types';
import { MISSING } from '../format';
import type { SelectionExplanation } from '../selectionExplanation';
import { NowPanel } from './NowPanel';

function blendedPoint(
  values: HourlyValues,
  model: ModelId = 'arome',
  filledFrom: Partial<Record<FillableField, ModelId>> = {},
): BlendedPoint {
  return { ...hourlyPoint('2026-08-17T14:00', values), model, filledFrom };
}

const NO_EXPLANATION: SelectionExplanation = {
  headline: 'AROME retenu pour ce lieu et cette échéance.',
  reasons: [],
  caveats: [],
  runnerUp: null,
};

/** Cellule de donnee associee au libelle donne, cherchee par proximite dans le DOM. */
function readingValue(label: string): string {
  const dt = screen.getByText(label);
  const cell = dt.parentElement?.querySelector('[data-donnee]');
  if (cell === null || cell === undefined) {
    throw new Error(`aucune cellule de donnee pour ${label}`);
  }
  return cell.textContent ?? '';
}

describe('NowPanel', () => {
  it('affiche un message quand aucun modele ne couvre l instant present', () => {
    render(
      <NowPanel
        point={null}
        confidence={null}
        windUnit="kmh"
        explanation={NO_EXPLANATION}
        manual={false}
        onExplain={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/Aucun modèle ne couvre l’instant présent pour ce lieu/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pourquoi ce modèle ?' })).not.toBeInTheDocument();
  });

  it('affiche les releves avec leurs unites', () => {
    const point = blendedPoint({
      temperature: 14.2,
      apparentTemperature: 13,
      windSpeed: 18,
      windGust: 25,
      windDirection: 225,
      humidity: 70,
      dewPoint: 9.5,
      pressure: 962,
      cloudCover: 50,
      visibility: 8000,
      precipitation: 0.6,
      weatherCode: 61,
    });
    render(
      <NowPanel
        point={point}
        confidence={null}
        windUnit="kmh"
        explanation={NO_EXPLANATION}
        manual={false}
        onExplain={vi.fn()}
      />,
    );
    expect(screen.getByText('14,2')).toBeInTheDocument();
    expect(screen.getByText(/Pluie légère/)).toBeInTheDocument();
    expect(readingValue('Rafales')).toContain('25');
    expect(readingValue('Rafales')).toContain('km/h');
    expect(readingValue('Humidité')).toBe('70%');
    expect(readingValue('Rosée')).toBe('9,5°C');
    expect(readingValue('Pression')).toBe('962hPa');
    expect(readingValue('Nébulosité')).toBe('4/8');
    expect(readingValue('Visibilité')).toBe('8km');
    expect(readingValue('Pluie')).toBe('0,6mm/h');
    const wind = readingValue('Vent');
    expect(wind).toContain('SO');
    expect(wind).toContain('18');
    expect(wind).toContain('km/h');
  });

  it('convertit le vent dans l unite choisie (noeuds)', () => {
    const point = blendedPoint({ windSpeed: 37.04, windDirection: 90 }); // 20 kt
    render(
      <NowPanel
        point={point}
        confidence={null}
        windUnit="kt"
        explanation={NO_EXPLANATION}
        manual={false}
        onExplain={vi.fn()}
      />,
    );
    const wind = readingValue('Vent');
    expect(wind).toContain('20');
    expect(wind).toContain('kt');
  });

  it('affiche la temperature ressentie quand elle est connue, rien sinon', () => {
    const withFeel = blendedPoint({ apparentTemperature: 11 });
    const { rerender } = render(
      <NowPanel
        point={withFeel}
        confidence={null}
        windUnit="kmh"
        explanation={NO_EXPLANATION}
        manual={false}
        onExplain={vi.fn()}
      />,
    );
    expect(screen.getByText(/ressenti/)).toBeInTheDocument();

    const withoutFeel = blendedPoint({ apparentTemperature: null });
    rerender(
      <NowPanel
        point={withoutFeel}
        confidence={null}
        windUnit="kmh"
        explanation={NO_EXPLANATION}
        manual={false}
        onExplain={vi.fn()}
      />,
    );
    expect(screen.queryByText(/ressenti/)).not.toBeInTheDocument();
  });

  it('affiche une condition par defaut quand le code de temps est absent', () => {
    const point = blendedPoint({ weatherCode: null });
    render(
      <NowPanel
        point={point}
        confidence={null}
        windUnit="kmh"
        explanation={NO_EXPLANATION}
        manual={false}
        onExplain={vi.fn()}
      />,
    );
    expect(screen.getByText(/Temps présent non fourni/)).toBeInTheDocument();
  });

  it('rend la phrase de completion nommant le modele emprunteur et les champs empruntes', () => {
    const point = blendedPoint({}, 'arome', {
      cloudCover: 'arome_france',
      pressure: 'arome_france',
    });
    render(
      <NowPanel
        point={point}
        confidence={null}
        windUnit="kmh"
        explanation={NO_EXPLANATION}
        manual={false}
        onExplain={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        'Complété, faute de donnée chez AROME : nébulosité et pression : AROME France.',
      ),
    ).toBeInTheDocument();
  });

  it('n affiche pas de phrase de completion quand rien n a ete complete', () => {
    const point = blendedPoint({});
    render(
      <NowPanel
        point={point}
        confidence={null}
        windUnit="kmh"
        explanation={NO_EXPLANATION}
        manual={false}
        onExplain={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Complété, faute de donnée/)).not.toBeInTheDocument();
  });

  it('le bouton "Pourquoi ce modèle ?" appelle onExplain', async () => {
    const onExplain = vi.fn();
    const user = userEvent.setup();
    render(
      <NowPanel
        point={blendedPoint({})}
        confidence={null}
        windUnit="kmh"
        explanation={NO_EXPLANATION}
        manual={false}
        onExplain={onExplain}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Pourquoi ce modèle ?' }));
    expect(onExplain).toHaveBeenCalledOnce();
  });

  it('affiche la confiance et le nombre de modeles compares quand elle est disponible', () => {
    const confidence: ConfidenceVerdict = {
      level: 'high',
      byVariable: {},
      drivers: [],
      modelCount: 3,
    };
    render(
      <NowPanel
        point={blendedPoint({})}
        confidence={confidence}
        windUnit="kmh"
        explanation={NO_EXPLANATION}
        manual={false}
        onExplain={vi.fn()}
      />,
    );
    expect(
      screen.getByText('Confiance élevée : 3 modèles comparés à cette heure.'),
    ).toBeInTheDocument();
  });

  it('n affiche pas la confiance quand elle est indisponible', () => {
    const confidence: ConfidenceVerdict = {
      level: 'unavailable',
      byVariable: {},
      drivers: [],
      modelCount: 0,
    };
    render(
      <NowPanel
        point={blendedPoint({})}
        confidence={confidence}
        windUnit="kmh"
        explanation={NO_EXPLANATION}
        manual={false}
        onExplain={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Confiance/)).not.toBeInTheDocument();
  });

  it('limite l affichage aux deux premieres raisons, du plus lourd au plus leger', () => {
    const explanation: SelectionExplanation = {
      headline: 'AROME retenu pour ce lieu et cette échéance.',
      reasons: ['Premiere raison.', 'Deuxieme raison.', 'Troisieme raison.'],
      caveats: [],
      runnerUp: null,
    };
    render(
      <NowPanel
        point={blendedPoint({})}
        confidence={null}
        windUnit="kmh"
        explanation={explanation}
        manual={false}
        onExplain={vi.fn()}
      />,
    );
    expect(screen.getByText('Premiere raison.')).toBeInTheDocument();
    expect(screen.getByText('Deuxieme raison.')).toBeInTheDocument();
    expect(screen.queryByText('Troisieme raison.')).not.toBeInTheDocument();
  });

  it('affiche MISSING pour chaque mesure absente, jamais 0', () => {
    const point = blendedPoint({
      windSpeed: null,
      windGust: null,
      windDirection: null,
      humidity: null,
      dewPoint: null,
      pressure: null,
      cloudCover: null,
      visibility: null,
      precipitation: null,
    });
    render(
      <NowPanel
        point={point}
        confidence={null}
        windUnit="kmh"
        explanation={NO_EXPLANATION}
        manual={false}
        onExplain={vi.fn()}
      />,
    );
    expect(readingValue('Rafales')).toBe(MISSING);
    expect(readingValue('Humidité')).toBe(MISSING);
    expect(readingValue('Rosée')).toBe(MISSING);
    expect(readingValue('Pression')).toBe(MISSING);
    expect(readingValue('Nébulosité')).toBe(MISSING);
    expect(readingValue('Visibilité')).toBe(MISSING);
    expect(readingValue('Pluie')).toBe(MISSING);
    for (const label of [
      'Rafales',
      'Humidité',
      'Rosée',
      'Pression',
      'Nébulosité',
      'Visibilité',
      'Pluie',
    ]) {
      expect(readingValue(label)).not.toBe('0');
    }
  });
});
