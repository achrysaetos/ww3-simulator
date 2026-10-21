import { useEffect, useRef, useState } from 'react';
import type { GameMap } from '../core/map';
import type { FormationId, NationId, NodeId } from '../core/types';
import type { SimClient } from './client';
import type { Palette } from './colors';
import type { PlaceNamer } from './events';
import type { Manifest } from './map/tiles';
import { ZoomControl } from './map/ZoomControl';
import { contactOf, MapRenderer, type Overlays } from './renderer';
import { NO_NATION, type ScenarioCard } from './snapshot';
import { BAND_PRESET, pinTo, unproject, zoomForPxPerDeg, type ZoomBand } from './view';
import './theme/kit.css';

export interface MapViewProps {
  client: SimClient;
  palette: Palette;
  places: PlaceNamer;
  playAs: string | null;
  selected: FormationId | null;
  targeting: 'order' | 'nuclear' | null;
  overlays: Overlays;
  onSelectFormation(id: FormationId | null): void;
  onTarget(node: NodeId): void;
  /**
   * Filled by the map so panels can fly to a node. 'close' zooms in to at least the theatre;
   * 'wide' zooms out to it if closer, so a target far from the unit stays on screen.
   */
  focusHandle: { current: ((node: NodeId, frame?: 'close' | 'wide') => void) | null };
}

const TILES = `${import.meta.env.BASE_URL}tiles/`;

/**
 * Where the map opens: the capital of the nation under attack in the player's own opening war,
 * else in the scenario's first war (Taipei for Taiwan 2027 played as the US), else the player's
 * capital. Null when there is neither.
 */
export function openingFocus(map: GameMap, scenario: Pick<ScenarioCard, 'wars'>, playAs: string | null): NodeId | null {
  const war = scenario.wars.find(([a, t]) => a === playAs || t === playAs) ?? scenario.wars[0];
  const nation = war ? war[1] : playAs;
  const i = map.nationIds.indexOf(nation as NationId);
  return i < 0 ? null : (map.data.nations[i].capital!.cell as NodeId);
}

export function MapView(props: MapViewProps) {
  const glRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [hover, setHover] = useState<{ node: NodeId; x: number; y: number } | null>(null);
  const hoverRef = useRef<NodeId | null>(null);
  hoverRef.current = hover?.node ?? null;
  const [hud, setHud] = useState<{ band: ZoomBand; km: number }>({ band: 'theatre', km: 1 });
  const [failed, setFailed] = useState<string | null>(null);
  const dirty = useRef(true);
  const opened = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const { client, palette } = propsRef.current;
    let r: MapRenderer;
    try {
      r = new MapRenderer(glRef.current!, canvas, client.map, palette, client.meta?.nationIds ?? client.map.nationIds, TILES);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : String(e));
      return;
    }
    rendererRef.current = r;
    (window as unknown as { __map?: MapRenderer }).__map = r;
    r.onInvalidate = () => (dirty.current = true);
    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      r.resize(rect.width, rect.height, window.devicePixelRatio || 1);
      if (!opened.current && rect.width > 0) {
        opened.current = true;
        const { client: c, playAs } = propsRef.current;
        const focus = c.meta ? openingFocus(c.map, c.meta.scenario, playAs) : null;
        const at = focus === null ? { lon: 24, lat: 50 } : { lon: c.map.lon[focus], lat: c.map.lat[focus] };
        // Open on the night globe and fly down to the theatre: the war starts here.
        r.setCamera(r.bandCamera('world', { lon: at.lon - 25, lat: at.lat - 12 }));
        r.flyTo(r.bandCamera('theatre', at), performance.now() + 350);
      }
      dirty.current = true;
    };
    fit();
    propsRef.current.focusHandle.current = (node, frame = 'close') => {
      const theatre = zoomForPxPerDeg(BAND_PRESET.theatre);
      r.flyTo({ lon: client.map.lon[node], lat: client.map.lat[node], zoom: frame === 'wide' ? Math.min(r.cam.zoom, theatre) : Math.max(r.cam.zoom, theatre) });
    };
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
      void fetch(`${TILES}places.json`).then((x) => x.json()).then((rows) => alive && r.setPlaces(rows));
      dirty.current = true;
    }).catch((e) => setFailed(`terrain tiles did not load (${e})`));
    void Promise.all(['600 12px "Barlow Condensed"', '500 10px "IBM Plex Mono"', '400 12px Inter'].map((f) => document.fonts.load(f))).then(() => {
      r.fontsReady();
      dirty.current = true;
    });

    const unsub = client.subscribe(() => {
      r.addEvents(client.state.latestEvents, performance.now());
      dirty.current = true;
    });

    let raf = 0;
    let shown = { band: '', km: 0 };
    const loop = (now: number) => {
      if (dirty.current || r.animating) {
        const changed = dirty.current;
        dirty.current = false;
        const p = propsRef.current;
        r.render({
          state: client.state,
          nationIds: client.meta?.nationIds ?? client.map.nationIds,
          playAs: p.playAs,
          selected: p.selected,
          hoverNode: hoverRef.current,
          targeting: p.targeting,
          overlays: p.overlays,
        }, now, changed);
        const km = Number(r.kmPerPx.toPrecision(2));
        if (r.band !== shown.band || km !== shown.km) {
          shown = { band: r.band, km };
          setHud({ band: r.band, km });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      unsub();
    };
  }, []);

  useEffect(() => {
    dirty.current = true;
  }, [props.playAs, props.selected, props.targeting, props.overlays, hover?.node]);

  const drag = useRef<{ x: number; y: number; grab: [number, number] | null; last: [number, number]; moved: boolean } | null>(null);

  const local = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top] as const;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const r = rendererRef.current;
    if (!r) return;
    const [x, y] = local(e);
    drag.current = { x, y, grab: unproject(r.cam, r.vp, x, y), last: [x, y], moved: false };
    canvasRef.current!.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const r = rendererRef.current;
    if (!r) return;
    const [x, y] = local(e);
    const d = drag.current;
    if (d) {
      if (Math.hypot(x - d.x, y - d.y) > 4) d.moved = true;
      if (d.moved) {
        // Keep the grabbed ground under the cursor; off the globe, rotate by the motion instead.
        r.setCamera(d.grab ? pinTo(r.cam, r.vp, d.grab[0], d.grab[1], x, y) : { ...r.cam, lon: r.cam.lon - (x - d.last[0]) * 0.3, lat: r.cam.lat + (y - d.last[1]) * 0.3 });
        d.last = [x, y];
        dirty.current = true;
        return;
      }
    }
    const node = r.pick(x, y);
    setHover(node === null ? null : { node, x, y });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    const r = rendererRef.current;
    if (!d || d.moved || !r) return;
    const [x, y] = local(e);
    const p = propsRef.current;
    if (p.targeting) {
      const node = r.pick(x, y);
      if (node !== null) p.onTarget(node);
      return;
    }
    for (let i = r.hits.length - 1; i >= 0; i--) {
      const h = r.hits[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
        if (h.zoomTo !== null) r.flyTo(h.zoomTo);
        else {
          // A stack that cannot open further: repeated clicks cycle through it.
          const at = p.selected ? h.ids.indexOf(p.selected) : -1;
          p.onSelectFormation(h.ids[(at + 1) % h.ids.length]);
        }
        dirty.current = true;
        return;
      }
    }
    p.onSelectFormation(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = rendererRef.current;
    if (!r) return;
    const [x, y] = local(e);
    const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    r.glideZoom(-delta * 0.0022, x, y);
    dirty.current = true;
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const r = rendererRef.current;
    if (!r || propsRef.current.targeting) return;
    const [x, y] = local(e);
    r.glideZoom(1, x, y);
    dirty.current = true;
  };

  const flyToBand = (b: ZoomBand) => {
    const r = rendererRef.current;
    if (!r) return;
    r.flyTo(r.bandCamera(b));
    dirty.current = true;
  };

  const { client, places } = props;
  const contestAt = (n: NodeId) => {
    const v = client.state.contest;
    for (let i = 0; i < v.length; i += 3) {
      if (v[i] !== n) continue;
      const by = client.state.nations.get(client.meta?.nationIds[v[i + 1]] as NationId);
      const pct = Math.round(v[i + 2] * 100);
      return <div className="tt-warn tt-plain" data-testid="tt-contest">{pct ? `Contested: ${by?.name ?? 'the enemy'} has pushed ${pct}% of the way across` : `Contested: ${by?.name ?? 'the enemy'} is attacking but has gained no ground yet`}</div>;
    }
    return null;
  };
  const hoverInfo = hover && !drag.current?.moved && (() => {
    const owner = client.state.control[hover.node];
    const ids = client.meta?.nationIds ?? client.map.nationIds;
    const holder = owner === NO_NATION ? null : client.state.nations.get(ids[owner]);
    const map = client.map;
    const sea = map.isSea(hover.node);
    const here = rendererRef.current?.formationsAt(hover.node) ?? [];
    return (
      <div className="map-tooltip ww-glass" style={{ left: hover.x + 16, top: hover.y + 16 }}>
        <div className="tt-title">{places.name(hover.node)}</div>
        <div className="tt-sub">{sea ? 'Sea zone' : `${map.terrain[hover.node]} · ${holder?.name ?? 'unclaimed'}`}</div>
        {!sea && map.owner[hover.node] !== (holder?.id ?? '') && <div className="tt-warn">Occupied (pre-war: {map.owner[hover.node]})</div>}
        {contestAt(hover.node)}
        {here.length > 0 && (
          <ul className="tt-list">
            {here.slice(0, 6).map((f) => {
              const c = contactOf(f);
              return <li key={f.entry.id}>{f.entry.nation} · {f.entry.name}{c && <span className="tt-age"> · seen {Math.round(c.ageHours)}h ago, ±{Math.round(c.errorKm)} km</span>}</li>;
            })}
            {here.length > 6 && <li className="ww-muted">+{here.length - 6} more</li>}
          </ul>
        )}
        {props.targeting && <div className="tt-hint">Click to set target</div>}
      </div>
    );
  })();

  return (
    <div className="map-wrap">
      <canvas ref={glRef} className="map-gl" aria-hidden="true" />
      <canvas
        ref={canvasRef}
        className={`map-canvas ${props.targeting ? `targeting-${props.targeting}` : ''}`}
        data-testid="map"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
      />
      <div className="ww-scan" />
      <div className="ww-vig" />
      <ZoomControl band={hud.band} kmPerPx={hud.km} onBand={flyToBand} />
      {failed && <div className="map-failed ww-glass">The map could not start: {failed}</div>}
      {hoverInfo}
    </div>
  );
}
