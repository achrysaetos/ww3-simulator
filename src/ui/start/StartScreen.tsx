import { useEffect, useMemo, useRef, useState } from 'react';
import type { NationId } from '../../core/types';
import type { SimClient } from '../client';
import type { Palette } from '../colors';
import { Flag } from '../flags';
import { LoadFileInput } from '../GameFlow';
import { openingFocus } from '../MapView';
import { autoAcceptOn, crisesOn, setAutoAccept, setCrises } from '../prefs';
import { resetCoach } from '../coach/coach';
import { COMMAND_ROLES, type RoleId } from '../staff/roles';
import { fmtUsdB } from '../widgets';
import { featuredNations, lonLatLabel, scenarioInfo, shortName, standing } from './scenarioInfo';
import { StartGlobe, type GlobeArc, type TheatreMark } from './StartGlobe';
import '../theme/kit.css';
import './start.css';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const pad = (n: number) => String(n).padStart(2, '0');
const dateLabel = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
/** How much of the war each role puts in the player's hands, as lit segments of three. */
const ROLE_SHARE: Record<RoleId, number> = { cinc: 1, marshal: 2, brigade: 3 };

function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  return `${Math.round(h / 24)} days ago`;
}

function RoleIcon({ id }: { id: RoleId }) {
  if (id === 'cinc') return <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="11.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M13 5.8 L15 10.6 L20.2 11 L16.2 14.4 L17.5 19.4 L13 16.7 L8.5 19.4 L9.8 14.4 L5.8 11 L11 10.6 Z" fill="currentColor" /></svg>;
  if (id === 'marshal') return <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><path d="M4 4 L22 22 M22 4 L4 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M4 4 L8 4.6 M4 4 L4.6 8 M22 4 L18 4.6 M22 4 L21.4 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
  return <svg width="30" height="22" viewBox="0 0 30 22" aria-hidden="true">{[0, 1, 2].flatMap((c) => [0, 1].map((r) => <g key={`${c}${r}`} transform={`translate(${c * 10} ${r * 11})`}><rect x="0.6" y="0.6" width="8.4" height="8.4" fill="none" stroke="currentColor" strokeWidth="1.1" /><path d="M0.6 0.6 L9 9 M9 0.6 L0.6 9" stroke="currentColor" strokeWidth="0.9" /></g>))}</svg>;
}

function useStageScale(): number {
  const get = () => Math.min(window.innerWidth / 1440, window.innerHeight / 900);
  const [s, setS] = useState(get);
  useEffect(() => {
    // Observe the page, not just window resizes: a tab opened with no size yet gets its first real size without one.
    const ro = new ResizeObserver(() => setS(get()));
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, []);
  return s;
}

/** Title screen: pick a scenario, a nation and how much of the war you run; or continue a saved one. */
export function StartScreen({ client, palette }: { client: SimClient; palette: Palette }) {
  const { scenarios, nationCards, map } = client;
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const scenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios.find((s) => s.id === 'ukraine-2026') ?? scenarios[0];
  const [nation, setNation] = useState<NationId | null>(null);
  const [role, setRole] = useState<RoleId>('cinc');
  const [search, setSearch] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [crises, setCrisesState] = useState(crisesOn);
  const [autoAccept, setAutoAcceptState] = useState(autoAcceptOn);
  const [coachReset, setCoachReset] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const scale = useStageScale();
  useEffect(() => setNation(scenario?.suggestedNation ?? null), [scenario?.id]);

  const infos = useMemo(() => new Map(scenarios.map((s) => [s.id, scenarioInfo(s, map, nationCards)])), [scenarios, map, nationCards]);
  const begin = () => {
    if (scenario && nation && !client.starting) client.start(scenario.id, nation, role);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSearch(null); setSettings(false); return; }
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'Enter') { e.preventDefault(); begin(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!scenario) return <div className="st-root" data-testid="start-screen"><p className="st-loading">Loading scenarios…</p></div>;
  const info = infos.get(scenario.id)!;
  const chosen = nation ? nationCards.get(nation) : undefined;
  const featured = featuredNations(scenario, nationCards, nation);
  const theatre = info.theatre;
  const ll = (node: number) => ({ lon: map.lon[node], lat: map.lat[node] });
  const marks: TheatreMark[] = scenarios.flatMap((s) => {
    const t = infos.get(s.id)?.theatre;
    if (!t || (!s.wars.length && s.id !== scenario.id)) return [];
    return [{ id: s.id, label: t.name.toUpperCase(), selected: s.id === scenario.id, ...ll(t.node) }];
  }).filter((m, i, all) => m.selected || !all.some((o, j) => j < i && Math.abs(o.lon - m.lon) + Math.abs(o.lat - m.lat) < 2));
  const capital = (id: NationId) => {
    const i = map.nationIds.indexOf(id);
    const cell = i < 0 ? undefined : map.data.nations[i].capital?.cell;
    return cell === undefined ? null : ll(cell);
  };
  const arcs: GlobeArc[] = scenario.wars.flatMap(([a, b]) => {
    const from = capital(a), to = capital(b);
    return from && to ? [{ from, to }] : [];
  });
  const focusNode = openingFocus(map, scenario, scenario.suggestedNation);
  const focus = focusNode === null ? null : ll(focusNode);
  const idx = scenarios.indexOf(scenario);
  const all = [...nationCards.values()].sort((a, b) => a.name.localeCompare(b.name));
  const q = search?.trim().toLowerCase() ?? '';
  const found = search === null ? [] : all.filter((n) => !q || n.name.toLowerCase().includes(q) || n.id.toLowerCase() === q).slice(0, 8);
  const slotScenario = client.slot ? scenarios.find((s) => s.id === client.slot!.scenario) : undefined;
  const slotDay = client.slot ? Math.floor((client.slot.tick * 6) / 24) : 0;

  return (
    <div className="st-root" data-testid="start-screen">
      <StartGlobe
        client={client}
        palette={palette}
        focus={focus}
        marks={marks}
        arcs={arcs}
        callout={theatre ? { kicker: `THEATRE ${pad(idx + 1)} · SELECTED`, title: theatre.name.toUpperCase(), detail: `${lonLatLabel(map.lon[theatre.node], map.lat[theatre.node])} · D-DAY ${dateLabel(scenario.startDate).slice(0, 6)}` } : null}
      />
      <div className="st-shade" aria-hidden="true" />
      <div className="ww-vig" />
      <div className="ww-scan" />

      <div className="st-stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <header className="st-word">
          <h1><span className="st-w1">World War </span><span className="st-w2">III</span></h1>
          <div className="st-sub"><i /><span>Strategic Command</span><b /></div>
        </header>
        <p className="st-pitch">Every nation. Every real army, ship and missile.<br />Six hours a turn. <strong>Your call.</strong></p>

        <section className="st-scen" aria-label="Scenario">
          <div className="st-h"><span className="ww-label">Scenario</span><b /><span className="ww-mono">{pad(idx + 1)} / {pad(scenarios.length)}</span></div>
          <div className="st-scen-list" role="radiogroup" aria-label="Scenarios">
            {scenarios.map((s, i) => {
              const inf = infos.get(s.id)!;
              const on = s.id === scenario.id;
              const date = <span className="st-row-date ww-mono">{dateLabel(s.startDate)}</span>;
              const threat = <span className={`st-threat l${inf.threat.level}`}><span className="st-pips">{[1, 2, 3, 4, 5].map((k) => <i key={k} className={k <= inf.threat.level ? 'on' : ''} />)}</span>{inf.threat.label}</span>;
              return (
                <button key={s.id} type="button" role="radio" aria-checked={on} className={`st-row ${on ? 'on ww-corners' : ''}`} onClick={() => setScenarioId(s.id)} data-testid={`scenario-${s.id}`}>
                  <span className="st-row-n ww-mono">{pad(i + 1)}</span>
                  <span className="st-row-main">
                    <span className="st-row-top">
                      <span className="st-row-t ww-title">{inf.title} <em>{inf.year}</em></span>
                      {!on && date}
                      {!on && threat}
                    </span>
                    <span className="st-row-p">{on ? s.summary : inf.premise}</span>
                    {on && (
                      <span className="st-row-foot">
                        <span className="st-row-sides ww-mono">
                          {inf.sides.length ? <>{inf.sides.slice(0, 3).join('   ')}{inf.sides.length > 3 && `   +${inf.sides.length - 3} more`}</> : 'No war yet: declare any you like'}
                        </span>
                        {date}
                        {threat}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="st-nation" aria-label="Choose your nation">
          <div className="st-h"><span className="ww-label">Choose your nation</span><b /></div>
          <div className="st-flags">
            {featured.map((id) => {
              const n = nationCards.get(id)!;
              return (
                <button key={id} type="button" className={`st-flag ${id === nation ? 'on' : ''}`} aria-pressed={id === nation} onClick={() => setNation(id)} data-testid={`pick-${id}`}>
                  <Flag id={id} name={n.name} width={42} />
                  <span>{shortName(id, nationCards)}</span>
                </button>
              );
            })}
            <button type="button" className={`st-flag st-all ${search !== null ? 'on' : ''}`} onClick={() => setSearch(search === null ? '' : null)} aria-expanded={search !== null} data-testid="nation-search-open">
              <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="12" fill="none" stroke="currentColor" strokeWidth="1.4" /><ellipse cx="15" cy="15" rx="5.5" ry="12" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M3 15 H27 M5 9 H25 M5 21 H25" stroke="currentColor" strokeWidth="1.1" /></svg>
              <span>All {all.length}<br />nations</span>
            </button>
          </div>
          {search !== null && (
            <div className="st-search ww-glass ww-corners" role="dialog" aria-label="Find a nation">
              <input
                autoFocus
                value={search}
                placeholder="Search 193 nations…"
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && found[0]) { setNation(found[0].id); setSearch(null); } }}
                data-testid="nation-search"
                aria-label="Nation name"
              />
              <ul>
                {found.map((n) => (
                  <li key={n.id}>
                    <button type="button" className={n.id === nation ? 'on' : ''} onClick={() => { setNation(n.id); setSearch(null); }} data-testid={`search-${n.id}`}>
                      <Flag id={n.id} name={n.name} width={27} /><span>{n.name}</span><span className="ww-muted">{n.blocs[0] ?? 'Non-aligned'}</span>
                    </button>
                  </li>
                ))}
                {!found.length && <li className="ww-muted st-none">No nation by that name.</li>}
              </ul>
            </div>
          )}
          <div className="st-nation-line ww-mono" data-testid="nation-line">
            {chosen && <><b>{chosen.name}</b><i>·</i>{standing(scenario, chosen.id)}<i>·</i>GDP {fmtUsdB(chosen.gdpUsdB)}<i>·</i>{chosen.blocs.slice(0, 2).join(', ') || 'Non-aligned'}<i>·</i>{chosen.doctrine === 'none' ? 'No nuclear weapons' : 'Nuclear power'}</>}
          </div>
        </section>

        <section className="st-role" aria-label="Your role">
          <div className="st-h"><span className="ww-label">Your role</span><b /><span className="st-h-note">Change it any time</span></div>
          <div className="st-roles" role="radiogroup" aria-label="Role">
            {COMMAND_ROLES.map((r) => {
              const on = r.id === role;
              return (
                <button key={r.id} type="button" role="radio" aria-checked={on} className={`st-rolecard ${on ? 'on ww-corners' : ''}`} onClick={() => setRole(r.id)} data-testid={`start-role-${r.id}`} title={r.staff}>
                  <span className="st-rc-top"><RoleIcon id={r.id} />{r.id === 'cinc' && <span className="st-rec">Recommended</span>}</span>
                  <span className="st-rc-name ww-title">{r.name}</span>
                  <span className="st-rc-you">{r.you}</span>
                  <span className="st-rc-bars">{[1, 2, 3].map((k) => <i key={k} className={k <= ROLE_SHARE[r.id] ? 'on' : ''} />)}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="st-ready" aria-label="Ready">
          <div className="st-h"><span className="ww-label">Ready, commander</span></div>
          <button type="button" className="st-begin" disabled={!nation || client.starting} onClick={begin} data-testid="start">
            <span className="st-begin-t">{client.starting ? 'Building' : 'Begin'}</span>
            {client.starting ? <span className="st-begin-spin" aria-hidden="true" /> : <><span className="ww-kbd">Enter</span><svg width="14" height="22" viewBox="0 0 14 22" aria-hidden="true"><path d="M3 3 L11 11 L3 19" fill="none" stroke="currentColor" strokeWidth="2.6" /></svg></>}
          </button>
          <button type="button" className="st-continue" disabled={!client.slot || client.starting} onClick={() => void client.load()} data-testid="start-quickload">
            <span className="ww-title">Continue</span>
            <span className="ww-mono">{client.slot ? `${infos.get(client.slot.scenario)?.title ?? slotScenario?.name ?? client.slot.scenario} · D+${slotDay} · saved ${ago(client.slot.savedAt)}` : 'No saved war in this browser'}</span>
          </button>
        </section>

        <div className="st-tools">
          <button type="button" className="st-icon" onClick={() => file.current?.click()} aria-label="Load a save file" title="Load a save file" data-testid="start-load-file">
            <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden="true"><path d="M2 1 H10 L14 5 V17 H2 Z" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M5 8 H11 M5 11 H11 M5 14 H9" stroke="currentColor" strokeWidth="1.2" /></svg>
          </button>
          <button type="button" className={`st-icon ${settings ? 'on' : ''}`} onClick={() => setSettings((o) => !o)} aria-label="Settings" aria-expanded={settings} data-testid="start-settings">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M9 1.5 V4 M9 14 V16.5 M1.5 9 H4 M14 9 H16.5 M3.7 3.7 L5.5 5.5 M12.5 12.5 L14.3 14.3 M3.7 14.3 L5.5 12.5 M12.5 5.5 L14.3 3.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="9" cy="9" r="5.4" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
          </button>
          <LoadFileInput client={client} inputRef={file} />
          {settings && (
            <div className="st-settings ww-glass ww-corners" role="dialog" aria-label="Settings" data-testid="settings">
              <span className="ww-label">Settings</span>
              <label className="st-toggle">
                <input type="checkbox" checked={crises} onChange={(e) => { setCrises(e.target.checked); setCrisesState(e.target.checked); }} data-testid="setting-crises" />
                <span><b>Crises stop the clock</b><small>A treaty call, a nuclear alert, a peace offer or a threat to your capital takes the screen. Off, they wait in the Daily Brief.</small></span>
              </label>
              <label className="st-toggle">
                <input type="checkbox" checked={autoAccept} onChange={(e) => { setAutoAccept(e.target.checked); setAutoAcceptState(e.target.checked); }} data-testid="setting-auto-accept" />
                <span><b>Auto-accept staff advice</b><small>Your staff answers crises and approves the Daily Brief on its own, so the clock never waits on you. Nuclear release stays yours.</small></span>
              </label>
              <button type="button" className="ww-btn" disabled={coachReset} onClick={() => { resetCoach(); setCoachReset(true); }} data-testid="setting-coach">{coachReset ? 'Tour will show next game' : 'Show the tour again'}</button>
            </div>
          )}
        </div>

        {(client.notice?.tone === 'error' || client.error) && <p className="st-error" data-testid="start-notice">{client.error ?? client.notice!.text}</p>}
        <p className="st-credit ww-mono">Terrain NOAA ETOPO 2022 · Borders Natural Earth · Open-source orders of battle</p>
      </div>
    </div>
  );
}
