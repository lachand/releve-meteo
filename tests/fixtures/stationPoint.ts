/*
 * Reponse synthetique d'Open-Meteo au point de la station Lyon-Bron (les
 * sept modeles, temperature a 2 m, 36 heures passees), pour les tests du
 * controle au dernier releve. Synthetique, et non enregistree comme les
 * fichiers de tests/fixtures/live/ : le quota Open-Meteo de l'environnement
 * de developpement etait epuise ce jour-la. Valeurs constantes et
 * distinctes par modele, differentes de celles du lieu : un test qui les
 * retrouve prouve que la comparaison se fait bien au point de la station.
 */

/** Temperature constante de chaque modele au point de la station, °C. */
export const STATION_POINT_TEMPERATURES = {
  meteofrance_arome_france_hd: 24.8,
  meteofrance_arome_france: 25.1,
  icon_d2: 25.9,
  meteofrance_arpege_europe: 23.7,
  icon_eu: 24.2,
  ecmwf_ifs025: 23.9,
  gfs_seamless: 23.5,
} as const;

/** Heures locales du 27 septembre 2026 a 4 h au 28 septembre a 16 h. */
function hours(): string[] {
  const result: string[] = [];
  for (let i = 0; i < 37; i += 1) {
    const date = new Date(Date.UTC(2026, 8, 27, 4 + i));
    result.push(
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}T${String(date.getUTCHours()).padStart(2, '0')}:00`,
    );
  }
  return result;
}

export function stationPointPayload(): Record<string, unknown> {
  const time = hours();
  const hourly: Record<string, unknown> = { time };
  for (const [model, value] of Object.entries(STATION_POINT_TEMPERATURES)) {
    hourly[`temperature_2m_${model}`] = time.map(() => value);
  }
  return {
    latitude: 45.72,
    longitude: 4.95,
    elevation: 200,
    timezone: 'Europe/Paris',
    utc_offset_seconds: 7200,
    hourly,
  };
}
