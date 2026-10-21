import { atWar, hostility, relation, type SimContext, type System } from '../../core/engine';
import type { Catalog } from '../../core/catalog';
import type { GameMap } from '../../core/map';
import type { NationId, NodeId, World } from '../../core/types';
import { alliances } from '../../data/nations';
import { DISPLACED_2025 } from '../../data/politics/displacement';
import { draw } from './hash';
import { exitsOf } from './routes';
import { civilCell, civilNation, flowKey, type CivilState } from './state';

export * from './state';

/**
 * Daily hazard that a resident of a cell flees, by cause. Calibrated on Ukraine in 2022
 * (UNHCR, IOM): about 14M of 41M displaced within three months, half of them abroad.
 * - Ground fighting: Mariupol fell from ~430k to ~100k in the ~two-month siege and Bakhmut
 *   from ~70k to a few thousand over 2022-23: about 2% a day.
 * - Front line within a cell or two: Kharkiv and Zaporizhzhia lost a third to a half of
 *   their people in the first months, about 0.3% a day.
 * - Enemy occupation: Kherson city kept ~60-80k of ~280k by November 2022: ~0.2% a day after
 *   the first rush, which is OCCUPATION_RUSH of the residents on capture.
 * - Capital threatened: the national shock of February-March 2022, ~7% of the country abroad
 *   in three weeks and as many displaced inside: about 1% a day across the country at first,
 *   fading over SHOCK_DAYS.
 * - Strikes and blackouts: estimates. Ukraine's cities kept their people through the 2022-23
 *   grid campaign and the 2025 drone raids, so a strike moves few.
 * - Fallout: residents leave a contaminated zone within weeks (Chernobyl, Fukushima).
 */
const HAZARD_PER_DAY = { battle: 0.02, front: 0.003, occupied: 0.002, capitalThreat: 0.01, perHit: 2e-5, strikeCap: 0.002, blackout: 0.0003, fallout: 0.1 } as const;
/**
 * The panic of a threatened capital passes within weeks (Kyiv began refilling in April 2022)
 * and reaches as far as the war feels close: Lviv, 470 km from Kyiv, emptied less, and a
 * threat to Moscow would not empty Siberia. SHOCK_REACH_KM halves it.
 */
const SHOCK_DAYS = 30;
const SHOCK_REACH_KM = 600;
const OCCUPATION_RUSH = 0.1;
/** Danger moves half as many people once a cell has lived with it this long (est.). */
const EXPOSURE_HALF_DAYS = 90;
/** Exposure of cells already on a front or occupied when the scenario opens: the war began in 2022 or 2014. */
const LONG_WAR_EXPOSURE_DAYS = 1000;

/**
 * Share of the displaced who cross a border when an open one is close, and the distance
 * that halves it. Ukraine, May 2022: ~6M refugees to ~8M IDPs, with men of 18-60 barred
 * from leaving; the east fled mostly westward inside the country.
 */
const ABROAD_MAX = 0.5;
const ACCESS_KM = 500;
/**
 * A crossing pulls by the host's economy (jobs and diaspora: ~1.3M Ukrainians worked in Poland
 * before 2022), as the square root of its GDP, over distance: CROSSING_KM quarters the pull.
 * Fitted to the 2022 first-entry split, Poland ~57%, Romania ~15%, Hungary and Moldova ~10%
 * each, Slovakia ~8% (UNHCR border crossings, March 2022).
 */
const CROSSING_KM = 600;
/**
 * People leave the country in numbers only when the state itself is in danger: its capital
 * threatened or a real share of it occupied. Otherwise few go abroad: Belgorod and Kursk
 * evacuees in 2023-24 stayed in Russia.
 */
const EXISTENTIAL_LOSS = 0.02;
const LIMITED_WAR_ABROAD = 0.1;
/** Opinion of the origin at or below which a neighbour is hostile ground: few cross it by choice. */
const HOSTILE_OPINION = -30;
const HOSTILE_OPENNESS = 0.1;

/**
 * Refugees who reach a first host settle within about a month or move on. Poorer hosts keep
 * fewer: Moldova received ~700k Ukrainians in 2022 and kept ~100k, Poland kept about a third
 * of the ~3.5M who crossed in the first three months (UNHCR). Moves go to the host's EU and
 * NATO partners, weighted by economy and distance (Germany and Czechia took most).
 */
const SETTLE_PER_DAY = 1 / 30;
const ONWARD_PER_DAY = 0.15;
const POVERTY_GDP_PER_CAPITA = 15_000;

/** Displaced people go home once their cell is quiet and held by their own state: IDPs within months (Kyiv refilled by late 2022), refugees slowly. */
const RETURN_PER_DAY = { idp: 0.01, abroad: 0.001 } as const;

/**
 * Civilian deaths. OHCHR verified ~2,000-2,500 civilians killed a year in Ukraine in
 * 2024-25, about half near the front (shelling, short-range drones) and half from
 * long-range missiles and drones, with ~3-5 injured per death. IN_BATTLE is the daily death
 * rate of residents in a cell under ground combat; PER_WARHEAD_KG is deaths per kilogram of
 * warhead that got through, at REF_DENSITY residents per km2. Fitted to the ukraine-2026 run,
 * whose front-line cells keep more residents than the real, largely emptied front zone: a
 * Kh-101 (400 kg) into Kyiv's density kills ~0.2 here against ~1 per hit in the 2024-25 raids.
 */
const KILLED_PER_DAY_IN_BATTLE = 1.5e-6;
const KILLED_PER_WARHEAD_KG = 1e-4;
const REF_DENSITY = 100;
const INJURED_PER_KILLED = 3;

/**
 * Partisans in occupied cells, per million residents a day: a few rail sabotage acts a
 * week across the ~3-4M people of occupied Ukraine in 2023-24 (Atesh and Ukrainian military
 * intelligence claims; Russian railway reports). Partisans are far quieter once their own
 * state has stopped fighting (Crimea 2014-21). A successful act cuts the cell's rail and
 * road capacity by SABOTAGE_CUT, which repair crews then restore.
 */
const SABOTAGE_PER_MILLION_DAY = 0.07;
const SABOTAGE_AT_PEACE = 0.2;
const SABOTAGE_CUT = 0.35;
const MIN_RAIL_KM = 20;

interface TickInputs {
  battles: Map<number, number>;
  hits: Map<number, number>;
  /** Warhead kilograms that got through, per cell. */
  warheadKg: Map<number, number>;
  captured: Set<number>;
}

function readEvents(world: World, map: GameMap, catalog: Catalog, s: CivilState): TickInputs {
  const t: TickInputs = { battles: new Map(), hits: new Map(), warheadKg: new Map(), captured: new Set() };
  for (const e of world.events) {
    if (e.type === 'battle') {
      if (e.node < map.landCount && e.domain !== 'air' && e.domain !== 'sea') t.battles.set(e.node, (t.battles.get(e.node) ?? 0) + 1);
    } else if (e.type === 'strike') {
      const m = catalog.munitions.get(e.munition);
      if (e.target >= map.landCount || e.fired <= e.intercepted || m?.yieldKt) continue;
      t.hits.set(e.target, (t.hits.get(e.target) ?? 0) + e.fired - e.intercepted);
      t.warheadKg.set(e.target, (t.warheadKg.get(e.target) ?? 0) + (e.fired - e.intercepted) * (m?.warheadKg ?? 0));
    } else if (e.type === 'node_captured') {
      if (e.to !== map.owner[e.node]) t.captured.add(e.node);
    } else if (e.type === 'nuclear_detonation' && e.node < map.landCount && e.casualties > 0) {
      const owner = map.owner[e.node];
      civilCell(s, e.node).killed += e.casualties;
      const n = civilNation(s, owner);
      n.killed += e.casualties;
      n.injured += e.casualties * INJURED_PER_KILLED;
    }
  }
  return t;
}

export function cellPopulation(world: World, map: GameMap, c: number): number {
  const owner = world.nations[map.owner[c]];
  return owner ? map.popShare[c] * (owner.stats.population ?? owner.population) : 0;
}

function residents(world: World, map: GameMap, s: CivilState, c: number): number {
  const cell = s.cells[c];
  const pop = cellPopulation(world, map, c);
  return cell ? Math.max(0, pop - cell.idp - cell.abroad - cell.killed) : pop;
}

function areaKm2(map: GameMap, c: number): number {
  const side = 2 * map.halfDeg[c] * 111;
  return side * side * Math.max(0.1, Math.cos((map.lat[c] * Math.PI) / 180));
}

/** How open `host` is to people fleeing `origin`: shut to its enemies, near shut where hostile. */
function openness(world: World, origin: NationId, host: NationId): number {
  if (atWar(world, origin, host)) return 0;
  return relation(world, origin, host).opinion <= HOSTILE_OPINION ? HOSTILE_OPENNESS : 1;
}

/** Splits `fled` people of cell `c` between internal displacement and each reachable host. */
function displace(world: World, map: GameMap, s: CivilState, c: number, fled: number): void {
  const origin = map.owner[c];
  const occupier = world.control[c] !== origin ? world.control[c] : undefined;
  const exits = exitsOf(map, origin);
  const km = exits.km.get(c);
  const weights: number[] = [];
  let access = 0, total = 0;
  exits.hosts.forEach((h, i) => {
    const open = h === occupier ? 1 : openness(world, origin, h);
    const d = h === occupier ? 0 : (km?.[i] ?? Infinity);
    access = Math.max(access, open / (1 + d / ACCESS_KM));
    const w = (open * Math.sqrt((world.nations[h]?.stats.gdp ?? 0) / 1e9)) / (1 + d / CROSSING_KM) ** 2;
    weights.push(w);
    total += w;
  });
  const a = world.slices.diplomacy?.assessment[origin];
  const existential = !!occupier || !!a?.capitalThreatened || (a?.popLost ?? 0) >= EXISTENTIAL_LOSS;
  const abroad = total > 0 ? fled * ABROAD_MAX * access * (existential ? 1 : LIMITED_WAR_ABROAD) : 0;
  const cell = civilCell(s, c);
  const n = civilNation(s, origin);
  cell.idp += fled - abroad;
  n.idps += fled - abroad;
  if (abroad <= 0) return;
  cell.abroad += abroad;
  n.refugees += abroad;
  exits.hosts.forEach((h, i) => {
    const x = (abroad * weights[i]) / total;
    if (x <= 0) return;
    const k = flowKey(origin, h);
    s.hosted[k] = (s.hosted[k] ?? 0) + x;
    s.transit[k] = (s.transit[k] ?? 0) + x;
    s.crossed[k] = (s.crossed[k] ?? 0) + x;
  });
}

const partnerCache = new Map<NationId, NationId[]>();
const OPEN_BLOCS = alliances.filter((a) => a.id === 'EU' || a.id === 'NATO');
/**
 * Where refugees who move on from `host` go: the members of the EU and NATO it belongs to, or,
 * for a host in neither (Moldova), those its land neighbours belong to (Romania's).
 */
function partners(map: GameMap, host: NationId): NationId[] {
  let p = partnerCache.get(host);
  if (!p) {
    const of = (n: NationId) => OPEN_BLOCS.filter((a) => a.members.includes(n)).flatMap((a) => a.members);
    let members = of(host);
    if (!members.length) members = exitsOf(map, host).hosts.flatMap(of);
    partnerCache.set(host, (p = [...new Set(members)].filter((m) => m !== host).sort()));
  }
  return p;
}

function moveOn(world: World, map: GameMap, s: CivilState, dtDays: number): void {
  for (const [k, amount] of Object.entries(s.transit)) {
    if (amount < 1) {
      delete s.transit[k];
      continue;
    }
    const [origin, host] = k.split('>') as [NationId, NationId];
    const h = world.nations[host];
    const perCapita = (h?.stats.gdp ?? 0) / Math.max(1, h?.stats.population ?? 1);
    const onwardRate = ONWARD_PER_DAY / (1 + perCapita / POVERTY_GDP_PER_CAPITA);
    const leaving = amount * (1 - Math.exp(-(onwardRate + SETTLE_PER_DAY) * dtDays));
    const onward = (leaving * onwardRate) / (onwardRate + SETTLE_PER_DAY);
    s.transit[k] = amount - leaving;
    const dests = partners(map, host).filter((d) => d !== origin && world.nations[d] && openness(world, origin, d) === 1);
    if (!dests.length || onward <= 0) continue;
    const hc = world.nations[host].capital;
    const w = dests.map((d) => (world.nations[d].stats.gdp ?? 0) / (1 + map.distanceKm(hc, world.nations[d].capital) / 1000));
    const sum = w.reduce((a, b) => a + b, 0);
    if (sum <= 0) continue;
    s.hosted[k] -= onward;
    dests.forEach((d, i) => {
      const dk = flowKey(origin, d);
      s.hosted[dk] = (s.hosted[dk] ?? 0) + (onward * w[i]) / sum;
    });
  }
}

/** Returns to cell `c`, taking refugees home from every host in proportion. */
function goHome(s: CivilState, origin: NationId, c: number, dtDays: number): void {
  const cell = s.cells[c];
  const n = civilNation(s, origin);
  const idp = cell.idp * (1 - Math.exp(-RETURN_PER_DAY.idp * dtDays));
  const abroad = cell.abroad * (1 - Math.exp(-RETURN_PER_DAY.abroad * dtDays));
  cell.idp -= idp;
  cell.abroad -= abroad;
  n.idps = Math.max(0, n.idps - idp);
  if (abroad <= 0 || n.refugees <= 0) return;
  const keep = Math.max(0, 1 - abroad / n.refugees);
  n.refugees -= abroad;
  const prefix = `${origin}>`;
  for (const k of Object.keys(s.hosted)) {
    if (!k.startsWith(prefix)) continue;
    s.hosted[k] *= keep;
    if (s.transit[k]) s.transit[k] *= keep;
  }
}

function seed(world: World, map: GameMap): CivilState {
  const s: CivilState = { cells: {}, nations: {}, hosted: {}, transit: {}, crossed: {} };
  for (const [origin, stock] of Object.entries(DISPLACED_2025)) {
    if (!world.nations[origin as NationId]) continue;
    const n = civilNation(s, origin as NationId);
    n.idps = stock.idps;
    for (const [host, count] of Object.entries(stock.hosted)) {
      if (!world.nations[host as NationId]) continue;
      s.hosted[flowKey(origin as NationId, host as NationId)] = count;
      n.refugees += count;
    }
  }
  // Occupation when the scenario opens means a war running for years: the occupied cells, their
  // neighbours, both sides of the border between occupier and occupied, and the occupied nation
  // as a whole have already lost those who would flee.
  const pairs = new Set<string>();
  for (let c = 0; c < map.landCount; c++) {
    const holder = world.control[c], owner = map.owner[c];
    if (!holder || holder === owner) continue;
    pairs.add(`${owner}|${holder}`).add(`${holder}|${owner}`);
    civilNation(s, owner).shockDays = LONG_WAR_EXPOSURE_DAYS;
    civilCell(s, c).exposure = LONG_WAR_EXPOSURE_DAYS;
    for (let k = map.adjStart[c]; k < map.adjStart[c + 1]; k++) if (map.adj[k] < map.landCount) civilCell(s, map.adj[k]).exposure = LONG_WAR_EXPOSURE_DAYS;
  }
  for (let c = 0; c < map.landCount; c++)
    for (let k = map.adjStart[c]; k < map.adjStart[c + 1]; k++) {
      const m = map.adj[k];
      if (m < map.landCount && pairs.has(`${map.owner[c]}|${map.owner[m]}`)) civilCell(s, c).exposure = LONG_WAR_EXPOSURE_DAYS;
    }
  return s;
}

/** Where the lines run: cells beside a foe's cell, and cells held by someone other than their owner. */
interface Lines {
  key: string;
  front: Set<number>;
  occupied: number[];
}

/**
 * The lines move only when a cell changes hands or a war starts or ends, so they are rebuilt
 * then and reused otherwise. Derived from the world, never saved with it.
 */
const linesCache = new WeakMap<World, Lines>();

function lines(world: World, map: GameMap, foes: ReadonlyMap<NationId, ReadonlySet<NationId>>, captured: boolean): Lines {
  let key = '';
  for (const p of hostility(world).pairs) if (p.war) key += `${p.a}${p.b}`;
  const cached = linesCache.get(world);
  if (cached && cached.key === key && !captured) return cached;
  const front = new Set<number>(), occupied: number[] = [];
  const control = world.control;
  for (let c = 0; c < map.landCount; c++) {
    const ctrl = control[c];
    if (ctrl && ctrl !== map.owner[c]) occupied.push(c);
    const enemies = foes.get(ctrl);
    if (!enemies) continue;
    for (let k = map.adjStart[c]; k < map.adjStart[c + 1]; k++) {
      const o = control[map.adj[k]];
      if (o && enemies.has(o)) {
        front.add(c);
        break;
      }
    }
  }
  const out = { key, front, occupied };
  linesCache.set(world, out);
  return out;
}

const cellsByOwner = new WeakMap<GameMap, Map<NationId, number[]>>();
function cellsOf(map: GameMap, n: NationId): number[] {
  let byOwner = cellsByOwner.get(map);
  if (!byOwner) {
    byOwner = new Map();
    for (let c = 0; c < map.landCount; c++) (byOwner.get(map.owner[c]) ?? byOwner.set(map.owner[c], []).get(map.owner[c])!).push(c);
    cellsByOwner.set(map, byOwner);
  }
  return byOwner.get(n) ?? [];
}

/**
 * Cells anything can happen to this tick: the front, occupied cells, the homeland of a nation
 * whose capital is threatened, and any cell fought over, struck, blacked out, contaminated or
 * already carrying displaced people. The quiet rest of the world is never visited.
 */
function candidates(world: World, map: GameMap, s: CivilState, t: TickInputs, l: Lines, shaken: NationId[]): number[] {
  const out: number[] = [];
  const seen = new Uint8Array(map.landCount);
  const add = (c: number) => {
    if (c < map.landCount && !seen[c]) {
      seen[c] = 1;
      out.push(c);
    }
  };
  for (const c of l.front) add(c);
  for (const c of l.occupied) add(c);
  for (const n of shaken) for (const c of cellsOf(map, n)) add(c);
  for (const k in s.cells) add(+k);
  for (const c of t.hits.keys()) add(c);
  for (const c of t.battles.keys()) add(c);
  for (const c of t.captured) add(c);
  for (const k in world.theater.power ?? {}) add(+k);
  for (const k in world.theater.fallout) add(+k);
  return out;
}

function step(world: World, ctx: SimContext): void {
  const { map } = ctx;
  const s = world.slices.civil;
  const dtDays = world.dtHours / 24;
  const t = readEvents(world, map, ctx.catalog, s);
  const foes = hostility(world).foes;
  const assessment = world.slices.diplomacy?.assessment ?? {};
  const power = world.theater.power ?? {};
  const fallout = world.theater.fallout;
  for (const n of Object.values(s.nations)) n.underOccupation = 0;

  const l = lines(world, map, foes, t.captured.size > 0);
  const shaken = (Object.keys(assessment) as NationId[]).filter((n) => assessment[n].capitalThreatened && Math.exp(-civilNation(s, n).shockDays / SHOCK_DAYS) > 1e-3);
  for (const c of candidates(world, map, s, t, l, shaken)) {
    const ctrl = world.control[c];
    const owner = map.owner[c];
    if (!ctrl || !owner) continue;
    const occupied = ctrl !== owner;
    const blackout = 1 - (power[c] ?? 1);
    const contaminated = fallout[c] ?? 0;
    const hits = t.hits.get(c) ?? 0;
    const battle = t.battles.has(c);

    const front = l.front.has(c);
    const occupiedByFoe = occupied && atWar(world, owner, ctrl);
    const local = (battle ? HAZARD_PER_DAY.battle : 0) + (front ? HAZARD_PER_DAY.front : 0) + (occupiedByFoe ? HAZARD_PER_DAY.occupied : 0)
      + Math.min(HAZARD_PER_DAY.strikeCap, hits * HAZARD_PER_DAY.perHit) + (blackout >= 0.1 ? blackout * HAZARD_PER_DAY.blackout : 0);
    const shock = !occupied && shaken.includes(owner)
      ? (HAZARD_PER_DAY.capitalThreat * Math.exp(-civilNation(s, owner).shockDays / SHOCK_DAYS)) / (1 + (map.distanceKm(c as NodeId, world.nations[owner].capital) / SHOCK_REACH_KM) ** 2)
      : 0;
    const here = residents(world, map, s, c);

    if (occupied) {
      civilNation(s, owner).underOccupation += here;
      if (relation(world, owner, ctrl).opinion <= HOSTILE_OPINION) sabotage(world, map, s, c, owner, ctrl, here, dtDays);
    }
    if (local <= 0 && shock < 1e-6 && !contaminated && !t.captured.has(c)) {
      const cell = s.cells[c];
      if (cell && !occupied && (cell.idp > 1 || cell.abroad > 1)) goHome(s, owner, c, dtDays);
      continue;
    }
    const cell = civilCell(s, c);
    let fire = shock + Math.min(1, contaminated) * HAZARD_PER_DAY.fallout;
    if (local > 0) {
      fire += local / (1 + (cell.exposure / EXPOSURE_HALF_DAYS) ** 2);
      cell.exposure += dtDays;
    }
    let fled = here * (1 - Math.exp(-fire * dtDays));
    if (t.captured.has(c)) fled += (here - fled) * OCCUPATION_RUSH;

    let killed = battle ? here * KILLED_PER_DAY_IN_BATTLE * dtDays : 0;
    if (hits) killed += (t.warheadKg.get(c) ?? 0) * KILLED_PER_WARHEAD_KG * (here / areaKm2(map, c) / REF_DENSITY);
    killed = Math.min(killed, here - fled);
    if (killed > 0) {
      cell.killed += killed;
      const n = civilNation(s, owner);
      n.killed += killed;
      n.injured += killed * INJURED_PER_KILLED;
    }
    if (fled > 0) displace(world, map, s, c, fled);
  }
  for (const [n, a] of Object.entries(assessment)) if (a.capitalThreatened) civilNation(s, n as NationId).shockDays += dtDays;
  moveOn(world, map, s, dtDays);
}

function sabotage(world: World, map: GameMap, s: CivilState, c: number, owner: NationId, occupier: NationId, people: number, dtDays: number): void {
  if (map.railKm[c] < MIN_RAIL_KM || people <= 0) return;
  const status = world.nations[owner]?.status;
  if (status === 'capitulated' || status === 'collapsed') return;
  const rate = SABOTAGE_PER_MILLION_DAY * (people / 1e6) * (atWar(world, owner, occupier) ? 1 : SABOTAGE_AT_PEACE);
  if (draw(world.seed, world.tick, c) >= 1 - Math.exp(-rate * dtDays)) return;
  world.theater.infrastructure[c as NodeId] *= 1 - SABOTAGE_CUT;
  civilNation(s, occupier).sabotage++;
}

/**
 * Civilians: who flees fighting, occupation and strikes, where refugees go and stay, civilian
 * deaths, and partisan sabotage in occupied cells. Runs after the combat systems so it reads
 * this tick's battles, strikes and captures, and before diplomacy and politics read it.
 */
export const civil: System = {
  id: 'civil',
  init(world, ctx) {
    world.slices.civil = seed(world, ctx.map);
  },
  step,
};
