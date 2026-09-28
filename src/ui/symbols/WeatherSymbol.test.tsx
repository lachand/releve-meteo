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

  it('deduit le cercle de station de la nebulosite en octas quand elle est fournie', () => {
    // Ciel degage (code 0) avec nebulosite complete (100 %) : le cercle plein
    // ajoute un second <circle> (le remplissage) en plus du contour.
    const { container: full } = render(<WeatherSymbol code={0} cloudCover={100} decorative />);
    expect(full.querySelectorAll('circle')).toHaveLength(2);
  });

  it('retombe sur une table fixe par code quand la nebulosite n est pas fournie', () => {
    // Meme code 0, sans nebulosite : la table fixe donne 0 octa, donc
    // seulement le contour (un unique <circle>), aucun remplissage.
    const { container: bare } = render(<WeatherSymbol code={0} cloudCover={null} decorative />);
    expect(bare.querySelectorAll('circle')).toHaveLength(1);
  });
});
