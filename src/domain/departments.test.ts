import { describe, expect, it } from 'vitest';
import departmentsJson from '../../public/data/departements-fr.json';
import { departmentAt } from './departments';
import type { Department } from './departments';

const DEPARTMENTS = departmentsJson as unknown as readonly Department[];

describe('departmentAt', () => {
  it.each([
    ['Lyon', 45.7485, 4.8467, '69'],
    ['Paris', 48.8566, 2.3522, '75'],
    ['Brest', 48.3904, -4.4861, '29'],
    ['Chamonix-Mont-Blanc', 45.9237, 6.8694, '74'],
    ['Strasbourg', 48.5734, 7.7521, '67'],
    ['Ajaccio', 41.9192, 8.7386, '2A'],
    ['Bastia', 42.7028, 9.4503, '2B'],
    ['Val de Virieu', 45.4936, 5.4708, '38'],
  ])('retrouve le departement de %s', (_, latitude, longitude, code) => {
    expect(departmentAt(latitude, longitude, DEPARTMENTS)?.code).toBe(code);
  });

  it('se replie sur le departement le plus proche juste au large du trait de cote simplifie', () => {
    // Pointe du Raz, a quelques centaines de metres de la cote.
    expect(departmentAt(48.0385, -4.7445, DEPARTMENTS)?.code).toBe('29');
  });

  it('ne rend rien en pleine mer, loin de toute cote', () => {
    expect(departmentAt(46.0, -5.5, DEPARTMENTS)).toBeNull();
  });

  it('tolere un segment degenere (deux sommets confondus)', () => {
    const square: Department = {
      code: '99',
      name: 'Carre',
      rings: [
        [
          [0, 0],
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    };
    expect(departmentAt(0.5, 0.5, [square])?.code).toBe('99');
    // Juste au sud, a environ 1 km du bord : repli.
    expect(departmentAt(-0.01, 0.0, [square])?.code).toBe('99');
  });

  it('ne rend rien sans contours', () => {
    expect(departmentAt(45.7485, 4.8467, [])).toBeNull();
  });
});
