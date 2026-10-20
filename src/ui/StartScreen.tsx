import { useEffect, useState } from 'react';
import type { NationId } from '../core/types';
import type { SimClient } from './client';
import type { Palette } from './colors';
import type { ScenarioCard } from './snapshot';
import { fmtUsdB } from './widgets';

const MAJOR_POWERS = ['USA', 'CHN', 'RUS', 'IND', 'GBR', 'FRA', 'DEU', 'JPN'] as NationId[];

/** Pick a scenario, then any of the world's nations; the scenario's suggested nation is preselected. */
export function StartScreen({ client, palette }: { client: SimClient; palette: Palette }) {
  const { scenarios, nationCards } = client;
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const scenario: ScenarioCard | undefined = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0];
  const [nation, setNation] = useState<NationId | null>(null);
  useEffect(() => setNation(scenario?.suggestedNation ?? null), [scenario?.id]);

  if (!scenario) return <div className="start"><p className="muted pad">Loading scenarios…</p></div>;
  const all = [...nationCards.values()].sort((a, b) => a.name.localeCompare(b.name));
  const featured = [...new Set([scenario.suggestedNation, ...scenario.belligerents, ...MAJOR_POWERS])].filter((id) => nationCards.has(id)).slice(0, 12);
  const chosen = nation ? nationCards.get(nation) : undefined;

  return (
    <div className="start" data-testid="start-screen">
      <header className="start-head">
        <div className="brand"><span className="brand-mark">◆</span> WW3 <span className="brand-sub">Strategic Command</span></div>
        <p className="muted">Every nation's 2025-26 order of battle, real platforms and stockpiles, simulated in 6-hour turns.</p>
      </header>
      <h2 className="start-h">1. Scenario</h2>
      <div className="scenario-grid">
        {scenarios.map((s) => (
          <button key={s.id} className={`scenario-card ${s.id === scenario.id ? 'active' : ''}`} onClick={() => setScenarioId(s.id)} data-testid={`scenario-${s.id}`}>
            <span className="sc-name">{s.name}</span>
            <span className="sc-date mono">{new Date(s.startDate).toUTCString().slice(5, 16)}</span>
            <span className="sc-summary">{s.summary}</span>
            <span className="sc-suggest muted small">Suggested: {nationCards.get(s.suggestedNation)?.name ?? s.suggestedNation}</span>
          </button>
        ))}
      </div>
      <h2 className="start-h">2. Nation</h2>
      <div className="featured">
        {featured.map((id) => {
          const n = nationCards.get(id)!;
          return (
            <button key={id} className={id === nation ? 'active' : ''} onClick={() => setNation(id)} data-testid={`pick-${id}`}>
              <span className="swatch" style={{ background: palette.of(id).css }} />
              <span>{n.name}</span>
              <span className="muted small">{n.blocs[0] ?? 'non-aligned'}{scenario.belligerents.includes(id) ? ' · at war' : ''}</span>
            </button>
          );
        })}
      </div>
      <div className="row start-go">
        <select value={nation ?? ''} onChange={(e) => setNation(e.target.value as NationId)} data-testid="nation-select">
          {all.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
        <span className="muted small">{all.length} nations playable{chosen ? ` · ${chosen.name}: GDP ${fmtUsdB(chosen.gdpUsdB)}, ${chosen.blocs.slice(0, 3).join(', ') || 'no alliances'}` : ''}</span>
        <button className="primary" disabled={!nation || client.starting} onClick={() => nation && client.start(scenario.id, nation)} data-testid="start">
          {client.starting ? 'Building world…' : 'Take command'}
        </button>
      </div>
      {client.error && <p className="tt-warn pre">{client.error}</p>}
    </div>
  );
}
