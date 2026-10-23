/**
 * NATO APP-6-style counters in the redesign kit's look: the frame says whose
 * it is (a blue box for friendly, a red diamond for hostile, grey for a
 * contact gone stale or a side not in the player's war), the glyph says what
 * it is, echelon marks sit above and a strength bar below. Counters glow, so
 * each variant is rasterized once and blitted.
 */
import type { Echelon, FormationKind } from '../core/types';

export type Side = 'friend' | 'enemy' | 'stale' | 'neutral';

type Frame = 'land' | 'air' | 'sea' | 'subsurface';

const FRAME_OF: Record<FormationKind, Frame> = {
  maneuver: 'land', artillery: 'land', air_defense: 'land', missile: 'land', strategic: 'land', logistics: 'land', space: 'land',
  air_wing: 'air', surface_group: 'sea', submarine: 'subsurface',
};

export const ECHELON_MARK: Record<Echelon, string> = {
  battalion: 'II', brigade: 'X', division: 'XX', corps: 'XXX', army: 'XXXX',
  squadron: 'II', wing: 'III', flotilla: 'II', task_group: 'III', fleet: 'XXXX',
};

/** Counter width in CSS px at scale 1; the kit's division counter is 30 x 20. */
export const ECHELON_W: Record<Echelon, number> = {
  battalion: 22, squadron: 22, flotilla: 24, brigade: 26, wing: 26, division: 30, task_group: 30, corps: 32, army: 34, fleet: 34,
};

interface Look {
  fill: string;
  stroke: string;
  glow: string;
  ink: string;
  bar: string;
}

export const LOOK: Record<Side, Look> = {
  friend: { fill: 'rgba(40,110,200,0.92)', stroke: '#cfe6ff', glow: 'rgba(74,163,255,0.6)', ink: '#ffffff', bar: '#4aa3ff' },
  enemy: { fill: 'rgba(210,50,55,0.92)', stroke: '#ffd0d0', glow: 'rgba(255,77,79,0.6)', ink: '#ffffff', bar: '#ff4d4f' },
  stale: { fill: 'rgba(92,104,120,0.55)', stroke: 'rgba(200,210,222,0.55)', glow: 'rgba(0,0,0,0)', ink: 'rgba(230,236,244,0.75)', bar: '#8fa6c0' },
  neutral: { fill: 'rgba(84,96,112,0.85)', stroke: 'rgba(214,224,236,0.8)', glow: 'rgba(150,170,190,0.35)', ink: '#e8eef6', bar: '#b9c8da' },
};

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Glyphs centred on the origin inside a w x h frame. */
const GLYPH: Record<FormationKind, (c: Ctx, w: number, h: number) => void> = {
  maneuver: (c, w, h) => {
    c.moveTo(-w / 2, -h / 2); c.lineTo(w / 2, h / 2);
    c.moveTo(w / 2, -h / 2); c.lineTo(-w / 2, h / 2);
    c.moveTo(w * 0.24, 0); c.ellipse(0, 0, w * 0.24, h * 0.2, 0, 0, Math.PI * 2);
  },
  artillery: (c, w) => { c.moveTo(w * 0.1, 0); c.arc(0, 0, w * 0.1, 0, Math.PI * 2); },
  air_defense: (c, w, h) => { c.moveTo(-w * 0.32, h * 0.32); c.quadraticCurveTo(0, -h * 0.5, w * 0.32, h * 0.32); },
  missile: (c, w, h) => {
    c.moveTo(0, -h * 0.36); c.lineTo(w * 0.08, -h * 0.14); c.lineTo(w * 0.08, h * 0.3); c.lineTo(-w * 0.08, h * 0.3); c.lineTo(-w * 0.08, -h * 0.14); c.closePath();
  },
  strategic: (c, w, h) => {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
      const x = Math.cos(a) * w * 0.22, y = Math.sin(a) * h * 0.36;
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.closePath();
  },
  logistics: (c, w, h) => { c.moveTo(-w / 2, h * 0.22); c.lineTo(w / 2, h * 0.22); },
  space: (c, w, h) => { c.moveTo(w * 0.3, 0); c.ellipse(0, 0, w * 0.3, h * 0.14, -0.3, 0, Math.PI * 2); c.moveTo(w * 0.07, 0); c.arc(0, 0, w * 0.07, 0, Math.PI * 2); },
  air_wing: (c, w, h) => {
    c.moveTo(0, 0); c.ellipse(-w * 0.14, 0, w * 0.14, h * 0.13, 0, 0, Math.PI * 2);
    c.moveTo(w * 0.28, 0); c.ellipse(w * 0.14, 0, w * 0.14, h * 0.13, 0, 0, Math.PI * 2);
  },
  surface_group: (c, w, h) => { c.moveTo(-w * 0.26, -h * 0.05); c.lineTo(w * 0.26, -h * 0.05); c.lineTo(w * 0.17, h * 0.2); c.lineTo(-w * 0.17, h * 0.2); c.closePath(); },
  submarine: (c, w, h) => { c.moveTo(w * 0.26, 0); c.ellipse(0, 0, w * 0.26, h * 0.11, 0, 0, Math.PI * 2); },
};

const FILLED = new Set<FormationKind>(['artillery', 'strategic']);

/** Hostile frames are diamonds in every domain; friendly frames follow APP-6 by domain. */
function framePath(c: Ctx, frame: Frame, side: Side, w: number, h: number) {
  c.beginPath();
  if (side === 'enemy' || side === 'stale') {
    const r = h * 0.72;
    c.moveTo(0, -r); c.lineTo(r, 0); c.lineTo(0, r); c.lineTo(-r, 0); c.closePath();
    return;
  }
  switch (frame) {
    case 'land': c.roundRect(-w / 2, -h / 2, w, h, 2); break;
    case 'air': c.moveTo(-w / 2, h / 2); c.lineTo(-w / 2, 0); c.bezierCurveTo(-w / 2, -h * 0.75, w / 2, -h * 0.75, w / 2, 0); c.lineTo(w / 2, h / 2); c.closePath(); break;
    case 'sea': c.ellipse(0, 0, w / 2, h / 2 + 1, 0, 0, Math.PI * 2); break;
    case 'subsurface': c.moveTo(-w / 2, -h / 2); c.lineTo(w / 2, -h / 2); c.lineTo(w / 2, 0); c.bezierCurveTo(w / 2, h * 0.75, -w / 2, h * 0.75, -w / 2, 0); c.closePath(); break;
  }
}

/** Frame, glyph and echelon mark centred on the origin. */
function paintCounter(c: Ctx, w: number, kind: FormationKind, echelon: Echelon, side: Side) {
  const h = w * 0.66, look = LOOK[side];
  const hostile = side === 'enemy' || side === 'stale';
  framePath(c, FRAME_OF[kind], side, w, h);
  c.shadowColor = look.glow;
  c.shadowBlur = w * 0.45;
  c.fillStyle = look.fill;
  c.fill();
  c.shadowBlur = 0;
  c.lineWidth = 1;
  c.strokeStyle = 'rgba(0,0,0,0.55)';
  c.stroke();
  c.lineWidth = 1.5;
  c.strokeStyle = look.stroke;
  if (side === 'stale') c.setLineDash([2.5, 2]);
  c.stroke();
  c.setLineDash([]);
  c.beginPath();
  const gw = hostile ? h * 0.82 : w * 0.92, gh = hostile ? h * 0.7 : h * 0.92;
  GLYPH[kind](c, gw, gh);
  c.strokeStyle = look.ink;
  c.lineWidth = Math.max(1.1, w * 0.045);
  c.stroke();
  if (FILLED.has(kind)) { c.fillStyle = look.ink; c.fill(); }
  c.fillStyle = side === 'friend' ? '#cfe6ff' : side === 'enemy' ? '#ffd0d0' : '#b9c8da';
  c.font = `500 ${Math.max(8, Math.round(w * 0.3))}px "IBM Plex Mono", ui-monospace, monospace`;
  c.textAlign = 'center';
  c.textBaseline = 'bottom';
  c.fillText(ECHELON_MARK[echelon], 0, -(hostile ? h * 0.72 : h / 2) - 1);
}

const SPRITE_LIMIT = 2_000;

interface Sprite {
  img: OffscreenCanvas;
  /** CSS-pixel size and the counter centre's offset inside it. */
  w: number;
  h: number;
  ox: number;
  oy: number;
}

export interface CounterBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class CounterSprites {
  private readonly cache = new Map<string, Sprite>();
  private dpr = 1;

  setDpr(dpr: number) {
    if (dpr !== this.dpr) this.cache.clear();
    this.dpr = dpr;
  }

  /** Fonts arriving late change the echelon marks. */
  clear() {
    this.cache.clear();
  }

  private sprite(w: number, kind: FormationKind, echelon: Echelon, side: Side): Sprite {
    const key = `${w}|${kind}|${echelon}|${side}`;
    let s = this.cache.get(key);
    if (s) return s;
    if (this.cache.size > SPRITE_LIMIT) this.cache.clear();
    const pad = Math.ceil(w * 0.5) + 2, top = Math.ceil(w * 0.34) + 4;
    const cw = w + 2 * pad, ch = Math.ceil(w * 1.05) + top + pad;
    const img = new OffscreenCanvas(Math.ceil(cw * this.dpr), Math.ceil(ch * this.dpr));
    const c = img.getContext('2d')!;
    c.scale(this.dpr, this.dpr);
    const oy = top + w * 0.5;
    c.translate(cw / 2, oy);
    paintCounter(c, w, kind, echelon, side);
    s = { img, w: cw, h: ch, ox: cw / 2, oy };
    this.cache.set(key, s);
    return s;
  }

  /** Half-height of the frame, for placing things under it. */
  static half(w: number, side: Side) {
    return side === 'enemy' || side === 'stale' ? w * 0.66 * 0.72 : w * 0.33;
  }

  /** Draws a counter centred on (x, y) with a strength bar beneath; returns its hit box. */
  draw(c: Ctx, x: number, y: number, w: number, kind: FormationKind, echelon: Echelon, side: Side, strength: number, faded: boolean): CounterBox {
    const s = this.sprite(Math.round(w), kind, echelon, side);
    const alpha = c.globalAlpha;
    if (faded) c.globalAlpha = alpha * 0.5;
    c.drawImage(s.img, x - s.ox, y - s.oy, s.w, s.h);
    c.globalAlpha = alpha;
    const half = CounterSprites.half(w, side), by = y + half + 3, bw = Math.max(16, w * 0.9);
    c.fillStyle = 'rgba(150,195,240,0.16)';
    c.fillRect(x - bw / 2, by, bw, 3);
    c.fillStyle = LOOK[side].bar;
    c.fillRect(x - bw / 2, by, bw * Math.max(0, Math.min(1, strength)), 3);
    return { x: x - w / 2 - 2, y: y - half - w * 0.34, w: w + 4, h: 2 * half + w * 0.34 + 7 };
  }
}
