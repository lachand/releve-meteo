import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { Collapsible } from './Collapsible';

beforeEach(() => {
  localStorage.clear();
});

describe('Collapsible', () => {
  it('garde son titre comme intitule de section et replie son contenu par defaut', () => {
    render(
      <Collapsible id="air" eyebrow="Air" title="Qualité de l’air">
        <p>Indice 2</p>
      </Collapsible>,
    );
    const heading = screen.getByRole('heading', { name: 'Qualité de l’air' });
    expect(heading.closest('section')).not.toBeNull();
    expect(heading.closest('details')).not.toHaveAttribute('open');
  });

  it('s ouvre par defaut quand on le demande', () => {
    render(
      <Collapsible id="solar" eyebrow="Estimation" title="Solaire" defaultOpen>
        <p>Production</p>
      </Collapsible>,
    );
    expect(screen.getByRole('heading', { name: 'Solaire' }).closest('details')).toHaveAttribute(
      'open',
    );
  });

  it('se deplie au clic sur son titre et retient le choix sur cet appareil', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <Collapsible id="air" eyebrow="Air" title="Qualité de l’air">
        <p>Indice 2</p>
      </Collapsible>,
    );
    await user.click(screen.getByText('Qualité de l’air'));
    expect(
      screen.getByRole('heading', { name: 'Qualité de l’air' }).closest('details'),
    ).toHaveAttribute('open');
    unmount();

    render(
      <Collapsible id="air" eyebrow="Air" title="Qualité de l’air">
        <p>Indice 2</p>
      </Collapsible>,
    );
    expect(
      screen.getByRole('heading', { name: 'Qualité de l’air' }).closest('details'),
    ).toHaveAttribute('open');
  });

  it('retient aussi un repli choisi contre l ouverture par defaut', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <Collapsible id="solar" eyebrow="Estimation" title="Solaire" defaultOpen>
        <p>Production</p>
      </Collapsible>,
    );
    await user.click(screen.getByText('Solaire'));
    unmount();
    render(
      <Collapsible id="solar" eyebrow="Estimation" title="Solaire" defaultOpen>
        <p>Production</p>
      </Collapsible>,
    );
    expect(screen.getByRole('heading', { name: 'Solaire' }).closest('details')).not.toHaveAttribute(
      'open',
    );
  });

  it('fonctionne sans stockage local', async () => {
    const user = userEvent.setup();
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('bloque');
    };
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('bloque');
    };
    try {
      render(
        <Collapsible id="air" eyebrow="Air" title="Qualité de l’air">
          <p>Indice 2</p>
        </Collapsible>,
      );
      await user.click(screen.getByText('Qualité de l’air'));
      expect(
        screen.getByRole('heading', { name: 'Qualité de l’air' }).closest('details'),
      ).toHaveAttribute('open');
    } finally {
      Storage.prototype.getItem = original;
      Storage.prototype.setItem = setItem;
    }
  });
});
