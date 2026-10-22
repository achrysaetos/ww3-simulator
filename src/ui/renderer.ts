/**
 * The map: a WebGL globe of pre-rendered relief with the war situation shaded
 * in (map/globe.ts), under a 2D canvas of the things that move or get clicked:
 * counters, labels, orders, contested cells and event flashes. The camera
 * flies; it never jumps, so motion on the map always means something happened.
 */
import type { GameMap } from '../core/map';
import type { FormationId, NodeId, SimEvent } from '../core/types';
import type { Palette } from './colors';
import { eventNode } from './events';
import { contactLabel, contactRing, isStale, type ContactInfo } from './map/contacts';
import { GlobeGL } from './map/globe';
import { ControlMask, OverlayRaster, Rel, relations } from './map/situation';
import { cityName } from './placeNames';
import type { Manifest } from './map/tiles';
import { weatherLayer } from '../systems/weather/effects';
import type { ClientState, FormationView } from './snapshot';
import { clusterStacks, gridSize, indexByNode, type Stack } from './stacks';
import { CounterSprites, ECHELON_W, LOOK, type CounterBox, type Side } from './symbols';
import {
  BAND_PRESET, bandOf, clampCamera, flight, kmPerPx, project, pxPerDeg, unproject, worldZoom, zoomAt, zoomForPxPerDeg,
  type Camera, type Viewport, type ZoomBand,
} from './view';

export interface Overlays {
  air: boolean;
  sea: boolean;
  infra: boolean;
  fallout: boolean;
  weather: boolean;
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

const FLASH_MS: Record<Flash['kind'], number> = { battle: 1100, strike: 1300, capture: 900, nuclear: 4500 };
/** Target on-screen size of a stacking cell, per band. */
const CELL_PX: Record<ZoomBand, number> = { world: 72, theatre: 92, front: 34 };
/** On-screen width of one map node at which its stack fans out into individual counters. */
const FAN_PX = 70;
const FAN_SLOT_PX = 50;
const COUNTER_SCALE: Record<ZoomBand, number> = { world: 0.72, theatre: 0.9, front: 1.05 };

export interface HitBox extends CounterBox {
  /** Strongest first. */
  ids: FormationId[];
  node: NodeId;
  /** Where clicking flies to open the stack up; null when it cannot open further. */
  zoomTo: Camera | null;
}

interface Place {
  name: string;
  lon: number;
  lat: number;
  pop: number;
  capital: boolean;
}

interface Label {
  img: OffscreenCanvas;
  w: number;
  h: number;
}

const GOLD = '#ffb547';

export class MapRenderer {
  cam: Camera = { lon: 30, lat: 48, zoom: 9 };
  vp: Viewport = { width: 800, height: 600 };
  dpr = 1;
  hits: HitBox[] = [];
  private readonly globe: GlobeGL;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sprites = new CounterSprites();
  private readonly mask: ControlMask;
  private readonly overlay: OverlayRaster;
  private rel: Uint8Array = new Uint8Array(0);
  private relKey = '';
  private maskFor = -1;
  private overlayFor: { state: ClientState | null; air: unknown; infra: unknown; fallout: unknown; weather: unknown; sea: unknown; overlays: Overlays | null } = { state: null, air: null, infra: null, fallout: null, weather: null, sea: null, overlays: null };
  private weatherFor: { packed: Uint8Array | null; pairs: Float32Array } = { packed: null, pairs: new Float32Array(0) };
  private flashes: Flash[] = [];
  private fly: { path: ReturnType<typeof flight>; t0: number } | null = null;
  /** Wheel zoom eases toward a target about the cursor instead of stepping. */
  private glide: { zoom: number; x: number; y: number } | null = null;
  private lastFrame = 0;
  /** Adaptive resolution: frame interval while moving, and when the camera last moved. */
  private moveDt = 16;
  private motionScale = 1;
  private lastMove = 0;
  private drawnCam: Camera | null = null;
  private globeDirty = true;
  private tilesPending = false;
  private byNode = new Map<NodeId, FormationView[]>();
  private indexedFrom: readonly FormationView[] | null = null;
  private stacks: Stack[] = [];
  private stacksGrid = -1;
  private readonly labels = new Map<string, Label>();
  /** Labelled places, capitals first then by population. */
  private places: Place[];
  private readonly areaNames = new Map<NodeId, string | null>();
  /** Set when a tile lands or fonts load, so the owner schedules a frame. */
  onInvalidate: () => void = () => {};

  constructor(glCanvas: HTMLCanvasElement, private readonly canvas: HTMLCanvasElement, readonly map: GameMap, private readonly palette: Palette, nationIds: readonly string[], tiles: string) {
    this.globe = new GlobeGL(glCanvas, tiles);
    this.globe.onTile = () => {
      this.globeDirty = true;
      this.onInvalidate();
    };
    this.ctx = canvas.getContext('2d')!;
    this.mask = new ControlMask(map, nationIds);
    this.overlay = new OverlayRaster(map);
    this.places = map.cities.map((c) => ({ name: cityName(c.name), lon: c.lon, lat: c.lat, pop: c.pop, capital: c.capital }))
      .sort((a, b) => Number(b.capital) - Number(a.capital) || b.pop - a.pop);
  }

  setManifest(m: Manifest) {
    this.globe.setManifest(m);
    this.globeDirty = true;
  }

  setLights(lonLatPop: Float32Array) {
    this.globe.setLights(lonLatPop);
    this.globeDirty = true;
  }

  /** GeoNames towns (public/tiles/places.json), which name the front down to villages the engine has no city for. */
  setPlaces(rows: readonly [string, number, number, number, number][]) {
    this.places = rows.map(([name, lon, lat, pop, kind]) => ({ name: cityName(name), lon, lat, pop, capital: kind === 2 }));
    this.areaNames.clear();
    this.onInvalidate();
  }

  /** Fonts arrived: re-rasterize text. */
  fontsReady() {
    this.sprites.clear();
    this.labels.clear();
  }

  resize(width: number, height: number, dpr: number) {
    this.vp = { width, height };
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.globe.resize(width, height, dpr);
    this.sprites.setDpr(dpr);
    this.cam = clampCamera(this.cam, this.vp);
    this.globeDirty = true;
  }

  /** Move the camera now (dragging, wheel), cancelling any flight. */
  setCamera(c: Camera) {
    this.cam = clampCamera(c, this.vp);
    this.fly = null;
    this.glide = null;
    this.globeDirty = true;
    this.onInvalidate();
  }

  flyTo(to: Camera, now = performance.now()) {
    this.glide = null;
    this.fly = { path: flight(this.cam, clampCamera(to, this.vp), this.vp), t0: now };
    this.onInvalidate();
  }

  /** A camera partway along the flight between two cameras, to step a flight frame by frame. */
  cameraAlong(from: Camera, to: Camera, t: number): Camera {
    return flight(from, to, this.vp).at(t);
  }

  /** Zoom by `dz` (log2 units) about a screen point, eased over the next frames. */
  glideZoom(dz: number, x: number, y: number) {
    this.fly = null;
    const zoom = clampCamera({ ...this.cam, zoom: (this.glide?.zoom ?? this.cam.zoom) + dz }, this.vp).zoom;
    this.glide = { zoom, x, y };
    this.onInvalidate();
  }

  /** The camera for a band, centred where the view is now. */
  bandCamera(band: ZoomBand, at: { lon: number; lat: number } = this.cam): Camera {
    const zoom = band === 'world' ? worldZoom(this.vp) : zoomForPxPerDeg(BAND_PRESET[band]);
    return { lon: at.lon, lat: band === 'world' ? Math.max(-30, Math.min(50, at.lat)) : at.lat, zoom };
  }

  get band(): ZoomBand {
    return bandOf(this.cam);
  }

  get kmPerPx() {
    return kmPerPx(this.cam);
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
    return this.flashes.length > 0 || this.fly !== null || this.glide !== null || this.tilesPending || this.globe.scale < 1;
  }

  screenOf(n: NodeId): [number, number] | null {
    return project(this.cam, this.vp, this.map.lon[n], this.map.lat[n]);
  }

  pick(sx: number, sy: number): NodeId | null {
    const ll = unproject(this.cam, this.vp, sx, sy);
    return ll ? this.map.nodeAt(ll[1], ll[0]) : null;
  }

  /** Formations at a node, strongest first, as of the latest snapshot rendered. */
  formationsAt(node: NodeId): readonly FormationView[] {
    return this.byNode.get(node) ?? [];
  }

  private sideOf(f: FormationView | undefined, nation: string, nationIds: readonly string[]): Side {
    const i = nationIds.indexOf(nation);
    const r = i < 0 ? Rel.None : this.rel[i];
    if (r === Rel.Own || r === Rel.Friend) return 'friend';
    if (r === Rel.Enemy) {
      return f?.contact && isStale(f.contact) ? 'stale' : 'enemy';
    }
    return 'neutral';
  }

  private syncSituation(input: RenderInput) {
    const { state, nationIds, playAs, overlays } = input;
    const key = `${playAs}|${state.warsKey}|${nationIds.length}`;
    let relChanged = false;
    if (key !== this.relKey) {
      this.rel = relations(nationIds, state.wars, playAs);
      this.relKey = key;
      relChanged = true;
    }
    if (relChanged || this.maskFor !== state.controlVersion) {
      const dirty = this.mask.update(state.control, this.rel);
      if (dirty) this.globe.setMask(this.mask.data, dirty);
      this.maskFor = state.controlVersion;
      this.globeDirty = true;
    }
    const o = this.overlayFor;
    if (relChanged || o.overlays !== overlays || o.air !== state.air || o.sea !== state.sea || o.infra !== state.infra || o.fallout !== state.fallout || o.weather !== state.weather) {
      if (this.weatherFor.packed !== state.weather) this.weatherFor = { packed: state.weather, pairs: state.weather.length ? weatherLayer(this.map, state.weather) : new Float32Array(0) };
      this.overlay.paint({
        air: overlays.air ? state.air : null,
        sea: overlays.sea ? state.sea : null,
        infra: overlays.infra ? state.infra : null,
        fallout: overlays.fallout ? state.fallout : null,
        weather: overlays.weather ? this.weatherFor.pairs : null,
      }, this.rel);
      this.globe.setOverlay(this.overlay.data);
      this.overlayFor = { state, air: state.air, sea: state.sea, infra: state.infra, fallout: state.fallout, weather: state.weather, overlays };
      this.globeDirty = true;
    }
  }

  /**
   * Draw a frame. `changed` says whether anything but time moved since the
   * last frame (a snapshot, hover, selection); flights and flashes animate on
   * their own.
   */
  render(input: RenderInput, now: number, changed = true) {
    const dt = Math.min(100, Math.max(1, now - this.lastFrame));
    this.lastFrame = now;
    if (this.glide) {
      const g = this.glide, left = g.zoom - this.cam.zoom;
      const step = Math.abs(left) < 0.003 ? left : left * (1 - Math.exp(-dt / 70));
      this.cam = zoomAt(this.cam, this.vp, g.x, g.y, 2 ** step);
      if (step === left) this.glide = null;
      this.globeDirty = true;
    }
    if (this.fly) {
      const u = (now - this.fly.t0) / this.fly.path.ms;
      this.cam = clampCamera(this.fly.path.at(Math.min(1, u)), this.vp);
      if (u >= 1) this.fly = null;
      this.globeDirty = true;
    }
    if (changed) this.syncSituation(input);
    this.adaptResolution(now, dt);
    if (this.globeDirty || this.tilesPending) {
      this.globeDirty = false;
      this.tilesPending = this.globe.draw(this.cam, this.vp, { seaGrid: input.overlays.seaZones });
    }
    const ctx = this.ctx, dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const band = this.band;
    if (band !== 'world') this.drawContest(input);
    this.drawHover(input);
    this.drawOrders(input);
    const counters = this.drawFormations(input);
    if (input.overlays.cities) this.drawCities(counters);
    this.drawFlashes(now);
  }

  /**
   * Keep motion smooth where fill rate is short (integrated or software GPUs):
   * while the camera moves and frames run long, draw the terrain at a lower
   * resolution; one full-resolution frame follows when it stops.
   */
  private adaptResolution(now: number, dt: number) {
    const moved = this.cam !== this.drawnCam;
    this.drawnCam = this.cam;
    const g = this.globe;
    if (moved) {
      // Pick up at the scale the last motion settled on, so every drag does not relearn it.
      if (now - this.lastMove > 180) this.moveDt = 16;
      else {
        this.moveDt += (dt - this.moveDt) * 0.3;
        if (this.moveDt > 24 && this.motionScale > 0.3) {
          this.motionScale = Math.max(0.3, this.motionScale * 0.7);
          this.moveDt = 16;
        } else if (this.moveDt < 11 && this.motionScale < 1) this.motionScale = Math.min(1, this.motionScale / 0.7);
      }
      this.lastMove = now;
      g.scale = this.motionScale;
    } else if (g.scale < 1 && now - this.lastMove > 180) {
      g.scale = 1;
      this.globeDirty = true;
    }
  }

  /** The cell's four corners on screen, or null if any is behind the globe. */
  private cellQuad(n: number): [number, number][] | null {
    const m = this.map, h = m.halfDeg[n], out: [number, number][] = [];
    for (const [dx, dy] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      const p = project(this.cam, this.vp, m.lon[n] + dx * h, m.lat[n] + dy * h);
      if (!p) return null;
      out.push(p);
    }
    return out;
  }

  private drawHover(input: RenderInput) {
    if (input.hoverNode === null || !input.targeting) return;
    const q = this.cellQuad(input.hoverNode);
    if (!q) return;
    const ctx = this.ctx, nuclear = input.targeting === 'nuclear';
    ctx.beginPath();
    q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = nuclear ? 'rgba(255,77,79,0.28)' : 'rgba(255,181,71,0.22)';
    ctx.fill();
    ctx.strokeStyle = nuclear ? '#ff4d4f' : GOLD;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  /**
   * Fronts moving inside a cell: the share an attacker has pushed across it,
   * filled from the side its own cells border, with the cell outlined in the
   * attacker's side colour while it is contested.
   */
  private drawContest(input: RenderInput) {
    const { state, nationIds } = input, v = state.contest, ctx = this.ctx, m = this.map;
    for (let i = 0; i < v.length; i += 3) {
      const n = v[i], by = v[i + 1], share = v[i + 2];
      const q = this.cellQuad(n);
      if (!q || q.every(([x, y]) => x < 0 || y < 0 || x > this.vp.width || y > this.vp.height)) continue;
      const side = this.sideOf(undefined, nationIds[by] ?? '', nationIds);
      const color = side === 'friend' ? '74,163,255' : side === 'enemy' ? '255,77,79' : '255,181,71';
      const c = this.screenOf(n as NodeId);
      if (!c) continue;
      let dx = 0, dy = 0;
      for (const nb of m.neighbors(n as NodeId)) {
        if (state.control[nb] !== by) continue;
        const p = this.screenOf(nb);
        if (p) { dx += p[0] - c[0]; dy += p[1] - c[1]; }
      }
      const cell = new Path2D();
      q.forEach(([x, y], k) => (k ? cell.lineTo(x, y) : cell.moveTo(x, y)));
      cell.closePath();
      ctx.save();
      ctx.clip(cell);
      ctx.fillStyle = `rgba(${color},0.32)`;
      const len = Math.hypot(dx, dy);
      if (len === 0) {
        ctx.globalAlpha = 0.3 + 0.6 * share;
        ctx.fill(cell);
      } else {
        const ux = dx / len, uy = dy / len;
        let r = 0;
        for (const [x, y] of q) r = Math.max(r, Math.abs((x - c[0]) * ux + (y - c[1]) * uy));
        const s0 = r * (1 - 2 * share), w = 2 * r;
        const at = (s: number, t: number): [number, number] => [c[0] + ux * s - uy * t, c[1] + uy * s + ux * t];
        ctx.beginPath();
        ctx.moveTo(...at(s0, -w));
        ctx.lineTo(...at(r * 1.5, -w));
        ctx.lineTo(...at(r * 1.5, w));
        ctx.lineTo(...at(s0, w));
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private label(text: string, font: string, color: string, track: number): Label {
    const key = `${font}|${color}|${track}|${text}`;
    let l = this.labels.get(key);
    if (l) return l;
    if (this.labels.size > 1500) this.labels.clear();
    const probe = new OffscreenCanvas(1, 1).getContext('2d')!;
    probe.font = font;
    probe.letterSpacing = `${track}px`;
    const m = probe.measureText(text);
    const size = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? '12');
    const pad = 4, w = Math.ceil(m.width + 2 * pad), h = Math.ceil(size * 1.4 + 2 * pad);
    const img = new OffscreenCanvas(Math.ceil(w * this.dpr), Math.ceil(h * this.dpr));
    const c = img.getContext('2d')!;
    c.scale(this.dpr, this.dpr);
    c.font = font;
    c.letterSpacing = `${track}px`;
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(3,6,11,0.85)';
    c.strokeText(text, pad, h / 2);
    c.fillStyle = color;
    c.fillText(text, pad, h / 2);
    l = { img, w, h };
    this.labels.set(key, l);
    return l;
  }

  private blit(l: Label, x: number, y: number) {
    this.ctx.drawImage(l.img, x, y, l.w, l.h);
  }

  /** Capitals first, then by population; a label is skipped if it would overlap one already placed. */
  private drawCities(counters: readonly [number, number, number, number][]) {
    const placed: [number, number, number, number][] = [];
    const ppd = pxPerDeg(this.cam), ctx = this.ctx;
    if (ppd < 9) return;
    const minPop = ppd < 20 ? 4e6 : ppd < 50 ? 6e5 : ppd < 130 ? 2.5e5 : ppd < 260 ? 6e4 : ppd < 500 ? 1.2e4 : 0;
    for (const c of this.places) {
      if (c.pop < minPop && !(c.capital && ppd >= 20)) continue;
      const p = project(this.cam, this.vp, c.lon, c.lat);
      if (!p) continue;
      const [x, y] = p;
      if (x < -40 || y < -20 || x > this.vp.width + 40 || y > this.vp.height + 20) continue;
      const big = c.capital || c.pop > 1e6;
      const l = this.label(c.name.toUpperCase(), `600 ${big ? 13 : 11.5}px "Barlow Condensed", "Arial Narrow", sans-serif`, big ? '#eef3f9' : '#c9d5e3', 1.3);
      const box: [number, number, number, number] = [x + 3, y - l.h / 2, x + 3 + l.w, y + l.h / 2];
      const hits = (b: readonly number[]) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1];
      // Big cities always get their name; smaller ones give way to labels and counters.
      if (placed.some(hits) || (!big && counters.some(hits))) continue;
      placed.push(box);
      ctx.beginPath();
      if (c.capital) {
        ctx.fillStyle = '#ffd27f';
        for (let k = 0; k < 10; k++) {
          const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 2.2 : 5;
          if (k) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.closePath();
      } else {
        ctx.fillStyle = '#e8eef6';
        ctx.arc(x, y, 2.3, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.strokeStyle = 'rgba(3,6,11,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
      this.blit(l, x + 3, y - l.h / 2);
    }
  }

  /** Gold is the player's intent: own orders are gold arrows, the selected one bright. */
  private drawOrders(input: RenderInput) {
    const ctx = this.ctx;
    for (const f of input.state.formations) {
      if (f.target === null || f.status === 'destroyed' || f.target === f.node) continue;
      const mine = f.entry.nation === input.playAs, sel = f.entry.id === input.selected;
      if (!sel && (!mine || this.band !== 'front')) continue;
      const a0 = this.screenOf(f.node), a1 = this.screenOf(f.target);
      if (!a0 || !a1) continue;
      const [x0, y0] = a0, [x1, y1] = a1, len = Math.hypot(x1 - x0, y1 - y0);
      if (len < 6) continue;
      // Bow the arrow a little so stacked orders to one target stay readable.
      const mx = (x0 + x1) / 2 - (y1 - y0) * 0.12, my = (y0 + y1) / 2 + (x1 - x0) * 0.12;
      const strike = f.posture === 'strike';
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalAlpha = sel ? 1 : 0.55;
      ctx.strokeStyle = strike ? 'rgba(255,107,94,0.35)' : 'rgba(255,181,71,0.3)';
      ctx.lineWidth = sel ? 7 : 3;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(mx, my, x1, y1);
      ctx.stroke();
      ctx.setLineDash(sel ? [] : [6, 5]);
      ctx.strokeStyle = strike ? '#ff6b5e' : sel ? '#ffd27f' : GOLD;
      ctx.lineWidth = sel ? 2.4 : 1.2;
      ctx.stroke();
      ctx.setLineDash([]);
      const a = Math.atan2(y1 - my, x1 - mx), h = sel ? 11 : 8;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - h * Math.cos(a - 0.45), y1 - h * Math.sin(a - 0.45));
      ctx.lineTo(x1 - h * Math.cos(a + 0.45), y1 - h * Math.sin(a + 0.45));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  /** Returns the screen boxes the counters and their labels took. */
  private drawFormations(input: RenderInput): [number, number, number, number][] {
    const placed: [number, number, number, number][] = [];
    const { ctx, cam } = this;
    const { nationIds } = input;
    if (input.state.formations !== this.indexedFrom) {
      this.indexedFrom = input.state.formations;
      this.byNode = indexByNode(input.state.formations);
      this.stacksGrid = -1;
    }
    const band = this.band, ppd = pxPerDeg(cam);
    const grid = gridSize(CELL_PX[band], ppd);
    if (grid !== this.stacksGrid) {
      this.stacks = clusterStacks(this.byNode, (n) => [this.map.lon[n], -this.map.lat[n]], grid);
      this.stacksGrid = grid;
    }
    const scale = COUNTER_SCALE[band];
    const atNode = new Map<NodeId, number>();
    /** Bottom row of the last fan drawn at a node, so a second side's fan goes underneath instead of on top. */
    const fanBottom = new Map<NodeId, number>();
    const own = (s: Stack) => this.sideOf(s.members[0], s.nation, nationIds) === 'friend';
    // Enemies under friends, so the player's own counters are never hidden.
    const order = [...this.stacks].sort((a, b) => Number(own(a)) - Number(own(b)));
    this.hits = [];
    let selectedBox: CounterBox | null = null;
    let focusRing: { c: ContactInfo; x: number; y: number } | null = null;
    const labelled: { stack: Stack; box: CounterBox; side: Side }[] = [];
    for (const stack of order) {
      const p = this.screenOf(stack.node);
      if (!p) continue;
      const [cx, cy] = p;
      if (cx < -80 || cy < -80 || cx > this.vp.width + 80 || cy > this.vp.height + 80) continue;
      const lead = stack.members[0];
      const side = this.sideOf(lead, stack.nation, nationIds);
      // Far out, only the sides at war; forces of nations out of it appear from the front zoom in.
      if (side === 'neutral' && band !== 'front') continue;
      const nth = atNode.get(stack.node) ?? 0;
      atNode.set(stack.node, nth + 1);
      const nodePx = 2 * this.map.halfDeg[stack.node] * ppd;
      if (side !== 'friend') {
        const picked = input.selected ? stack.members.find((f) => f.entry.id === input.selected && f.contact) : undefined;
        if (picked) focusRing = { c: picked.contact!, x: cx, y: cy };
        else if (lead.contact) this.drawUncertainty(lead.contact, cx, cy, false);
      }
      if (nodePx >= FAN_PX && stack.nodes === 1 && stack.members.length > 1) {
        const cols = Math.max(2, Math.min(4, Math.floor(nodePx / FAN_SLOT_PX)));
        const cap = cols * cols;
        const shown = stack.members.length > cap ? stack.members.slice(0, cap - 1) : stack.members;
        const slots = shown.length + (stack.members.length > shown.length ? 1 : 0);
        const rows = Math.ceil(slots / cols), step = Math.min(FAN_SLOT_PX * scale, nodePx / cols);
        const prev = fanBottom.get(stack.node);
        const y0 = prev === undefined ? cy - ((rows - 1) / 2) * step : prev + step;
        fanBottom.set(stack.node, y0 + (rows - 1) * step);
        const at = (i: number): [number, number] => [cx + ((i % cols) - (Math.min(cols, slots) - 1) / 2) * step, y0 + Math.floor(i / cols) * step];
        shown.forEach((f, i) => {
          const [x, y] = at(i);
          const s = this.sideOf(f, stack.nation, nationIds);
          const box = this.sprites.draw(ctx, x, y, ECHELON_W[f.entry.echelon] * scale * 0.85, f.entry.kind, f.entry.echelon, s, f.strength, f.status === 'routed');
          this.hits.push({ ...box, ids: [f.entry.id], node: stack.node, zoomTo: null });
          this.designator(f, x + box.w / 2 + 1, y, s);
          if (f.entry.id === input.selected) selectedBox = box;
        });
        if (shown.length < stack.members.length) {
          const rest = stack.members.slice(shown.length);
          const [x, y] = at(shown.length);
          const box = this.drawStack(rest, x, y, scale * 0.85, side);
          this.hits.push({ ...box, ids: rest.map((f) => f.entry.id), node: stack.node, zoomTo: { lon: this.map.lon[stack.node], lat: this.map.lat[stack.node], zoom: cam.zoom + 0.7 } });
          if (rest.some((f) => f.entry.id === input.selected)) selectedBox = box;
        }
        continue;
      }
      const box = this.drawStack(stack.members, cx + nth * 9, cy + nth * 9, scale, side);
      const node = { lon: this.map.lon[stack.node], lat: this.map.lat[stack.node] };
      const zoomTo = stack.members.length === 1 ? null
        : stack.nodes > 1 ? { ...node, zoom: cam.zoom + 1.3 }
          : { ...node, zoom: Math.max(cam.zoom + 0.6, zoomForPxPerDeg((FAN_PX * 1.1) / (2 * this.map.halfDeg[stack.node]))) };
      this.hits.push({ ...box, ids: stack.members.map((f) => f.entry.id), node: stack.node, zoomTo });
      if (input.selected && stack.members.some((f) => f.entry.id === input.selected)) selectedBox = box;
      if (band === 'front' && stack.members.length === 1) this.designator(lead, box.x + box.w + 1, cy + nth * 9, side);
      else if (band !== 'world') labelled.push({ stack, box, side });
    }
    for (const b of this.hits) placed.push([b.x, b.y, b.x + b.w, b.y + b.h]);
    for (const l of labelled) this.stackLabel(l.stack, l.box, l.side, placed);
    if (focusRing) this.drawUncertainty(focusRing.c, focusRing.x, focusRing.y, true);
    if (selectedBox) this.drawSelection(selectedBox);
    return placed;
  }

  /**
   * Where a foreign contact probably is now (map/contacts.ts): a dashed ring of its error radius at
   * the last fix, and its age. The selected contact always shows both, with its error in km.
   */
  private drawUncertainty(c: ContactInfo, x: number, y: number, focused: boolean) {
    const ctx = this.ctx;
    const ring = contactRing(c, this.kmPerPx, focused);
    if (ring) {
      ctx.beginPath();
      ctx.arc(x, y, ring.radiusPx, 0, Math.PI * 2);
      ctx.fillStyle = ring.fill;
      ctx.fill();
      ctx.setLineDash(ring.dash);
      ctx.strokeStyle = ring.stroke;
      ctx.lineWidth = ring.width;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const text = contactLabel(c, focused);
    if (text && (focused || this.band !== 'world')) {
      const l = this.label(text, '500 10px "IBM Plex Mono", ui-monospace, monospace', isStale(c) ? '#8fa6c0' : '#ff9a9b', 0);
      // The selected contact's label sits under its ring, clear of the counters at the fix.
      const lx = focused && ring ? x - l.w / 2 : x + 14, ly = focused && ring ? y + ring.radiusPx + 4 : y + 2;
      ctx.fillStyle = 'rgba(8,13,22,0.8)';
      ctx.fillRect(lx, ly, l.w, l.h - 2);
      this.blit(l, lx, ly - 1);
    }
  }

  /** The nearest city of 100,000 or more within about 150 km, cached per node. */
  private areaName(node: NodeId): string | null {
    const hit = this.areaNames.get(node);
    if (hit !== undefined) return hit;
    const lon = this.map.lon[node], lat = this.map.lat[node], k = Math.cos((lat * Math.PI) / 180);
    let best: string | null = null, bestD = 1.4 ** 2;
    for (const p of this.places) {
      if (p.pop < 1e5) continue;
      const d = ((p.lon - lon) * k) ** 2 + (p.lat - lat) ** 2;
      if (d < bestD) { bestD = d; best = p.name; }
    }
    this.areaNames.set(node, best);
    return best;
  }

  /** A unit's short designator (the number in its name) beside its counter, as on the front mockup. */
  private designator(f: FormationView, x: number, y: number, side: Side) {
    const num = f.entry.name.match(/\d+/)?.[0];
    if (!num) return;
    const l = this.label(num, '500 11px "IBM Plex Mono", ui-monospace, monospace', side === 'friend' ? '#cfe6ff' : side === 'enemy' ? '#ffb0b1' : '#b9c8da', 0);
    this.blit(l, x, y - l.h / 2);
  }

  /** An army group's name, a strength bar and its size, to the right of the counter (theatre mockup). */
  private stackLabel(stack: Stack, box: CounterBox, side: Side, placed: [number, number, number, number][]) {
    const lead = stack.members[0];
    if (stack.members.length < 3 && lead.entry.echelon !== 'corps' && lead.entry.echelon !== 'army') return;
    let strength = 0;
    for (const f of stack.members) strength += f.strength;
    strength /= stack.members.length;
    const friend = side === 'friend';
    // A corps or army is named for itself; a stack of brigades is named for where it stands, as a staff would.
    const own = lead.entry.echelon === 'corps' || lead.entry.echelon === 'army' || stack.members.length === 1;
    const area = this.areaName(stack.node);
    const name = friend && own ? shortName(lead.entry.name) : area ? `${area} group` : `${lead.entry.nation} group`;
    const title = this.label(name.toUpperCase(), '600 12.5px "Barlow Condensed", "Arial Narrow", sans-serif', '#e8eef6', 1.4);
    const sub = this.label(`${friend ? '' : 'est. '}${stack.members.length} units · ${Math.round(strength * 100)}%`, '400 10px "IBM Plex Mono", ui-monospace, monospace', friend ? '#8fa6c0' : '#c98f90', 0);
    const x = box.x + box.w + 4, y = box.y + box.h / 2 - title.h + 2, w = Math.max(title.w, sub.w);
    const rect: [number, number, number, number] = [x, y, x + w, y + title.h + sub.h];
    if (placed.some((b) => rect[0] < b[2] && rect[2] > b[0] && rect[1] < b[3] && rect[3] > b[1])) return;
    placed.push(rect);
    this.blit(title, x, y);
    const ctx = this.ctx, bw = Math.min(70, title.w - 8);
    ctx.fillStyle = 'rgba(150,195,240,0.16)';
    ctx.fillRect(x + 4, y + title.h - 3, bw, 2.5);
    ctx.fillStyle = LOOK[side].bar;
    ctx.fillRect(x + 4, y + title.h - 3, bw * strength, 2.5);
    this.blit(sub, x, y + title.h - 1);
  }

  private drawSelection(b: CounterBox) {
    const ctx = this.ctx, x0 = b.x - 5, y0 = b.y - 4, x1 = b.x + b.w + 5, y1 = b.y + b.h + 4, k = 6;
    ctx.save();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(255,181,71,0.8)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) {
      ctx.moveTo(x + dx * k, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * k);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** The strongest member's counter over a shadow counter, with a count badge and the stack's mean strength. */
  private drawStack(members: readonly FormationView[], x: number, y: number, scale: number, side: Side): CounterBox {
    const { ctx } = this;
    const lead = members[0];
    const w = ECHELON_W[lead.entry.echelon] * scale;
    if (members.length === 1) return this.sprites.draw(ctx, x, y, w, lead.entry.kind, lead.entry.echelon, side, lead.strength, lead.status === 'routed');
    let strength = 0;
    for (const f of members) strength += f.strength;
    ctx.globalAlpha = 0.55;
    this.sprites.draw(ctx, x + 3, y - 3, w, lead.entry.kind, lead.entry.echelon, side, 0, false);
    ctx.globalAlpha = 1;
    const box = this.sprites.draw(ctx, x, y, w, lead.entry.kind, lead.entry.echelon, side, strength / members.length, false);
    const label = members.length > 999 ? '999+' : String(members.length);
    const bw = 7 + label.length * 6, bx = x + w / 2 - 3, by = y - CounterSprites.half(w, side) - 8;
    ctx.fillStyle = 'rgba(8,13,22,0.92)';
    ctx.strokeStyle = LOOK[side].stroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, 13, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e8eef6';
    ctx.font = '600 10px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + bw / 2, by + 7);
    ctx.textAlign = 'start';
    return { x: box.x, y: Math.min(box.y, by), w: box.w + bw - 2, h: box.h + (box.y - Math.min(box.y, by)) };
  }

  private drawFlashes(now: number) {
    const ctx = this.ctx;
    this.flashes = this.flashes.filter((f) => now - f.t0 < FLASH_MS[f.kind]);
    for (const f of this.flashes) {
      // rAF timestamps can precede the performance.now() stamped on the event.
      const u = Math.max(0, now - f.t0) / FLASH_MS[f.kind], e = 1 - (1 - u) ** 3;
      const p = this.screenOf(f.node);
      if (!p) continue;
      const [x, y] = p;
      ctx.save();
      switch (f.kind) {
        case 'battle':
          ctx.strokeStyle = `rgba(255,181,71,${0.9 * (1 - u)})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, 6 + 20 * e, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'strike':
          ctx.strokeStyle = `rgba(255,77,79,${1 - u})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, 4 + 14 * e, 0, Math.PI * 2);
          ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y);
          ctx.moveTo(x, y - 10); ctx.lineTo(x, y + 10);
          ctx.stroke();
          ctx.fillStyle = `rgba(255,230,200,${(1 - u) * 0.9})`;
          ctx.beginPath();
          ctx.arc(x, y, 3 * (1 - u) + 1, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'capture':
          ctx.strokeStyle = `rgba(232,238,246,${0.7 * (1 - u)})`;
          ctx.lineWidth = 1.2;
          ctx.strokeRect(x - 5 - 6 * e, y - 5 - 6 * e, 10 + 12 * e, 10 + 12 * e);
          break;
        case 'nuclear': {
          const r = 12 + 110 * Math.sqrt(u);
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

  /** Nation colour, for UI that still keys on it (tooltips). */
  nationCss(id: string) {
    return this.palette.of(id).css;
  }
}

/** "1st Guards Tank Army" stays; "47th Separate Mechanized Brigade" becomes "47th Mech Brigade". */
export function shortName(name: string): string {
  const s = name.replace(/\bSeparate\b\s*/i, '').replace(/\bMechani[sz]ed\b/i, 'Mech').replace(/\bMotori[sz]ed Rifle\b/i, 'Motor Rifle').replace(/\s+/g, ' ').trim();
  return s.length > 22 ? `${s.slice(0, 21)}…` : s;
}

