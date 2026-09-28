import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs';
import type { TabItem } from './Tabs';

type Key = 'now' | 'hours' | 'days';

const ITEMS: readonly TabItem<Key>[] = [
  { key: 'now', label: 'Maintenant' },
  { key: 'hours', label: 'Heures' },
  { key: 'days', label: 'Jours' },
];

function Harness({ initial = 'now' as Key }: { readonly initial?: Key }) {
  const [active, setActive] = useState<Key>(initial);
  return <Tabs items={ITEMS} active={active} onChange={setActive} label="Vues" idPrefix="t" />;
}

describe('Tabs', () => {
  it('expose les roles ARIA tablist et tab', () => {
    render(<Harness />);
    expect(screen.getByRole('tablist', { name: 'Vues' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('marque l onglet actif avec aria-selected et le retire des autres', () => {
    render(<Harness />);
    expect(screen.getByRole('tab', { name: 'Maintenant' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Heures' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Jours' })).toHaveAttribute('aria-selected', 'false');
  });

  it('un seul onglet est dans l ordre de tabulation (tabIndex 0), les autres a -1', () => {
    render(<Harness />);
    expect(screen.getByRole('tab', { name: 'Maintenant' })).toHaveAttribute('tabIndex', '0');
    expect(screen.getByRole('tab', { name: 'Heures' })).toHaveAttribute('tabIndex', '-1');
  });

  it('le clic sur un onglet appelle onChange avec sa cle', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Tabs items={ITEMS} active="now" onChange={onChange} label="Vues" idPrefix="t" />);
    await user.click(screen.getByRole('tab', { name: 'Jours' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('days');
  });

  it('le clic met a jour l onglet selectionne (parcours complet avec etat)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('tab', { name: 'Heures' }));
    expect(screen.getByRole('tab', { name: 'Heures' })).toHaveAttribute('aria-selected', 'true');
  });

  it('ArrowRight deplace la selection et le focus vers l onglet suivant', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole('tab', { name: 'Maintenant' }).focus();
    await user.keyboard('{ArrowRight}');
    const hours = screen.getByRole('tab', { name: 'Heures' });
    expect(hours).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(hours);
  });

  it('ArrowRight boucle du dernier onglet vers le premier', async () => {
    const user = userEvent.setup();
    render(<Harness initial="days" />);
    screen.getByRole('tab', { name: 'Jours' }).focus();
    await user.keyboard('{ArrowRight}');
    const now = screen.getByRole('tab', { name: 'Maintenant' });
    expect(now).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(now);
  });

  it('ArrowLeft deplace la selection vers l onglet precedent', async () => {
    const user = userEvent.setup();
    render(<Harness initial="days" />);
    screen.getByRole('tab', { name: 'Jours' }).focus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Heures' })).toHaveAttribute('aria-selected', 'true');
  });

  it('ArrowLeft boucle du premier onglet vers le dernier', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole('tab', { name: 'Maintenant' }).focus();
    await user.keyboard('{ArrowLeft}');
    const days = screen.getByRole('tab', { name: 'Jours' });
    expect(days).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(days);
  });

  it('Home ramene la selection au premier onglet', async () => {
    const user = userEvent.setup();
    render(<Harness initial="days" />);
    screen.getByRole('tab', { name: 'Jours' }).focus();
    await user.keyboard('{Home}');
    const now = screen.getByRole('tab', { name: 'Maintenant' });
    expect(now).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(now);
  });

  it('End deplace la selection au dernier onglet', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole('tab', { name: 'Maintenant' }).focus();
    await user.keyboard('{End}');
    const days = screen.getByRole('tab', { name: 'Jours' });
    expect(days).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(days);
  });
});
