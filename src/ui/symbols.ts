/**
 * Simplified NATO APP-6 counters: frame shape by domain, a glyph by formation
 * kind, echelon tick marks above, a strength bar below.
 */
import type { Echelon, FormationKind } from '../core/types';

type Frame = 'land' | 'air' | 'sea' | 'subsurface';

const FRAME_OF: Record<FormationKind, Frame> = {
  maneuver: 'land', artillery: 'land', air_defense: 'land', missile: 'land', strategic: 'land', logistics: 'land', space: 'land',
  air_wing: 'air', surface_group: 'sea', submarine: 'subsurface',
};

const ECHELON_MARK: Record<Echelon, string> = {
  battalion: 'II', brigade: 'X', division: 'XX', corps: 'XXX', army: 'XXXX',
  squadron: 'II', wing: 'III', flotilla: 'II', task_group: 'III', fleet: 'XXXX',
};

type Ctx = CanvasRenderingContext2D;

const GLYPH: Record<FormationKind, (c: Ctx, w: number, h: number) => void> = {
  maneuver: (c, w, h) => {
    c.moveTo(-w / 2, -h / 2); c.lineTo(w / 2, h / 2);
    c.moveTo(w / 2, -h / 2); c.lineTo(-w / 2, h / 2);
    c.moveTo(w * 0.3, 0); c.ellipse(0, 0, w * 0.3, h * 0.28, 0, 0, Math.PI * 2);
  },
  artillery: (c, w) => { c.moveTo(w * 0.12, 0); c.arc(0, 0, w * 0.12, 0, Math.PI * 2); },
  air_defense: (c, w, h) => { c.moveTo(-w * 0.35, h * 0.3); c.quadraticCurveTo(0, -h * 0.4, w * 0.35, h * 0.3); },
  missile: (c, w, h) => {
    c.moveTo(0, -h * 0.35); c.lineTo(w * 0.1, -h * 0.15); c.lineTo(w * 0.1, h * 0.3); c.lineTo(-w * 0.1, h * 0.3); c.lineTo(-w * 0.1, -h * 0.15); c.closePath();
  },
  strategic: (c, w, h) => {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
      const x = Math.cos(a) * w * 0.28, y = Math.sin(a) * h * 0.38;
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.closePath();
  },
  logistics: (c, w, h) => { c.moveTo(-w / 2, h * 0.25); c.lineTo(w / 2, h * 0.25); },
  space: (c, w, h) => { c.moveTo(w * 0.35, 0); c.ellipse(0, 0, w * 0.35, h * 0.15, -0.3, 0, Math.PI * 2); c.moveTo(w * 0.08, 0); c.arc(0, 0, w * 0.08, 0, Math.PI * 2); },
  air_wing: (c, w, h) => {
    c.moveTo(0, 0); c.ellipse(-w * 0.16, 0, w * 0.16, h * 0.14, 0, 0, Math.PI * 2);
    c.moveTo(w * 0.32, 0); c.ellipse(w * 0.16, 0, w * 0.16, h * 0.14, 0, 0, Math.PI * 2);
  },
  surface_group: (c, w, h) => { c.moveTo(-w * 0.3, -h * 0.05); c.lineTo(w * 0.3, -h * 0.05); c.lineTo(w * 0.2, h * 0.2); c.lineTo(-w * 0.2, h * 0.2); c.closePath(); },
  submarine: (c, w, h) => { c.moveTo(w * 0.28, 0); c.ellipse(0, 0, w * 0.28, h * 0.12, 0, 0, Math.PI * 2); },
};

function framePath(c: Ctx, frame: Frame, w: number, h: number) {
  c.beginPath();
  switch (frame) {
    case 'land': c.rect(-w / 2, -h / 2, w, h); break;
    case 'air': c.moveTo(-w / 2, h / 2); c.lineTo(-w / 2, 0); c.bezierCurveTo(-w / 2, -h * 0.75, w / 2, -h * 0.75, w / 2, 0); c.lineTo(w / 2, h / 2); c.closePath(); break;
    case 'sea': c.ellipse(0, 0, w / 2, h / 2 + 1, 0, 0, Math.PI * 2); break;
    case 'subsurface': c.moveTo(-w / 2, -h / 2); c.lineTo(w / 2, -h / 2); c.lineTo(w / 2, 0); c.bezierCurveTo(w / 2, h * 0.75, -w / 2, h * 0.75, -w / 2, 0); c.closePath(); break;
  }
}

/** Frame, glyph and echelon mark centered on the origin; strength and selection are drawn per frame on top. */
function paintCounter(c: Ctx, w: number, kind: FormationKind, echelon: Echelon, fill: string, own: boolean) {
  const h = w * 0.66;
  framePath(c, FRAME_OF[kind], w, h);
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = own ? 1.6 : 1.1;
  c.strokeStyle = own ? '#e8f1ff' : 'rgba(10,14,20,0.9)';
  c.stroke();
  c.beginPath();
  GLYPH[kind](c, w * 0.9, h * 0.9);
  c.strokeStyle = INK;
  c.lineWidth = 1.2;
  c.stroke();
  if (kind === 'artillery' || kind === 'strategic') { c.fillStyle = INK; c.fill(); }
  if (w >= 16) {
    c.fillStyle = 'rgba(230,236,245,0.9)';
    c.font = `600 ${Math.max(7, w * 0.26)}px "JetBrains Mono", ui-monospace, monospace`;
    c.textAlign = 'center';
    c.textBaseline = 'bottom';
    c.fillText(ECHELON_MARK[echelon], 0, -h / 2 - 1);
  }
}

const INK = '#0a0e14';
const SPRITE_LIMIT = 3_000;

interface Sprite {
  img: OffscreenCanvas;
  /** CSS-pixel size and the counter center's offset inside it. */
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

/**
 * Counters are rasterized once per (kind, echelon, nation color, ownership,
 * width) and blitted, so a frame with hundreds of counters costs hundreds of
 * drawImage calls instead of hundreds of path fills, strokes and text runs.
 */
export class CounterSprites {
  private readonly cache = new Map<string, Sprite>();
  private dpr = 1;

  setDpr(dpr: number) {
    if (dpr !== this.dpr) this.cache.clear();
    this.dpr = dpr;
  }

  private sprite(w: number, kind: FormationKind, echelon: Echelon, fill: string, own: boolean): Sprite {
    const key = `${w}|${kind}|${echelon}|${fill}|${own ? 1 : 0}`;
    let s = this.cache.get(key);
    if (s) return s;
    if (this.cache.size > SPRITE_LIMIT) this.cache.clear();
    const h = w * 0.66;
    const top = w * 0.26 + 4;
    const cw = Math.ceil(w + 6), ch = Math.ceil(h + top + 4);
    const img = new OffscreenCanvas(Math.ceil(cw * this.dpr), Math.ceil(ch * this.dpr));
    const c = img.getContext('2d')! as unknown as Ctx;
    c.scale(this.dpr, this.dpr);
    c.translate(cw / 2, top + h / 2);
    paintCounter(c, w, kind, echelon, fill, own);
    s = { img, w: cw, h: ch, ox: cw / 2, oy: top + h / 2 };
    this.cache.set(key, s);
    return s;
  }

  /** Draws a counter centered on (x, y) with width w and a strength bar beneath; returns its hit box. */
  draw(c: Ctx, x: number, y: number, w: number, kind: FormationKind, echelon: Echelon, strength: number, fill: string, own: boolean, routed: boolean): CounterBox {
    const s = this.sprite(Math.round(w), kind, echelon, fill, own);
    if (routed) c.globalAlpha = 0.55;
    c.drawImage(s.img, x - s.ox, y - s.oy, s.w, s.h);
    if (routed) c.globalAlpha = 1;
    const h = w * 0.66, by = y + h / 2 + 3;
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.fillRect(x - w / 2, by, w, 3);
    c.fillStyle = strength > 0.66 ? '#5ad17a' : strength > 0.33 ? '#f2c14e' : '#ef5b5b';
    c.fillRect(x - w / 2, by, w * Math.max(0, Math.min(1, strength)), 3);
    return { x: x - w / 2, y: y - h / 2 - 8, w, h: h + 14 };
  }
}
