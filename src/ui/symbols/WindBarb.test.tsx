import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WindBarb } from './WindBarb';

describe('WindBarb', () => {
  it('ne rend rien quand la vitesse est absente', () => {
    const { container } = render(<WindBarb speedKmh={null} directionDeg={90} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('rend un double cercle pour un vent calme', () => {
    const { container } = render(<WindBarb speedKmh={2} directionDeg={90} />);
    expect(container.querySelectorAll('circle')).toHaveLength(2);
    // Vent calme : aucune hampe, la rotation de direction ne s applique pas.
    expect(container.querySelector('g')).not.toBeInTheDocument();
  });

  it('rend un simple point central quand la direction est inconnue, meme si le vent n est pas calme', () => {
    const { container } = render(<WindBarb speedKmh={20} directionDeg={null} />);
    expect(container.querySelectorAll('circle')).toHaveLength(1);
  });

  it('oriente la hampe selon la direction fournie', () => {
    const { container } = render(<WindBarb speedKmh={20} directionDeg={45} />);
    const group = container.querySelector('g');
    expect(group).toHaveAttribute('transform', 'rotate(45 20 20)');
  });

  it('change la rotation quand la direction change', () => {
    const { container } = render(<WindBarb speedKmh={20} directionDeg={270} />);
    expect(container.querySelector('g')).toHaveAttribute('transform', 'rotate(270 20 20)');
  });

  it('expose un role et un libelle accessibles quand un libelle est fourni', () => {
    render(<WindBarb speedKmh={20} directionDeg={90} label="Vent 20 km/h d'est" />);
    expect(screen.getByRole('img', { name: "Vent 20 km/h d'est" })).toBeInTheDocument();
  });

  it('masque le svg aux lecteurs d ecran sans libelle', () => {
    const { container } = render(<WindBarb speedKmh={20} directionDeg={90} />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
