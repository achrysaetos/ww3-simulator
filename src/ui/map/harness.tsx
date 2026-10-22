/**
 * Dev-only page that runs a scenario on the full-bleed map with the kit's top
 * bar, the layout of the redesign screens, for screenshots and frame timing:
 *   /src/ui/map/harness.html?scenario=ukraine-2026&nation=UKR
 */
import { useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { FormationId, NationId, NodeId } from '../../core/types';
import { SimClient } from '../client';
import { Palette } from '../colors';
import { MapView } from '../MapView';
import type { Overlays } from '../renderer';
import { TopBar } from './TopBar';
import '../styles.css';

const q = new URLSearchParams(location.search);
const scenario = q.get('scenario') ?? 'ukraine-2026';
const nation = (q.get('nation') ?? 'UKR') as NationId;
const SPEEDS = [0, 1, 5, 20] as const;
const OVERLAYS: Overlays = { air: false, sea: false, infra: false, fallout: true, weather: false, cities: true, seaZones: false };

const client = new SimClient();
(window as unknown as { __client?: SimClient }).__client = client;
const started = client.subscribe(() => {
  if (client.scenarios.length && !client.meta && !client.starting) {
    client.start(scenario, nation);
    started();
  }
});

function Harness() {
  useSyncExternalStore(client.subscribe, client.getVersion);
  const palette = useRef(new Palette((id) => client.nationCards.get(id as NationId)?.blocs ?? [])).current;
  const [selected, setSelected] = useState<FormationId | null>(null);
  const focus = useRef<((n: NodeId) => void) | null>(null);
  if (!client.meta) return <div style={{ color: '#8fa6c0', padding: 40, fontFamily: 'Inter' }}>Starting {scenario}…</div>;
  const n = client.state.nations.get(nation);
  const date = client.state.date ? new Date(client.state.date) : null;
  const start = new Date(client.meta.scenario.startDate);
  const day = date ? Math.max(0, Math.floor((date.getTime() - start.getTime()) / 864e5)) : 0;
  const atWar = client.state.wars.some(([a, b]) => a === nation || b === nation);
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#04070c' }}>
      <MapView
        client={client} palette={palette} places={client.places} playAs={nation} selected={selected} targeting={null} overlays={OVERLAYS}
        orders={null} onSelectFormation={setSelected} onTarget={() => {}} onContext={() => {}} onPlanClick={() => {}} focusHandle={focus}
      />
      <TopBar
        nation={{ id: nation, name: n?.name ?? nation }}
        subtitle={`Supreme Commander · ${client.meta.scenario.name}`}
        date={date}
        day={day}
        speed={client.ticksPerSec}
        speeds={SPEEDS}
        onSpeed={(s) => client.setSpeed(s)}
        stats={n ? [
          { label: 'War support', value: `${Math.round(n.warSupport * 100)}%`, tone: n.warSupport < 0.4 ? 'bad' : undefined },
          { label: 'Mobilized', value: `${Math.round(n.mobilization * 100)}%`, tone: 'warn' },
          { label: 'Reserves', value: n.reserves >= 1e6 ? `${(n.reserves / 1e6).toFixed(1)}M` : `${Math.round(n.reserves / 1e3)}k` },
        ] : []}
        defcon={atWar ? 3 : 5}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
