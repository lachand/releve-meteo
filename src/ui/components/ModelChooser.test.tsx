import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MODEL_ORDER } from '../../domain/models';
import type { IneligibilityReason, ModelRanking } from '../../domain/modelSelection';
import type { ModelVerification } from '../../domain/reliability';
import type { ModelId } from '../../domain/types';
import { ModelChooser } from './ModelChooser';

function buildRanking(
  overrides: Partial<Record<ModelId, IneligibilityReason | null>> = {},
): readonly ModelRanking[] {
  return MODEL_ORDER.map((model) => {
    const ineligibility = model in overrides ? (overrides[model] ?? null) : null;
    return { model, score: 0, criteria: [], eligible: ineligibility === null, ineligibility };
  });
}

/**
 * Case du modele par son libelle exact (evite qu'une recherche par role et
 * nom accessible confonde "AROME" avec "AROME France", puisque le nom
 * accessible du bouton radio inclut aussi la maille, les forces et les
 * faiblesses du modele).
 */
function radioFor(modelLabel: string): HTMLElement {
  const label = screen.getByText(modelLabel).closest('label');
  if (label === null) {
    throw new Error(`aucune case pour ${modelLabel}`);
  }
  return within(label).getByRole('radio');
}

describe('ModelChooser', () => {
  it('coche Automatique par defaut quand aucun modele n est prefere', () => {
    render(
      <ModelChooser
        preferred={null}
        onChange={vi.fn()}
        ranking={buildRanking()}
        verification={[]}
        automaticModel="arome"
      />,
    );
    expect(radioFor('Automatique')).toBeChecked();
    expect(radioFor('AROME')).not.toBeChecked();
    expect(screen.getByText(/En ce moment : AROME\./)).toBeInTheDocument();
  });

  it('coche le modele choisi manuellement, pas Automatique', () => {
    render(
      <ModelChooser
        preferred="arpege"
        onChange={vi.fn()}
        ranking={buildRanking()}
        verification={[]}
        automaticModel="arome"
      />,
    );
    expect(radioFor('Automatique')).not.toBeChecked();
    expect(radioFor('ARPEGE')).toBeChecked();
  });

  it('un clic sur un modele disponible appelle onChange avec ce modele', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ModelChooser
        preferred={null}
        onChange={onChange}
        ranking={buildRanking()}
        verification={[]}
        automaticModel={null}
      />,
    );
    await user.click(radioFor('ARPEGE'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('arpege');
  });

  it('un clic sur Automatique appelle onChange avec null', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ModelChooser
        preferred="arpege"
        onChange={onChange}
        ranking={buildRanking()}
        verification={[]}
        automaticModel={null}
      />,
    );
    await user.click(radioFor('Automatique'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('desactive et motive un modele absent de la reponse du service', () => {
    render(
      <ModelChooser
        preferred={null}
        onChange={vi.fn()}
        ranking={buildRanking({ icon_d2: 'unavailable' })}
        verification={[]}
        automaticModel="arome"
      />,
    );
    const radio = radioFor('ICON-D2');
    expect(radio).toBeDisabled();
    expect(
      screen.getByText(/Indisponible : absent de la réponse du service pour ce lieu\./),
    ).toBeInTheDocument();
  });

  it('desactive et motive un modele hors de son domaine de calcul', () => {
    render(
      <ModelChooser
        preferred={null}
        onChange={vi.fn()}
        ranking={buildRanking({ icon_d2: 'outOfDomain' })}
        verification={[]}
        automaticModel="arome"
      />,
    );
    expect(radioFor('ICON-D2')).toBeDisabled();
    expect(
      screen.getByText(/Indisponible : ce lieu est hors de son domaine de calcul\./),
    ).toBeInTheDocument();
  });

  it('laisse selectionnable un modele seulement hors de portee a cette echeance', () => {
    render(
      <ModelChooser
        preferred={null}
        onChange={vi.fn()}
        ranking={buildRanking({ gfs: 'outOfRange' })}
        verification={[]}
        automaticModel="arome"
      />,
    );
    expect(radioFor('GFS')).not.toBeDisabled();
  });

  it('affiche l erreur mesuree localement sur la temperature a J+1 quand elle est connue', () => {
    const verification: readonly ModelVerification[] = [
      {
        model: 'arome',
        variable: 'temperature',
        leadDays: 1,
        stats: { mae: 1.3, bias: 0, rmse: 1.5, count: 40 },
        rain: null,
        sampleCount: 40,
        status: 'ready',
        reference: 'observed',
      },
    ];
    render(
      <ModelChooser
        preferred={null}
        onChange={vi.fn()}
        ranking={buildRanking()}
        verification={verification}
        automaticModel="arome"
      />,
    );
    expect(
      screen.getByText(/Erreur mesurée ici sur la température à J\+1 : 1,3 °C/),
    ).toBeInTheDocument();
  });
});
