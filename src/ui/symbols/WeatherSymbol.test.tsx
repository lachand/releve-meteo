import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WeatherSymbol } from './WeatherSymbol';

describe('WeatherSymbol', () => {
  it('ne rend rien quand le code est absent', () => {
    const { container } = render(<WeatherSymbol code={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('ne rend rien pour un code WMO inconnu', () => {
    const { container } = render(<WeatherSymbol code={12345} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('rend un svg avec le libelle francais du code comme nom accessible', () => {
    render(<WeatherSymbol code={63} />);
    const symbol = screen.getByRole('img', { name: 'Pluie' });
    expect(symbol.tagName.toLowerCase()).toBe('svg');
    expect(symbol).toHaveAttribute('data-symbol', '63');
  });

  it('utilise le libelle francais exact pour un autre code connu', () => {
    render(<WeatherSymbol code={95} />);
    expect(screen.getByRole('img', { name: 'Orage' })).toBeInTheDocument();
  });

  it('masque le symbole aux lecteurs d ecran quand decorative est vrai', () => {
    const { container } = render(<WeatherSymbol code={63} decorative />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('role');
  });

  it('dessine le soleil le jour et la lune la nuit, jamais le soleil en pleine nuit', () => {
    const { container: day } = render(<WeatherSymbol code={0} isDay decorative />);
    expect(day.querySelector('svg')).not.toHaveAttribute('data-night');
    expect(day.querySelector('circle')).toHaveAttribute('fill', 'var(--picto-soleil)');
    const { container: night } = render(<WeatherSymbol code={0} isDay={false} decorative />);
    expect(night.querySelector('svg')).toHaveAttribute('data-night');
    expect(night.querySelector('path')).toHaveAttribute('fill', 'var(--picto-lune)');
    // Jour ou nuit inconnu : le jour, par defaut.
    const { container: unknown } = render(<WeatherSymbol code={0} decorative />);
    expect(unknown.querySelector('svg')).not.toHaveAttribute('data-night');
  });

  it('affine le ciel des codes 0 a 3 par la nebulosite de l heure', () => {
    // Code « peu nuageux » mais ciel couvert a 95 % : deux nuages, pas de soleil.
    const { container: covered } = render(<WeatherSymbol code={1} cloudCover={95} decorative />);
    expect(covered.querySelectorAll('[fill="var(--picto-soleil)"]')).toHaveLength(0);
    expect(covered.querySelectorAll('[fill="var(--picto-nuage-sombre)"]')).toHaveLength(1);
    // Code « couvert » mais ciel a 10 % : le soleil seul.
    const { container: clear } = render(<WeatherSymbol code={3} cloudCover={10} decorative />);
    expect(clear.querySelectorAll('[fill="var(--picto-nuage)"]')).toHaveLength(0);
    expect(clear.querySelectorAll('[fill="var(--picto-soleil)"]')).toHaveLength(1);
  });

  it.each([
    [51, 2],
    [53, 3],
    [55, 4],
  ])('dit l intensite de la bruine %i par le nombre de gouttelettes (%i)', (code, count) => {
    const { container } = render(<WeatherSymbol code={code} decorative />);
    expect(container.querySelectorAll('g[fill="var(--picto-pluie)"] circle')).toHaveLength(count);
  });

  it('dessine chaque code de la table, et un eclair pour l orage', () => {
    for (const code of [
      45, 48, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 96, 99,
    ]) {
      const { container, unmount } = render(<WeatherSymbol code={code} decorative />);
      expect(container.querySelector('svg')?.childElementCount).toBeGreaterThan(0);
      unmount();
    }
    const { container } = render(<WeatherSymbol code={95} decorative />);
    expect(container.querySelector('[fill="var(--picto-eclair)"]')).not.toBeNull();
  });
});
