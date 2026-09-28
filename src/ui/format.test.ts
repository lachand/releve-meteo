import { describe, expect, it } from 'vitest';
import {
  MISSING,
  compassPoint,
  formatCompact,
  formatDayHour,
  formatDayMonth,
  formatDayShort,
  formatDuration,
  formatHour,
  formatInteger,
  formatLongDate,
  formatOneDecimal,
  formatPercent,
  formatTemperature,
  formatWeekday,
  localDateOf,
} from './format';

describe('formatOneDecimal', () => {
  it('formate une decimale a la francaise', () => {
    expect(formatOneDecimal(3.5)).toBe('3,5');
    expect(formatOneDecimal(0)).toBe('0,0');
    expect(formatOneDecimal(-2.5)).toBe('-2,5');
  });

  it('retourne MISSING pour null, jamais 0', () => {
    expect(formatOneDecimal(null)).toBe(MISSING);
  });
});

describe('formatInteger', () => {
  it('arrondit a l entier', () => {
    expect(formatInteger(70)).toBe('70');
    expect(formatInteger(17.6)).toBe('18');
  });

  it('evite l affichage -0 pour une valeur arrondie a zero', () => {
    expect(formatInteger(-0.4)).toBe('0');
  });

  it('retourne MISSING pour null', () => {
    expect(formatInteger(null)).toBe(MISSING);
  });
});

describe('formatCompact', () => {
  it('affiche au plus une decimale, sans zero superflu', () => {
    expect(formatCompact(0.4)).toBe('0,4');
    expect(formatCompact(12)).toBe('12');
    expect(formatCompact(3.5)).toBe('3,5');
  });

  it('retourne MISSING pour null', () => {
    expect(formatCompact(null)).toBe(MISSING);
  });
});

describe('formatTemperature', () => {
  it('arrondit au degre avec le signe moins typographique (U+2212)', () => {
    expect(formatTemperature(-3.2)).toBe('−3');
    expect(formatTemperature(-3.2)).not.toContain('-'); // pas le trait d'union ASCII
  });

  it('n affiche jamais -0 pour une valeur negative arrondie a zero', () => {
    expect(formatTemperature(-0.4)).toBe('0');
    expect(formatTemperature(0.4)).toBe('0');
  });

  it('retourne un entier positif sans signe', () => {
    expect(formatTemperature(14.6)).toBe('15');
    expect(formatTemperature(0)).toBe('0');
  });

  it('retourne MISSING pour null', () => {
    expect(formatTemperature(null)).toBe(MISSING);
  });
});

describe('formatPercent', () => {
  it('convertit une proportion [0, 1] en pourcentage entier', () => {
    expect(formatPercent(0.5)).toBe('50 %');
    expect(formatPercent(0)).toBe('0 %');
    expect(formatPercent(1)).toBe('100 %');
  });

  it('retourne MISSING pour null', () => {
    expect(formatPercent(null)).toBe(MISSING);
  });
});

describe('formatHour', () => {
  it('omet les minutes rondes', () => {
    expect(formatHour('2026-08-17T14:00')).toBe('14h');
  });

  it('affiche les minutes non rondes', () => {
    expect(formatHour('2026-08-17T14:05')).toBe('14h05');
    expect(formatHour('2026-08-17T09:45')).toBe('09h45');
  });

  it('retourne la chaine telle quelle si le format est invalide', () => {
    expect(formatHour('not-a-date')).toBe('not-a-date');
  });
});

describe('formatDayShort', () => {
  it('rend jour abrege et quantieme', () => {
    expect(formatDayShort('2026-08-17')).toBe('lun. 17');
  });
});

describe('formatWeekday', () => {
  it('rend le jour de la semaine en toutes lettres', () => {
    expect(formatWeekday('2026-08-17')).toBe('lundi');
  });
});

describe('formatDayMonth', () => {
  it('rend le quantieme et le mois', () => {
    expect(formatDayMonth('2026-08-17')).toBe('17 août');
  });
});

describe('formatLongDate', () => {
  it('rend la date complete', () => {
    expect(formatLongDate('2026-08-17')).toBe('lundi 17 août 2026');
  });
});

describe('formatDayHour', () => {
  it('combine le jour de semaine et l heure', () => {
    expect(formatDayHour('2026-08-17T14:05')).toBe('lundi 14h05');
    expect(formatDayHour('2026-08-17T14:00')).toBe('lundi 14h');
  });
});

describe('compassPoint', () => {
  it('associe un angle a son point cardinal', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(90)).toBe('E');
    expect(compassPoint(180)).toBe('S');
    expect(compassPoint(270)).toBe('O');
  });

  it('boucle sur les angles negatifs', () => {
    expect(compassPoint(-10)).toBe('N');
  });

  it('boucle au-dela de 360 degres', () => {
    expect(compassPoint(360)).toBe('N');
    expect(compassPoint(404)).toBe('NE');
  });

  it('arrondit au point cardinal le plus proche, au bord du secteur', () => {
    expect(compassPoint(22)).toBe('N');
    expect(compassPoint(23)).toBe('NE');
  });

  it('retourne MISSING pour null, jamais un point par defaut', () => {
    expect(compassPoint(null)).toBe(MISSING);
  });
});

describe('formatDuration', () => {
  it('affiche les minutes seules sous une heure', () => {
    expect(formatDuration(25)).toBe('25 min');
  });

  it('affiche heures et minutes au-dela d une heure', () => {
    expect(formatDuration(75)).toBe('1 h 15');
    expect(formatDuration(65)).toBe('1 h 05');
  });

  it('omet les minutes quand la duree est un nombre rond d heures', () => {
    expect(formatDuration(60)).toBe('1 h');
  });

  it('rembourre les minutes a deux chiffres', () => {
    expect(formatDuration(125)).toBe('2 h 05');
  });
});

describe('localDateOf', () => {
  it('rend la date locale Europe/Paris, qui peut differer de la date UTC', () => {
    // 23h15 UTC un soir d'hiver = 00h15 heure de Paris (UTC+1) le lendemain.
    expect(localDateOf(new Date('2026-01-14T23:15:00Z'))).toBe('2026-01-15');
  });

  it('applique le decalage ete (UTC+2) juste apres le passage a l heure d ete', () => {
    // Bascule d'heure d'ete 2026 : dimanche 29 mars a 01h00 UTC (02h00 -> 03h00).
    // A 22h30 UTC ce jour-la, Paris est deja a UTC+2 : 00h30 le 30 mars.
    // Un decalage fige a UTC+1 donnerait a tort le 29 mars.
    expect(localDateOf(new Date('2026-03-29T22:30:00Z'))).toBe('2026-03-30');
  });

  it('applique le decalage hiver (UTC+1) juste apres le passage a l heure d hiver', () => {
    // Bascule d'heure d'hiver 2026 : dimanche 25 octobre a 01h00 UTC (03h00 -> 02h00).
    // A 22h30 UTC ce jour-la, Paris est deja revenu a UTC+1 : 23h30 le 25 octobre.
    // Un decalage fige a UTC+2 donnerait a tort le 26 octobre.
    expect(localDateOf(new Date('2026-10-25T22:30:00Z'))).toBe('2026-10-25');
  });
});
