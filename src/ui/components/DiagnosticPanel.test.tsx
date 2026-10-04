import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordDiagnostic, resetDiagnosticsForTests } from '../../data/cache/diagnostics';
import { DiagnosticPanel } from './DiagnosticPanel';

beforeEach(() => {
  localStorage.clear();
  resetDiagnosticsForTests();
});

describe('DiagnosticPanel', () => {
  it('liste chaque source, et se met a jour sur demande', async () => {
    const user = userEvent.setup();
    render(<DiagnosticPanel />);
    expect(screen.getAllByText('Aucune lecture réussie notée sur cet appareil.')).toHaveLength(12);
    recordDiagnostic('nowcast', { ok: true, value: 1 }, Date.parse('2026-09-28T14:00:00Z'));
    // Le journal est lu a l'ouverture : « Actualiser » le relit.
    expect(screen.queryByText(/Dernière lecture réussie/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actualiser' }));
    expect(screen.getByText('Dernière lecture réussie : lundi 16h.')).toBeInTheDocument();
    expect(screen.getAllByText('Aucune lecture réussie notée sur cet appareil.')).toHaveLength(11);
  });

  it('copie un rapport sans lieu ni cle, et dit quand la copie est refusee', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false }),
    });
    const user = userEvent.setup();
    render(<DiagnosticPanel />);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await user.click(screen.getByRole('button', { name: 'Copier le rapport' }));
    expect(await screen.findByText(/Rapport copié/)).toBeInTheDocument();
    expect(String(writeText.mock.calls[0]?.[0])).toContain('Relevé, rapport de diagnostic');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('refuse')) },
    });
    await user.click(screen.getByRole('button', { name: 'Copier le rapport' }));
    expect(await screen.findByText(/Copie impossible/)).toBeInTheDocument();
  });
});
