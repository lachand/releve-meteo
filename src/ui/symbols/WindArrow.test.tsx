import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WindArrow } from './WindArrow';
import { windStrength } from './windStrength';

describe('WindArrow', () => {
  it('ne rend rien quand la vitesse est absente', () => {
    const { container } = render(<WindArrow speedKmh={null} directionDeg={90} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('pointe la ou va le vent : un vent du sud pointe vers le nord', () => {
    const { container } = render(<WindArrow speedKmh={18} directionDeg={180} />);
    expect(container.querySelector('svg')).toHaveAttribute('data-heading', '0');
    const { container: west } = render(<WindArrow speedKmh={18} directionDeg={270} />);
    // Vent d'ouest : il va vers l'est.
    expect(west.querySelector('svg')).toHaveAttribute('data-heading', '90');
  });

  it('dit calme sous 5 km/h, et ne devine pas une direction inconnue', () => {
    const { container: calm } = render(<WindArrow speedKmh={3} directionDeg={90} />);
    expect(calm.querySelector('svg')).toHaveAttribute('data-wind', 'calm');
    expect(calm.querySelector('g')).toBeNull();
    const { container: unknown } = render(<WindArrow speedKmh={25} directionDeg={null} />);
    expect(unknown.querySelector('svg')).toHaveAttribute('data-wind', 'unknown');
    expect(unknown.querySelector('g')).toBeNull();
  });

  it.each([
    [4, 'calm'],
    [12, 'light'],
    [20, 'moderate'],
    [45, 'strong'],
    [60, 'veryStrong'],
  ] as const)('classe %i km/h en %s', (kmh, strength) => {
    expect(windStrength(kmh)).toBe(strength);
  });

  it('epaissit le trait avec la force du vent', () => {
    const width = (kmh: number) => {
      const { container, unmount } = render(<WindArrow speedKmh={kmh} directionDeg={0} />);
      const value = Number(container.querySelector('g path')?.getAttribute('stroke-width'));
      unmount();
      return value;
    };
    expect(width(10)).toBeLessThan(width(30));
    expect(width(30)).toBeLessThan(width(50));
    expect(width(50)).toBeLessThan(width(80));
  });

  it('porte un libelle accessible quand il en recoit un', () => {
    render(<WindArrow speedKmh={18} directionDeg={180} label="Vent du S, 18 km/h" />);
    expect(screen.getByRole('img', { name: 'Vent du S, 18 km/h' })).toBeInTheDocument();
  });
});
