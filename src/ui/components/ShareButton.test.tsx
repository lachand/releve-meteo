import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShareButton } from './ShareButton';

const URL = 'https://releve.example/?lat=45.7578&lon=4.832&modele=arpege';

function stubNavigator(overrides: { share?: unknown; writeText?: unknown }) {
  Object.defineProperty(navigator, 'share', { configurable: true, value: overrides.share });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: overrides.writeText },
  });
}

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
});

describe('ShareButton', () => {
  it('copie le lien dans le presse-papiers quand le partage natif manque, et le dit', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    stubNavigator({ writeText });
    render(<ShareButton url={URL} title="Lyon" />);
    await user.click(screen.getByRole('button', { name: 'Copier le lien de ce relevé' }));
    expect(writeText).toHaveBeenCalledWith(URL);
    expect(await screen.findByRole('status')).toHaveTextContent('Lien copié.');
  });

  it('passe par le partage natif quand il existe', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    const user = userEvent.setup();
    stubNavigator({ share, writeText });
    render(<ShareButton url={URL} title="Lyon" />);
    await user.click(screen.getByRole('button'));
    expect(share).toHaveBeenCalledWith({ title: 'Lyon', url: URL });
    expect(writeText).not.toHaveBeenCalled();
    expect(await screen.findByText('Lien partagé.')).toBeInTheDocument();
  });

  it('ne copie rien quand l utilisateur ferme le partage natif', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('annule', 'AbortError'));
    const writeText = vi.fn();
    const user = userEvent.setup();
    stubNavigator({ share, writeText });
    render(<ShareButton url={URL} title="Lyon" />);
    await user.click(screen.getByRole('button'));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('se rabat sur le presse-papiers quand le partage natif echoue', async () => {
    const share = vi.fn().mockRejectedValue(new Error('indisponible'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    stubNavigator({ share, writeText });
    render(<ShareButton url={URL} title="Lyon" />);
    await user.click(screen.getByRole('button'));
    expect(writeText).toHaveBeenCalledWith(URL);
    expect(await screen.findByText('Lien copié.')).toBeInTheDocument();
  });

  it('dit quand rien ne marche, puis efface le message', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubNavigator({ writeText: vi.fn().mockRejectedValue(new Error('refuse')) });
    render(<ShareButton url={URL} title="Lyon" />);
    await user.click(screen.getByRole('button'));
    expect(await screen.findByText(/Copie impossible/)).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
