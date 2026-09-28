import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AlertHit } from '../../domain/alerts';
import type { AlertRule } from '../../domain/types';
import { AlertBanner, AlertRulesEditor } from './Alerts';

const frost: AlertRule = {
  id: 'gel',
  placeId: 'lyon',
  variable: 'temperature',
  comparator: 'lt',
  threshold: 2,
  enabled: true,
};

describe('AlertBanner', () => {
  it("ne rend rien quand aucune alerte n'est franchie", () => {
    const { container } = render(<AlertBanner hits={[]} windUnit="kmh" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('dit chaque alerte franchie, quand et selon quel modele', () => {
    const hit: AlertHit = {
      rule: frost,
      first: { time: '2026-09-29T04:00', value: 1.5, model: 'arpege' },
      extreme: { time: '2026-09-29T05:00', value: 0.4, model: 'arpege' },
      hours: 3,
    };
    render(<AlertBanner hits={[hit]} windUnit="kmh" />);
    const banner = screen.getByRole('region', { name: 'Votre alerte est franchie' });
    expect(banner).toHaveTextContent(
      'Température sous 2 °C : dès mardi 04h, jusqu’à 0,4 °C mardi 05h selon ARPEGE, 3 h au total.',
    );
  });
});

describe('AlertRulesEditor', () => {
  function renderEditor(
    overrides: { readonly rules?: readonly AlertRule[]; readonly windUnit?: 'kmh' | 'kt' } = {},
  ) {
    const onAdd = vi.fn<(rule: Omit<AlertRule, 'id'>) => void>();
    const onToggle = vi.fn<(id: string) => void>();
    const onRemove = vi.fn<(id: string) => void>();
    render(
      <AlertRulesEditor
        placeId="lyon"
        placeName="Lyon"
        rules={overrides.rules ?? [frost]}
        windUnit={overrides.windUnit ?? 'kmh'}
        onAdd={onAdd}
        onToggle={onToggle}
        onRemove={onRemove}
      />,
    );
    return { onAdd, onToggle, onRemove };
  }

  it('dit que les alertes ne sont evaluees qu a l ouverture, faute de serveur', () => {
    renderEditor();
    expect(
      screen.getByText(
        /Sans serveur, Relevé ne peut vous prévenir application fermée que par la veille/,
      ),
    ).toBeInTheDocument();
  });

  it('liste les regles du lieu, les active, les desactive et les supprime', async () => {
    const user = userEvent.setup();
    const props = renderEditor();
    const list = within(screen.getByRole('list', { name: 'Alertes pour Lyon' }));
    const checkbox = list.getByRole('checkbox', { name: /^Température sous 2\s°C$/ });
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(props.onToggle).toHaveBeenCalledWith('gel');
    await user.click(
      list.getByRole('button', { name: /^Supprimer l’alerte Température sous 2\s°C$/ }),
    );
    expect(props.onRemove).toHaveBeenCalledWith('gel');
  });

  it('ajoute une regle de rafales, seuil saisi en noeuds et enregistre en km/h', async () => {
    const user = userEvent.setup();
    const props = renderEditor({ rules: [], windUnit: 'kt' });
    expect(screen.getByText('Aucune alerte pour Lyon.')).toBeInTheDocument();
    const form = within(screen.getByRole('form', { name: 'Nouvelle alerte' }));
    await user.selectOptions(form.getByLabelText('Grandeur'), 'wind');
    await user.selectOptions(form.getByLabelText('Sens'), 'gt');
    const threshold = form.getByLabelText('Seuil (kt)');
    await user.clear(threshold);
    await user.type(threshold, '30');
    await user.click(form.getByRole('button', { name: 'Ajouter' }));
    expect(props.onAdd).toHaveBeenCalledOnce();
    const added = props.onAdd.mock.calls[0]?.[0];
    expect(added).toMatchObject({
      placeId: 'lyon',
      variable: 'wind',
      comparator: 'gt',
      enabled: true,
    });
    expect(added?.threshold).toBeCloseTo(55.56, 2);
  });

  it('accepte la virgule decimale et refuse un seuil illisible', async () => {
    const user = userEvent.setup();
    const props = renderEditor({ rules: [] });
    const form = within(screen.getByRole('form', { name: 'Nouvelle alerte' }));
    const threshold = form.getByLabelText('Seuil (°C)');
    await user.clear(threshold);
    await user.type(threshold, 'abc');
    expect(form.getByRole('button', { name: 'Ajouter' })).toBeDisabled();
    await user.clear(threshold);
    await user.type(threshold, '-1,5');
    await user.click(form.getByRole('button', { name: 'Ajouter' }));
    expect(props.onAdd.mock.calls[0]?.[0]?.threshold).toBe(-1.5);
  });
});
