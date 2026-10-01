import { Suspense, lazy } from 'react';
import { briefingAt } from '../../domain/briefing';
import { bestDryWindow } from '../../domain/dryWindow';
import { solarOutlook } from '../../domain/solarOutlook';
import { mountainOutlook } from '../../domain/mountainOutlook';
import { briefingSentence } from '../briefingPresentation';
import { AirQualityPanel } from '../components/AirQualityPanel';
import { AlertBanner, AlertRulesEditor } from '../components/Alerts';
import { ConditionsPanel } from '../components/ConditionsPanel';
import { DailyList } from '../components/DailyList';
import { DryWindowPanel } from '../components/DryWindowPanel';
import { MountainPanel } from '../components/MountainPanel';
import { shouldShowMountain } from '../mountainPresentation';
import { HourlyStrip } from '../components/HourlyStrip';
import { NowcastPanel } from '../components/NowcastPanel';
import { NowPanel } from '../components/NowPanel';
import { PhenomenaPanel } from '../components/PhenomenaPanel';
import { StationLine } from '../components/StationCheck';
import { VigilanceBanner, VigilanceLine } from '../components/Vigilance';
import { Collapsible } from './Collapsible';
import { Section } from './Section';
import styles from './Views.module.css';
import type { ForecastViewModel } from './viewModel';

// Le graphique embarque Chart.js : charge a la demande, seulement avec une puissance saisie.
const SolarPanel = lazy(() =>
  import('../components/SolarPanel').then((m) => ({ default: m.SolarPanel })),
);

export const PHENOMENA_HORIZON_HOURS = 72;

export function TodayView({ vm }: { readonly vm: ForecastViewModel }) {
  const { cascade } = vm;
  const nowPoint = cascade.nowIndex === -1 ? null : (cascade.points[cascade.nowIndex] ?? null);
  const confidenceNow =
    cascade.nowIndex === -1 ? null : (vm.confidence?.[cascade.nowIndex] ?? null);

  const briefing =
    nowPoint === null
      ? null
      : briefingAt({
          bundle: vm.bundle,
          index: cascade.nowIndex,
          active: { model: nowPoint.model, temperature: nowPoint.temperature.value },
          verdict: confidenceNow,
        });

  const dryWindow = bestDryWindow({
    points: cascade.points.filter((point) => point !== null),
    now: vm.now,
  });

  const solar = solarOutlook({
    points: cascade.points.filter((point) => point !== null),
    peakKwp: vm.peakKwp,
    now: vm.now,
  });

  const mountain = mountainOutlook({
    points: cascade.points.filter((point) => point !== null),
    now: vm.now,
    elevation: vm.place.elevation,
  });

  return (
    <div className={styles.stack}>
      <VigilanceBanner state={vm.vigilance} summary={vm.vigilanceSummary} now={vm.now} />
      <AlertBanner hits={vm.alertHits} spreadHits={vm.spreadHits} windUnit={vm.windUnit} />
      <Section eyebrow="Maintenant" className={styles.nowSheet}>
        {briefing !== null && <p className={styles.briefing}>{briefingSentence(briefing)}</p>}
        <NowPanel
          point={nowPoint}
          confidence={confidenceNow}
          windUnit={vm.windUnit}
          explanation={vm.explanation}
          manual={vm.preferred !== null && vm.preferred === nowPoint?.model}
          onExplain={() => vm.navigate('modeles')}
        >
          <StationLine
            state={vm.station}
            check={vm.stationCheck}
            activeModel={cascade.activeModel}
            onDetail={() => vm.navigate('fiabilite')}
          />
        </NowPanel>
      </Section>

      <div className={styles.twoColumns}>
        <Section eyebrow="Deux prochaines heures" title="Pluie au quart d’heure">
          <NowcastPanel state={vm.nowcast} now={vm.now} />
        </Section>
        <Section eyebrow={`${PHENOMENA_HORIZON_HOURS} heures`} title="Phénomènes à surveiller">
          <PhenomenaPanel episodes={vm.episodes} horizonHours={PHENOMENA_HORIZON_HOURS} />
          <VigilanceLine state={vm.vigilance} summary={vm.vigilanceSummary} now={vm.now} />
        </Section>
      </div>

      {!(dryWindow.status === 'none' && dryWindow.reason === 'night') && (
        <Section eyebrow="Aujourd’hui" title="Sortir sans pluie">
          <DryWindowPanel window={dryWindow} windUnit={vm.windUnit} />
        </Section>
      )}

      <Section
        eyebrow="Heure par heure"
        title="Les 24 prochaines heures"
        aside={
          <button type="button" className={styles.link} onClick={() => vm.navigate('heures')}>
            Détail sur 72 h
          </button>
        }
      >
        <HourlyStrip
          bundle={vm.bundle}
          cascade={cascade}
          hours={24}
          windUnit={vm.windUnit}
          caption="Prévision heure par heure sur 24 heures"
        />
      </Section>

      <Section
        eyebrow="Jours suivants"
        title="Tendance"
        aside={
          <button type="button" className={styles.link} onClick={() => vm.navigate('jours')}>
            Voir 15 jours
          </button>
        }
      >
        <DailyList
          days={vm.days.slice(0, 5)}
          ensemble={vm.ensembleDays}
          windUnit={vm.windUnit}
          today={vm.today}
        />
      </Section>

      {solar !== null && vm.peakKwp !== null && (
        <Collapsible
          id="solar"
          eyebrow="Estimation"
          title="Production solaire sur 48 heures"
          defaultOpen
        >
          <Suspense fallback={<p className="note">Chargement de l’estimation…</p>}>
            <SolarPanel outlook={solar} peakKwp={vm.peakKwp} today={vm.today} />
          </Suspense>
        </Collapsible>
      )}

      {mountain !== null &&
        shouldShowMountain({
          kind: vm.terrain?.kind ?? null,
          elevation: vm.place.elevation,
          outlook: mountain,
        }) && (
          <Collapsible
            id="mountain"
            eyebrow="72 heures"
            title="Neige et isotherme 0 °C"
            defaultOpen
          >
            <MountainPanel outlook={mountain} />
          </Collapsible>
        )}

      <Collapsible id="conditions" eyebrow="Repères du jour" title="Soleil, rosée, gel">
        <ConditionsPanel nowPoint={nowPoint} today={vm.days[0] ?? null} />
      </Collapsible>

      <Collapsible id="air" eyebrow="Air" title="Qualité de l’air et pollens">
        <AirQualityPanel state={vm.airQuality} hour={vm.currentHour} />
      </Collapsible>

      <Collapsible id="alerts" eyebrow="Alertes personnelles" title="Me signaler, pour ce lieu">
        <AlertRulesEditor
          placeId={vm.place.id}
          placeName={vm.place.alias ?? vm.place.name}
          rules={vm.alertRules}
          windUnit={vm.windUnit}
          onAdd={vm.addAlert}
          onToggle={vm.toggleAlert}
          onRemove={vm.removeAlert}
        />
      </Collapsible>
    </div>
  );
}
