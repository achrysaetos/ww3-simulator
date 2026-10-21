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
import { NO_NATION, type ClientState, type FormationView } from './snapshot';
import { clusterStacks, gridSize, indexByNode, type Stack } from './stacks';
import { CounterSprites, type CounterBox } from './symbols';
import { baseProjection, IDENTITY, MAX_ZOOM, type ViewTransform } from './view';

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
/** Target on-screen size of a stacking cell. */
const CELL_PX = 34;
/** On-screen width of one map node at which its stack fans out into individual counters. */
const FAN_PX = 48;
const FAN_SLOT_PX = 26;
/** How far the cached base layer extends past each edge of the view, CSS px. */
const PAN_MARGIN = 220;

export interface HitBox extends CounterBox {
  /** Strongest first. */
  ids: FormationId[];
  node: NodeId;
  /** Zoom that opens this stack up; null when it cannot open further. */
  zoomTo: number | null;
}

export class MapRenderer {
  proj: GeoProjection = baseProjection(800, 400);
  t: ViewTransform = IDENTITY;
  width = 800;
  height = 400;
  dpr = 1;
  hits: HitBox[] = [];
  /** The visible canvas: each frame is the cached scene plus animated flashes. */
  private readonly screen: CanvasRenderingContext2D;
  /** Draws into `scene`: everything but the flashes, redrawn only when the picture changes. */
  private ctx: CanvasRenderingContext2D;
  private scene: OffscreenCanvas;
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
  /** Control as of the last territory build, to rebuild only the nations whose cells changed hands. */
  private builtControl: Uint16Array | null = null;
  private front = new Path2D();
  private builtFor = { control: -1, wars: '', size: '' };
  private flashes: Flash[] = [];
  private airPatterns = new Map<number, CanvasPattern>();
  private sortedCities: GameMap['cities'] | null = null;
  private readonly sprites = new CounterSprites();
  private base: OffscreenCanvas | null = null;
  private baseAt: ViewTransform = IDENTITY;
  private baseFor: { air: Float32Array | null; control: number; overlays: Overlays | null; topo: Path2D | null } = { air: null, control: -1, overlays: null, topo: null };
  /** Projected width of one degree of longitude at zoom 1. */
  private degPx = 1;
  private byNode = new Map<NodeId, FormationView[]>();
  private indexedFrom: readonly FormationView[] | null = null;
  private stacks: Stack[] = [];
  private stacksGrid = -1;

  constructor(private readonly canvas: HTMLCanvasElement, readonly map: GameMap, private readonly palette: Palette) {
    this.screen = canvas.getContext('2d')!;
    this.scene = new OffscreenCanvas(canvas.width, canvas.height);
    this.ctx = this.scene.getContext('2d')! as unknown as CanvasRenderingContext2D;
    const edges: number[] = [], ends: number[] = [];
    for (let a = 0; a < map.landCount; a++)
      for (let k = map.adjStart[a]; k < map.adjStart[a + 1]; k++) {
        const b = map.adj[k];
        if (b <= a || b >= map.landCount) continue;
        // Cells are squares of different sizes; the frontier runs along the side two squares share.
        const ha = map.halfDeg[a], hb = map.halfDeg[b];
        const dLat = map.lat[b] - map.lat[a], dLon = ((map.lon[b] - map.lon[a] + 540) % 360) - 180;
        const latLo = Math.max(-ha, dLat - hb), latHi = Math.min(ha, dLat + hb);
        const lonLo = Math.max(-ha, dLon - hb), lonHi = Math.min(ha, dLon + hb);
        if (Math.abs(Math.abs(dLon) - ha - hb) < 1e-3 && latHi - latLo > 1e-3) {
          const lon = map.lon[a] + Math.sign(dLon) * ha;
          edges.push(a, b);
          ends.push(lon, map.lat[a] + latLo, lon, map.lat[a] + latHi);
        } else if (Math.abs(Math.abs(dLat) - ha - hb) < 1e-3 && lonHi - lonLo > 1e-3) {
          const lat = map.lat[a] + Math.sign(dLat) * ha;
          edges.push(a, b);
          ends.push(map.lon[a] + lonLo, lat, map.lon[a] + lonHi, lat);
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
    this.scene = new OffscreenCanvas(this.canvas.width, this.canvas.height);
    this.ctx = this.scene.getContext('2d')! as unknown as CanvasRenderingContext2D;
    this.proj = baseProjection(width, height);
    this.sprites.setDpr(dpr);
    const { map, proj } = this;
    this.degPx = proj([1, 0])![0] - proj([0, 0])![0];
    this.base = null;
    this.stacksGrid = -1;
    this.corners = new Float32Array(map.size * 8);
    this.center = new Float32Array(map.size * 2);
    for (let n = 0; n < map.size; n++) {
      const half = map.halfDeg[n];
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
    this.territory.clear();
    this.builtControl = null;
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
      const ctl = state.control, prev = this.builtControl;
      const dirty = new Set<number>();
      for (let n = 0; n < this.map.landCount; n++) {
        if (!prev) dirty.add(ctl[n]);
        else if (prev[n] !== ctl[n]) dirty.add(ctl[n]).add(prev[n]);
      }
      dirty.delete(NO_NATION);
      for (const owner of dirty) this.territory.delete(owner);
      for (let n = 0; n < this.map.landCount; n++) {
        const owner = ctl[n];
        if (!dirty.has(owner)) continue;
        let p = this.territory.get(owner);
        if (!p) this.territory.set(owner, (p = new Path2D()));
        this.quad(p, n);
      }
      this.builtControl = ctl.slice(0, this.map.landCount);
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

  private airPattern(ctx: CanvasRenderingContext2D, nation: number, nationId: string): CanvasPattern | null {
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
    const p = ctx.createPattern(tile, 'repeat');
    if (p) this.airPatterns.set(nation, p);
    return p;
  }

  /**
   * Draw a frame. `changed` says whether anything but the flashes moved since the last frame
   * (a snapshot, pan, zoom, hover or selection); while only flashes animate, a frame is one
   * blit of the cached scene plus the flashes, not 2,500 counters again.
   */
  render(input: RenderInput, now: number, changed = true) {
    if (changed) this.drawScene(input);
    const s = this.screen;
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.drawImage(this.scene, 0, 0);
    s.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawFlashes(s, now);
  }

  private drawScene(input: RenderInput) {
    const { ctx, t, dpr } = this;
    const { state, nationIds } = input;
    if (this.builtFor.control !== state.controlVersion || this.builtFor.wars !== state.warsKey) this.rebuildTerritory(state, nationIds);
    const dx = t.x - this.baseAt.x, dy = t.y - this.baseAt.y;
    if (!this.base || this.baseAt.k !== t.k || Math.abs(dx) > PAN_MARGIN || Math.abs(dy) > PAN_MARGIN || this.baseFor.air !== state.air || this.baseFor.control !== state.controlVersion || this.baseFor.overlays !== input.overlays || this.baseFor.topo !== this.coast) {
      this.renderBase(input);
      this.baseAt = { ...t };
      this.baseFor = { air: state.air, control: state.controlVersion, overlays: input.overlays, topo: this.coast };
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05080d';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.base!, Math.round((t.x - this.baseAt.x - PAN_MARGIN) * dpr), Math.round((t.y - this.baseAt.y - PAN_MARGIN) * dpr));

    if (input.hoverNode !== null && input.targeting) {
      ctx.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * t.x, dpr * t.y);
      const p = new Path2D();
      this.quad(p, input.hoverNode);
      ctx.fillStyle = input.targeting === 'nuclear' ? 'rgba(255,230,80,0.45)' : 'rgba(255,255,255,0.25)';
      ctx.fill(p);
      ctx.strokeStyle = input.targeting === 'nuclear' ? '#ffe14d' : '#ffffff';
      ctx.lineWidth = 1.5 / t.k;
      ctx.stroke(p);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawOrders(input);
    this.drawFormations(input);
  }

  /**
   * Everything that changes only with a snapshot, the zoom or the overlay
   * toggles goes into an offscreen bitmap PAN_MARGIN larger than the view on
   * each side. Panning within the margin, and animating flashes, then cost
   * one blit instead of rasterizing coastlines and 193 territories again.
   */
  private renderBase(input: RenderInput) {
    const { t, dpr } = this;
    const w = Math.ceil((this.width + 2 * PAN_MARGIN) * dpr), h = Math.ceil((this.height + 2 * PAN_MARGIN) * dpr);
    if (!this.base || this.base.width !== w || this.base.height !== h) {
      this.base = new OffscreenCanvas(w, h);
      this.airPatterns.clear();
    }
    const ctx = this.base.getContext('2d')! as unknown as CanvasRenderingContext2D;
    const { state, nationIds, overlays } = input;
    const nationAt = (i: number) => nationIds[i] ?? '';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * (t.x + PAN_MARGIN), dpr * (t.y + PAN_MARGIN));
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
      const [hu, sa, li] = this.palette.of(nationAt(nation)).hsl;
      ctx.fillStyle = `hsl(${hu} ${sa * 0.85}% ${li * 0.62}%)`;
      ctx.fill(path);
    }

    if (overlays.sea) this.drawSparseControl(ctx, state.sea, nationAt, 0.4);
    if (overlays.air) {
      const a = state.air;
      for (let i = 0; i < a.length; i += 3) {
        const pat = this.airPattern(ctx, a[i + 1], nationAt(a[i + 1]));
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
    }
    if (overlays.infra) this.fillPairs(ctx, state.infra, (v) => `rgba(255,110,40,${Math.min(0.85, (1 - v) * 1.1)})`);
    if (overlays.fallout) this.fillPairs(ctx, state.fallout, (v) => `rgba(190,255,60,${Math.min(0.75, v * 0.8)})`);

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

    ctx.setTransform(dpr, 0, 0, dpr, dpr * PAN_MARGIN, dpr * PAN_MARGIN);
    if (overlays.cities) this.drawCities(ctx);
  }

  /** Fill each node of a flat (node, value) list. */
  private fillPairs(ctx: CanvasRenderingContext2D, v: Float32Array, style: (value: number) => string) {
    for (let i = 0; i < v.length; i += 2) {
      const p = new Path2D();
      this.quad(p, v[i]);
      ctx.fillStyle = style(v[i + 1]);
      ctx.fill(p);
    }
  }

  private drawSparseControl(ctx: CanvasRenderingContext2D, v: Float32Array, nationAt: (i: number) => string, alpha: number) {
    for (let i = 0; i < v.length; i += 3) {
      const p = new Path2D();
      this.quad(p, v[i]);
      ctx.fillStyle = rgba(this.palette.of(nationAt(v[i + 1])).rgb, alpha * v[i + 2]);
      ctx.fill(p);
    }
  }

  /** Capitals first, then by population; a label is skipped if it would overlap one already placed. */
  private drawCities(ctx: CanvasRenderingContext2D) {
    const { t } = this;
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
      if (x < -PAN_MARGIN || y < -PAN_MARGIN || x > this.width + PAN_MARGIN || y > this.height + PAN_MARGIN) continue;
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

  /** Formations at a node, strongest first, as of the latest snapshot rendered. */
  formationsAt(node: NodeId): readonly FormationView[] {
    return this.byNode.get(node) ?? [];
  }

  private drawFormations(input: RenderInput) {
    const { ctx, t } = this;
    if (input.state.formations !== this.indexedFrom) {
      this.indexedFrom = input.state.formations;
      this.byNode = indexByNode(input.state.formations);
      this.stacksGrid = -1;
    }
    const grid = gridSize(CELL_PX, t.k);
    if (grid !== this.stacksGrid) {
      this.stacks = clusterStacks(this.byNode, (n) => [this.center[n * 2], this.center[n * 2 + 1]], grid);
      this.stacksGrid = grid;
    }
    const nodePx = this.degPx * t.k;
    const fan = nodePx >= FAN_PX;
    const zoomScale = Math.min(1.4, Math.max(0.75, 0.75 + 0.18 * Math.log2(t.k)));
    const atNode = new Map<NodeId, number>();
    const order = [...this.stacks].sort((a, b) => Number(a.nation === input.playAs) - Number(b.nation === input.playAs));
    this.hits = [];
    let selectedBox: CounterBox | null = null;
    for (const stack of order) {
      const [cx, cy] = this.screenOf(stack.node);
      if (cx < -60 || cy < -60 || cx > this.width + 60 || cy > this.height + 60) continue;
      const nth = atNode.get(stack.node) ?? 0;
      atNode.set(stack.node, nth + 1);
      const own = stack.nation === input.playAs;
      const fill = this.palette.of(stack.nation).css;
      if (fan && stack.nodes === 1 && stack.members.length > 1) {
        const cols = Math.max(2, Math.min(4, Math.floor(nodePx / FAN_SLOT_PX)));
        const cap = cols * cols;
        const shown = stack.members.length > cap ? stack.members.slice(0, cap - 1) : stack.members;
        const slots = shown.length + (stack.members.length > shown.length ? 1 : 0);
        const rows = Math.ceil(slots / cols), step = Math.min(FAN_SLOT_PX * zoomScale, nodePx / cols);
        const at = (i: number): [number, number] => [cx + ((i % cols) - (Math.min(cols, slots) - 1) / 2) * step + nth * 8, cy + (Math.floor(i / cols) - (rows - 1) / 2) * step + nth * 8];
        shown.forEach((f, i) => {
          const [x, y] = at(i);
          const box = this.sprites.draw(ctx, x, y, (ECHELON_W[f.entry.echelon] ?? 16) * zoomScale * 0.85, f.entry.kind, f.entry.echelon, f.strength, fill, own, f.status === 'routed');
          this.hits.push({ ...box, ids: [f.entry.id], node: stack.node, zoomTo: null });
          if (f.entry.id === input.selected) selectedBox = box;
        });
        if (shown.length < stack.members.length) {
          const rest = stack.members.slice(shown.length);
          const [x, y] = at(shown.length);
          const box = this.drawStack(rest, x, y, zoomScale * 0.85, fill, own);
          this.hits.push({ ...box, ids: rest.map((f) => f.entry.id), node: stack.node, zoomTo: t.k < MAX_ZOOM ? Math.min(MAX_ZOOM, t.k * 1.6) : null });
          if (rest.some((f) => f.entry.id === input.selected)) selectedBox = box;
        }
        continue;
      }
      const box = this.drawStack(stack.members, cx + nth * 7, cy + nth * 7, zoomScale, fill, own);
      const zoomTo = stack.members.length === 1 ? null : stack.nodes > 1 ? Math.min(MAX_ZOOM, t.k * 2.5) : Math.min(MAX_ZOOM, Math.max(t.k * 1.5, (FAN_PX * 1.05) / this.degPx));
      this.hits.push({ ...box, ids: stack.members.map((f) => f.entry.id), node: stack.node, zoomTo: zoomTo !== null && zoomTo > t.k ? zoomTo : null });
      if (input.selected && stack.members.some((f) => f.entry.id === input.selected)) selectedBox = box;
    }
    if (selectedBox) {
      const b: CounterBox = selectedBox;
      ctx.save();
      ctx.shadowColor = '#ffe066';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x - 3, b.y - 2, b.w + 6, b.h + 4);
      ctx.restore();
    }
  }

  /** The strongest member's symbol over a shadow counter, with a count badge and the stack's mean strength. */
  private drawStack(members: readonly FormationView[], x: number, y: number, zoomScale: number, fill: string, own: boolean): CounterBox {
    const { ctx } = this;
    const lead = members[0];
    const w = (ECHELON_W[lead.entry.echelon] ?? 16) * zoomScale;
    if (members.length === 1) return this.sprites.draw(ctx, x, y, w, lead.entry.kind, lead.entry.echelon, lead.strength, fill, own, lead.status === 'routed');
    let strength = 0;
    for (const f of members) strength += f.strength;
    ctx.globalAlpha = 0.6;
    this.sprites.draw(ctx, x + 3, y - 3, w, lead.entry.kind, lead.entry.echelon, 0, fill, own, false);
    ctx.globalAlpha = 1;
    const box = this.sprites.draw(ctx, x, y, w, lead.entry.kind, lead.entry.echelon, strength / members.length, fill, own, false);
    const label = members.length > 999 ? '999+' : String(members.length);
    const bw = 5 + label.length * 6, bx = x + w / 2 - 2, by = y - w * 0.33 - 9;
    ctx.fillStyle = own ? '#e8f1ff' : '#0a0e14';
    ctx.strokeStyle = own ? '#0a0e14' : 'rgba(232,241,255,0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, 12, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = own ? '#0a0e14' : '#e8eef6';
    ctx.font = '600 9.5px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + bw / 2, by + 6.5);
    return { x: box.x, y: Math.min(box.y, by), w: box.w + bw - 2, h: box.h + (box.y - Math.min(box.y, by)) };
  }

  private drawFlashes(ctx: CanvasRenderingContext2D, now: number) {
    this.flashes = this.flashes.filter((f) => now - f.t0 < FLASH_MS[f.kind]);
    for (const f of this.flashes) {
      // rAF timestamps can precede the performance.now() stamped on the event.
      const u = Math.max(0, now - f.t0) / FLASH_MS[f.kind];
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
