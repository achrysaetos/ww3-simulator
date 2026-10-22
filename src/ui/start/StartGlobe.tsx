import { useEffect, useRef, useState } from 'react';
import type { SimClient } from '../client';
import type { Palette } from '../colors';
import type { Manifest } from '../map/tiles';
import { MapRenderer, type Overlays } from '../renderer';
import { project, type Camera, type Viewport } from '../view';

export interface GlobePoint { lon: number; lat: number }
export interface TheatreMark extends GlobePoint { id: string; label: string; selected: boolean }
export interface GlobeArc { from: GlobePoint; to: GlobePoint }

interface Props {
  client: SimClient;
  palette: Palette;
  /** The point the globe turns to face. */
  focus: GlobePoint | null;
  marks: readonly TheatreMark[];
  arcs: readonly GlobeArc[];
  callout: { kicker: string; title: string; detail: string } | null;
}

const TILES = `${import.meta.env.BASE_URL}tiles/`;
const OFF: Overlays = { air: false, sea: false, infra: false, fallout: false, weather: false, cities: false, seaZones: false };
/** The globe's radius as a share of the window height (KIT.md night globe: radius 540 of 900); start.css places its centre. */
const RADIUS = 0.6;

/** Turn the globe so the theatre sits a little above and right of its centre, as in the mockup. */
const facing = (p: GlobePoint, zoom: number): Camera => ({ lon: p.lon - 4, lat: Math.max(-20, Math.min(42, p.lat - 9)), zoom });

/**
 * The start screen's night Earth: the game's own globe renderer with no world loaded, turned to
 * face the chosen scenario, with every scenario's theatre marked and the opening wars drawn as arcs.
 */
export function StartGlobe({ client, palette, focus, marks, arcs, callout }: Props) {
  const glRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rRef = useRef<MapRenderer | null>(null);
  const [view, setView] = useState<{ cam: Camera; vp: Viewport; left: number; top: number } | null>(null);
  const focusRef = useRef(focus);
  focusRef.current = focus;

  useEffect(() => {
    const canvas = canvasRef.current!;
    let r: MapRenderer;
    try {
      r = new MapRenderer(glRef.current!, canvas, client.map, palette, client.map.nationIds, TILES);
    } catch {
      return;
    }
    rRef.current = r;
    let dirty = true;
    r.onInvalidate = () => (dirty = true);
    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      r.resize(rect.width, rect.height, Math.min(2, window.devicePixelRatio || 1));
      const at = focusRef.current ?? { lon: 24, lat: 50 };
      r.setCamera(facing(at, Math.log2(window.innerHeight * RADIUS)));
      dirty = true;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    let alive = true;
    void Promise.all([
      fetch(`${TILES}manifest.json`).then((x) => x.json() as Promise<Manifest>),
      fetch(`${TILES}lights.json`).then((x) => x.json() as Promise<number[]>),
    ]).then(([manifest, lights]) => {
      if (!alive) return;
      r.setManifest(manifest);
      r.setLights(Float32Array.from(lights));
      dirty = true;
    }).catch(() => {});

    let raf = 0;
    let shown: Camera | null = null;
    const loop = (now: number) => {
      if (dirty || r.animating) {
        dirty = false;
        r.render({ state: client.state, nationIds: client.map.nationIds, playAs: null, selected: null, hoverNode: null, targeting: null, overlays: OFF, orders: null, tracks: [], dtHours: 6 }, now, false);
        if (r.cam !== shown) {
          shown = r.cam;
          const rect = canvas.getBoundingClientRect();
          setView({ cam: r.cam, vp: r.vp, left: rect.left, top: rect.top });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      rRef.current = null;
    };
  }, [client, palette]);

  useEffect(() => {
    const r = rRef.current;
    if (r && focus) r.flyTo(facing(focus, r.cam.zoom));
  }, [focus?.lon, focus?.lat]);

  const at = (p: GlobePoint): [number, number] | null => {
    if (!view) return null;
    const s = project(view.cam, view.vp, p.lon, p.lat);
    return s && [s[0] + view.left, s[1] + view.top];
  };
  const chosen = marks.find((m) => m.selected);
  const cp = chosen && at(chosen);

  return (
    <div className="st-globe" aria-hidden="true">
      <canvas ref={glRef} className="st-globe-gl" />
      <canvas ref={canvasRef} className="st-globe-2d" />
      <svg className="st-globe-ovl" width="100%" height="100%">
        <defs>
          <filter id="st-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <radialGradient id="st-bloom"><stop offset="0" stopColor="#ff4d4f" stopOpacity="0.3" /><stop offset="0.5" stopColor="#ff4d4f" stopOpacity="0.08" /><stop offset="1" stopColor="#ff4d4f" stopOpacity="0" /></radialGradient>
          <radialGradient id="st-bloom-gold"><stop offset="0" stopColor="#ffb547" stopOpacity="0.32" /><stop offset="1" stopColor="#ffb547" stopOpacity="0" /></radialGradient>
        </defs>
        {cp && <circle cx={cp[0]} cy={cp[1]} r="150" fill="url(#st-bloom)" />}
        {arcs.map((a, i) => {
          const p = at(a.from), q = at(a.to);
          if (!p || !q) return null;
          const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
          if (len < 6) return null;
          const lift = Math.min(120, len * 0.35);
          const c = [(p[0] + q[0]) / 2 + (dy / len) * lift * 0.2, (p[1] + q[1]) / 2 - lift];
          const d = `M${p[0]} ${p[1]} Q${c[0]} ${c[1]} ${q[0]} ${q[1]}`;
          return (
            <g key={i}>
              <path d={d} fill="none" stroke="#ff4d4f" strokeOpacity="0.55" strokeWidth="5" filter="url(#st-glow)" />
              <path d={d} fill="none" stroke="#ff8f90" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx={p[0]} cy={p[1]} r="3.2" fill="none" stroke="#ff6b5e" strokeWidth="1.2" />
              <circle cx={q[0]} cy={q[1]} r="6" fill="#ff4d4f" fillOpacity="0.55" filter="url(#st-glow)" />
              <circle cx={q[0]} cy={q[1]} r="2.2" fill="#fff" />
            </g>
          );
        })}
        {marks.filter((m) => !m.selected).map((m) => {
          const p = at(m);
          if (!p || (cp && callout && p[0] > cp[0] + 40 && p[0] < cp[0] + 380 && p[1] > cp[1] + 16 && p[1] < cp[1] + 110)) return null;
          return (
            <g key={m.id} className="st-mark">
              <circle cx={p[0]} cy={p[1]} r="14" fill="none" stroke="#ff6b5e" strokeOpacity="0.25" />
              <circle cx={p[0]} cy={p[1]} r="7.5" fill="none" stroke="#ff6b5e" strokeOpacity="0.65" strokeWidth="1.2" />
              <circle cx={p[0]} cy={p[1]} r="2.6" fill="#ff6b5e" />
              {p[0] > window.innerWidth * 0.8
                ? <text x={p[0] - 14} y={p[1] + 4} textAnchor="end">{m.label}</text>
                : <text x={p[0] + 14} y={p[1] + 4}>{m.label}</text>}
            </g>
          );
        })}
        {cp && (
          <g>
            <circle cx={cp[0]} cy={cp[1]} r="60" fill="url(#st-bloom-gold)" />
            <g fill="none" stroke="#ffb547">
              <circle cx={cp[0]} cy={cp[1]} r="48" strokeOpacity="0.12" />
              <circle cx={cp[0]} cy={cp[1]} r="34" strokeOpacity="0.28" />
              <circle cx={cp[0]} cy={cp[1]} r="22" strokeOpacity="0.6" strokeWidth="1.2" strokeDasharray="3 3" className="st-spin" style={{ transformOrigin: `${cp[0]}px ${cp[1]}px` }} />
              <circle cx={cp[0]} cy={cp[1]} r="12" strokeWidth="1.6" filter="url(#st-glow)" />
              <path d={`M${cp[0]} ${cp[1] - 62} V${cp[1] - 54} M${cp[0]} ${cp[1] + 54} V${cp[1] + 62} M${cp[0] - 62} ${cp[1]} H${cp[0] - 54} M${cp[0] + 54} ${cp[1]} H${cp[0] + 62}`} strokeOpacity="0.8" strokeWidth="1.4" />
            </g>
            <circle cx={cp[0]} cy={cp[1]} r="4.5" fill="#ffb547" filter="url(#st-glow)" />
            <circle cx={cp[0]} cy={cp[1]} r="2" fill="#fff6e0" />
            {callout && (
              <g className="st-callout">
                <path d={`M${cp[0] + 26} ${cp[1] + 26} L${cp[0] + 62} ${cp[1] + 62} H${cp[0] + 92}`} fill="none" stroke="#ffb547" strokeWidth="1.2" strokeOpacity="0.9" />
                <rect x={cp[0] + 98} y={cp[1] + 32} width="210" height="62" fill="#04070c" fillOpacity="0.62" rx="2" />
                <rect x={cp[0] + 98} y={cp[1] + 32} width="2" height="62" fill="#ffb547" />
                <text x={cp[0] + 110} y={cp[1] + 48} className="st-co-kicker">{callout.kicker}</text>
                <text x={cp[0] + 110} y={cp[1] + 68} className="st-co-title">{callout.title}</text>
                <text x={cp[0] + 110} y={cp[1] + 85} className="st-co-detail">{callout.detail}</text>
              </g>
            )}
          </g>
        )}
      </svg>
    </div>
  );
}
