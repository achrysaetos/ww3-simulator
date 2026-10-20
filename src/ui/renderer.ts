/**
 * Canvas map renderer. Geometry is projected once per canvas size into Path2D
 * objects in base-projection coordinates; pan and zoom only change the canvas
 * transform. Territory paths rebuild only when control or wars change.
 */
import { geoGraticule10, geoPath, type GeoProjection } from 'd3-geo';
import type { GeoPermissibleObjects } from 'd3-geo';
import type { GameMap } from '../core/map';
import type { FormationId, NodeId, SimEvent } from '../core/types';
import { rgba, type Palette } from './colors';
import { eventNode } from './events';
import { NO_NATION, type ClientState } from './snapshot';
import { drawCounter } from './symbols';
import { baseProjection, IDENTITY, type ViewTransform } from './view';

export interface Overlays {
  air: boolean;
  sea: boolean;
  infra: boolean;
  fallout: boolean;
  cities: boolean;
  seaZones: boolean;
}

export interface RenderInput {
  state: ClientState;
  nationIds: readonly string[];
  playAs: string | null;
  selected: FormationId | null;
  hoverNode: NodeId | null;
  targeting: 'order' | 'nuclear' | null;
  overlays: Overlays;
}

interface Flash {
  node: NodeId;
  kind: 'battle' | 'strike' | 'nuclear' | 'capture';
  t0: number;
}

const FLASH_MS: Record<Flash['kind'], number> = { battle: 900, strike: 1100, capture: 700, nuclear: 4000 };
const ECHELON_W: Record<string, number> = { battalion: 13, squadron: 13, flotilla: 15, brigade: 16, wing: 17, division: 19, task_group: 19, corps: 21, army: 23, fleet: 23 };

export interface HitBox {
  id: FormationId;
  x: number;
  y: number;
  w: number;
  h: number;
}

export class MapRenderer {
  proj: GeoProjection = baseProjection(800, 400);
  t: ViewTransform = IDENTITY;
  width = 800;
  height = 400;
  dpr = 1;
  hits: HitBox[] = [];
  private readonly ctx: CanvasRenderingContext2D;
  /** Base-projection corners per node: x0,y0 .. x3,y3. */
  private corners = new Float32Array(0);
  private center = new Float32Array(0);
  private readonly orthoEdges: Int32Array;
  private readonly edgeEnds: Float32Array;
  private edgeProj = new Float32Array(0);
  private sphere = new Path2D();
  private graticule = new Path2D();
  private seaGrid = new Path2D();
  private borders: Path2D | null = null;
  private coast: Path2D | null = null;
  private topo: { borders: GeoPermissibleObjects; land: GeoPermissibleObjects } | null = null;
  private territory = new Map<number, Path2D>();
  private front = new Path2D();
  private builtFor = { control: -1, wars: '', size: '' };
  private flashes: Flash[] = [];
  private airPatterns = new Map<number, CanvasPattern>();
  private sortedCities: GameMap['cities'] | null = null;

  constructor(private readonly canvas: HTMLCanvasElement, readonly map: GameMap, private readonly palette: Palette) {
    this.ctx = canvas.getContext('2d')!;
    const edges: number[] = [], ends: number[] = [];
    for (let a = 0; a < map.landCount; a++)
      for (let k = map.adjStart[a]; k < map.adjStart[a + 1]; k++) {
        const b = map.adj[k];
        if (b <= a || b >= map.landCount) continue;
        const dLat = map.lat[b] - map.lat[a], dLon = ((map.lon[b] - map.lon[a] + 540) % 360) - 180;
        if (Math.abs(dLat) < 0.01 && Math.abs(Math.abs(dLon) - 1) < 0.01) {
          const lon = map.lon[a] + dLon / 2;
          edges.push(a, b);
          ends.push(lon, map.lat[a] - 0.5, lon, map.lat[a] + 0.5);
        } else if (Math.abs(dLon) < 0.01 && Math.abs(Math.abs(dLat) - 1) < 0.01) {
          const lat = map.lat[a] + dLat / 2;
          edges.push(a, b);
          ends.push(map.lon[a] - 0.5, lat, map.lon[a] + 0.5, lat);
        }
      }
    this.orthoEdges = Int32Array.from(edges);
    this.edgeEnds = Float32Array.from(ends);
  }

  setTopology(borders: GeoPermissibleObjects, land: GeoPermissibleObjects) {
    this.topo = { borders, land };
    this.buildTopology();
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.proj = baseProjection(width, height);
    const { map, proj } = this;
    this.corners = new Float32Array(map.size * 8);
    this.center = new Float32Array(map.size * 2);
    for (let n = 0; n < map.size; n++) {
      const half = n < map.landCount ? 0.5 : 1.5;
      const la = map.lat[n], lo = map.lon[n];
      const pts = [[lo - half, la + half], [lo + half, la + half], [lo + half, la - half], [lo - half, la - half]];
      pts.forEach(([x, y], i) => {
        const p = proj([Math.max(-180, Math.min(180, x)), Math.max(-90, Math.min(90, y))])!;
        this.corners[n * 8 + i * 2] = p[0];
        this.corners[n * 8 + i * 2 + 1] = p[1];
      });
      const c = proj([lo, la])!;
      this.center[n * 2] = c[0];
      this.center[n * 2 + 1] = c[1];
    }
    this.edgeProj = new Float32Array(this.edgeEnds.length);
    for (let i = 0; i < this.edgeEnds.length; i += 2) {
      const p = proj([this.edgeEnds[i], this.edgeEnds[i + 1]])!;
      this.edgeProj[i] = p[0];
      this.edgeProj[i + 1] = p[1];
    }
    const path = (o: GeoPermissibleObjects) => {
      const p = new Path2D();
      geoPath(proj, p as unknown as CanvasRenderingContext2D)(o);
      return p;
    };
    this.sphere = path({ type: 'Sphere' });
    this.graticule = path(geoGraticule10());
    this.seaGrid = new Path2D();
    for (let n = map.landCount; n < map.size; n++) this.quad(this.seaGrid, n);
    this.buildTopology();
    this.builtFor.size = `${width}x${height}`;
    this.builtFor.control = -1;
  }

  private buildTopology() {
    if (!this.topo) return;
    const mk = (o: GeoPermissibleObjects) => {
      const p = new Path2D();
      geoPath(this.proj, p as unknown as CanvasRenderingContext2D)(o);
      return p;
    };
    this.borders = mk(this.topo.borders);
    this.coast = mk(this.topo.land);
  }

  private quad(p: Path2D, n: number) {
    const c = this.corners, o = n * 8;
    p.moveTo(c[o], c[o + 1]);
    p.lineTo(c[o + 2], c[o + 3]);
    p.lineTo(c[o + 4], c[o + 5]);
    p.lineTo(c[o + 6], c[o + 7]);
    p.closePath();
  }

  screenOf(n: NodeId): [number, number] {
    return [this.center[n * 2] * this.t.k + this.t.x, this.center[n * 2 + 1] * this.t.k + this.t.y];
  }

  addEvents(events: readonly SimEvent[], now: number) {
    for (const e of events) {
      const node = eventNode(e);
      if (node === null) continue;
      const kind = e.type === 'nuclear_detonation' ? 'nuclear' : e.type === 'strike' ? 'strike' : e.type === 'battle' ? 'battle' : 'capture';
      this.flashes.push({ node, kind, t0: now });
    }
    if (this.flashes.length > 300) this.flashes.splice(0, this.flashes.length - 300);
  }

  get animating() {
    return this.flashes.length > 0;
  }

  private rebuildTerritory(state: ClientState, nationIds: readonly string[]) {
    const atWar = new Set<string>();
    for (const [a, b] of state.wars) {
      atWar.add(`${a}|${b}`);
      atWar.add(`${b}|${a}`);
    }
    if (this.builtFor.control !== state.controlVersion) {
      this.territory.clear();
      const ctl = state.control;
      for (let n = 0; n < this.map.landCount; n++) {
        const owner = ctl[n];
        if (owner === NO_NATION) continue;
        let p = this.territory.get(owner);
        if (!p) this.territory.set(owner, (p = new Path2D()));
        this.quad(p, n);
      }
    }
    this.front = new Path2D();
    const e = this.orthoEdges, ep = this.edgeProj, ctl = state.control;
    for (let i = 0; i < e.length; i += 2) {
      const a = ctl[e[i]], b = ctl[e[i + 1]];
      if (a === b || a === NO_NATION || b === NO_NATION) continue;
      if (!atWar.has(`${nationIds[a]}|${nationIds[b]}`)) continue;
      const j = i * 2;
      this.front.moveTo(ep[j], ep[j + 1]);
      this.front.lineTo(ep[j + 2], ep[j + 3]);
    }
    this.builtFor.control = state.controlVersion;
    this.builtFor.wars = state.warsKey;
  }

  private airPattern(nation: number, nationId: string): CanvasPattern | null {
    const cached = this.airPatterns.get(nation);
    if (cached) return cached;
    const [r, g, b] = this.palette.of(nationId).rgb;
    const tile = new OffscreenCanvas(8, 8);
    const c = tile.getContext('2d')!;
    c.strokeStyle = rgba([Math.min(255, r + 90), Math.min(255, g + 90), Math.min(255, b + 90)], 0.85);
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(0, 8); c.lineTo(8, 0);
    c.moveTo(-2, 2); c.lineTo(2, -2);
    c.moveTo(6, 10); c.lineTo(10, 6);
    c.stroke();
    const p = this.ctx.createPattern(tile, 'repeat');
    if (p) this.airPatterns.set(nation, p);
    return p;
  }

  render(input: RenderInput, now: number) {
    const { ctx, t, dpr } = this;
    const { state, nationIds, overlays } = input;
    if (this.builtFor.control !== state.controlVersion || this.builtFor.wars !== state.warsKey) this.rebuildTerritory(state, nationIds);
    const nationAt = (i: number) => nationIds[i] ?? '';

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05080d';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * t.x, dpr * t.y);
    const px = 1 / t.k;

    ctx.fillStyle = '#0c1724';
    ctx.fill(this.sphere);
    ctx.strokeStyle = 'rgba(120,160,200,0.07)';
    ctx.lineWidth = px;
    ctx.stroke(this.graticule);
    if (overlays.seaZones && t.k >= 2) {
      ctx.strokeStyle = 'rgba(110,150,190,0.08)';
      ctx.stroke(this.seaGrid);
    }

    for (const [nation, path] of this.territory) {
      const [h, s, l] = this.palette.of(nationAt(nation)).hsl;
      ctx.fillStyle = `hsl(${h} ${s * 0.85}% ${l * 0.62}%)`;
      ctx.fill(path);
    }

    if (overlays.sea) this.drawSparseControl(state.sea, nationAt, 0.4);
    if (overlays.air) {
      const a = state.air;
      for (let i = 0; i < a.length; i += 3) {
        const pat = this.airPattern(a[i + 1], nationAt(a[i + 1]));
        if (!pat) continue;
        const p = new Path2D();
        this.quad(p, a[i]);
        ctx.fillStyle = rgba(this.palette.of(nationAt(a[i + 1])).rgb, 0.18 * a[i + 2]);
        ctx.fill(p);
        ctx.globalAlpha = 0.35 + 0.6 * a[i + 2];
        ctx.fillStyle = pat;
        ctx.fill(p);
        ctx.globalAlpha = 1;
      }
      ctx.globalAlpha = 1;
    }
    if (overlays.infra) {
      const v = state.infra;
      for (let i = 0; i < v.length; i += 2) {
        const p = new Path2D();
        this.quad(p, v[i]);
        ctx.fillStyle = `rgba(255,110,40,${Math.min(0.85, (1 - v[i + 1]) * 1.1)})`;
        ctx.fill(p);
      }
    }
    if (overlays.fallout) {
      const v = state.fallout;
      for (let i = 0; i < v.length; i += 2) {
        const p = new Path2D();
        this.quad(p, v[i]);
        ctx.fillStyle = `rgba(190,255,60,${Math.min(0.75, v[i + 1] * 0.8)})`;
        ctx.fill(p);
      }
    }

    if (this.coast) {
      ctx.strokeStyle = 'rgba(150,185,220,0.45)';
      ctx.lineWidth = 0.8 * px;
      ctx.stroke(this.coast);
    }
    if (this.borders) {
      ctx.strokeStyle = 'rgba(225,232,242,0.42)';
      ctx.lineWidth = 0.7 * px;
      ctx.stroke(this.borders);
    }

    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,60,40,0.35)';
    ctx.lineWidth = 7 * px;
    ctx.stroke(this.front);
    ctx.strokeStyle = '#ff5a3c';
    ctx.lineWidth = 2.4 * px;
    ctx.stroke(this.front);

    if (input.hoverNode !== null && input.targeting) {
      const p = new Path2D();
      this.quad(p, input.hoverNode);
      ctx.fillStyle = input.targeting === 'nuclear' ? 'rgba(255,230,80,0.45)' : 'rgba(255,255,255,0.25)';
      ctx.fill(p);
      ctx.strokeStyle = input.targeting === 'nuclear' ? '#ffe14d' : '#ffffff';
      ctx.lineWidth = 1.5 * px;
      ctx.stroke(p);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (overlays.cities) this.drawCities();
    this.drawOrders(input);
    this.drawFormations(input);
    this.drawFlashes(now);
  }

  private drawSparseControl(v: Float32Array, nationAt: (i: number) => string, alpha: number) {
    const ctx = this.ctx;
    for (let i = 0; i < v.length; i += 3) {
      const p = new Path2D();
      this.quad(p, v[i]);
      ctx.fillStyle = rgba(this.palette.of(nationAt(v[i + 1])).rgb, alpha * v[i + 2]);
      ctx.fill(p);
    }
  }

  /** Capitals first, then by population; a label is skipped if it would overlap one already placed. */
  private drawCities() {
    const { ctx, t } = this;
    const minPop = t.k < 2 ? 5e6 : t.k < 4 ? 1.5e6 : t.k < 8 ? 4e5 : 0;
    ctx.font = '500 11px "Inter", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const placed: [number, number, number, number][] = [];
    const cities = this.sortedCities ??= [...this.map.cities].sort((a, b) => Number(b.capital) - Number(a.capital) || b.pop - a.pop);
    for (const c of cities) {
      if (c.pop < minPop && !(c.capital && c.pop > minPop / 5)) continue;
      const p = this.proj([c.lon, c.lat]);
      if (!p) continue;
      const x = p[0] * t.k + t.x, y = p[1] * t.k + t.y;
      if (x < -20 || y < -20 || x > this.width + 20 || y > this.height + 20) continue;
      ctx.fillStyle = c.capital ? '#f4f7fb' : '#b8c4d4';
      ctx.strokeStyle = '#05080d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (c.capital) ctx.rect(x - 2.5, y - 2.5, 5, 5);
      else ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
      if (c.capital) ctx.stroke();
      const w = ctx.measureText(c.name).width;
      const box: [number, number, number, number] = [x + 4, y - 7, x + 6 + w, y + 7];
      if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
      placed.push(box);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(5,8,13,0.85)';
      ctx.strokeText(c.name, x + 5, y);
      ctx.fillStyle = c.capital ? '#e8eef6' : '#a9b6c6';
      ctx.fillText(c.name, x + 5, y);
    }
  }

  private drawOrders(input: RenderInput) {
    const { ctx } = this;
    ctx.save();
    ctx.setLineDash([5, 4]);
    for (const f of input.state.formations) {
      if (f.target === null || f.status === 'destroyed' || f.target === f.node) continue;
      const mine = f.entry.nation === input.playAs, sel = f.entry.id === input.selected;
      if (!mine && !sel) continue;
      const [x0, y0] = this.screenOf(f.node), [x1, y1] = this.screenOf(f.target);
      ctx.strokeStyle = sel ? '#ffe066' : f.posture === 'strike' ? 'rgba(255,120,90,0.8)' : 'rgba(200,220,255,0.6)';
      ctx.lineWidth = sel ? 2 : 1.2;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      const a = Math.atan2(y1 - y0, x1 - x0);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - 8 * Math.cos(a - 0.4), y1 - 8 * Math.sin(a - 0.4));
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - 8 * Math.cos(a + 0.4), y1 - 8 * Math.sin(a + 0.4));
      ctx.stroke();
      ctx.setLineDash([5, 4]);
    }
    ctx.restore();
  }

  private drawFormations(input: RenderInput) {
    const { ctx, t } = this;
    const zoomScale = Math.min(1.5, Math.max(0.6, 0.7 + 0.2 * Math.log2(t.k)));
    const byNode = new Map<number, typeof input.state.formations>();
    for (const f of input.state.formations) {
      if (f.status === 'destroyed' || f.status === 'embarked') continue;
      let l = byNode.get(f.node);
      if (!l) byNode.set(f.node, (l = []));
      l.push(f);
    }
    this.hits = [];
    for (const [node, list] of byNode) {
      const [x, y] = this.screenOf(node as NodeId);
      if (x < -40 || y < -40 || x > this.width + 40 || y > this.height + 40) continue;
      list.sort((a, b) => (a.entry.id === input.selected ? 1 : 0) - (b.entry.id === input.selected ? 1 : 0));
      const shown = list.slice(-4);
      shown.forEach((f, i) => {
        const w = (ECHELON_W[f.entry.echelon] ?? 16) * zoomScale * (0.8 + 0.2 * f.strength);
        const off = (i - (shown.length - 1)) * 5;
        const col = this.palette.of(f.entry.nation);
        const box = drawCounter(ctx, x + off, y + off, w, f.entry.kind, f.entry.echelon, f.strength, {
          fill: col.css, ink: '#0a0e14', selected: f.entry.id === input.selected, routed: f.status === 'routed', own: f.entry.nation === input.playAs,
        });
        this.hits.push({ id: f.entry.id, ...box });
      });
      if (list.length > shown.length) {
        ctx.font = '600 10px "JetBrains Mono", ui-monospace, monospace';
        ctx.fillStyle = '#e8eef6';
        ctx.textAlign = 'left';
        ctx.fillText(`+${list.length - shown.length}`, x + 14 * zoomScale, y + 10);
      }
    }
  }

  private drawFlashes(now: number) {
    const { ctx } = this;
    this.flashes = this.flashes.filter((f) => now - f.t0 < FLASH_MS[f.kind]);
    for (const f of this.flashes) {
      const u = (now - f.t0) / FLASH_MS[f.kind];
      const [x, y] = this.screenOf(f.node);
      ctx.save();
      switch (f.kind) {
        case 'battle':
          ctx.strokeStyle = `rgba(255,170,60,${1 - u})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, 6 + 16 * u, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'strike':
          ctx.strokeStyle = `rgba(255,70,70,${1 - u})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, 4 + 10 * u, 0, Math.PI * 2);
          ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y);
          ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 12);
          ctx.stroke();
          ctx.fillStyle = `rgba(255,230,200,${(1 - u) * 0.9})`;
          ctx.beginPath();
          ctx.arc(x, y, 3 * (1 - u) + 1, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'capture':
          ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - u)})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(x - 4 - 4 * u, y - 4 - 4 * u, 8 + 8 * u, 8 + 8 * u);
          break;
        case 'nuclear': {
          const r = 10 + 90 * Math.sqrt(u);
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, `rgba(255,255,240,${1 - u})`);
          g.addColorStop(0.35, `rgba(255,210,90,${0.8 * (1 - u)})`);
          g.addColorStop(1, 'rgba(255,80,20,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = `rgba(255,240,200,${0.8 * (1 - u)})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, r * 1.3, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
      }
      ctx.restore();
    }
  }
}
