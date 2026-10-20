import { useEffect, useRef, useState } from 'react';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { FormationId, NodeId } from '../core/types';
import type { SimClient } from './client';
import type { Palette } from './colors';
import { MapRenderer, type Overlays } from './renderer';
import { NO_NATION } from './snapshot';
import { centerOn, pickNode, zoomAt, type ViewTransform } from './view';
import type { PlaceNamer } from './events';

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
  /** Filled by the map so panels can fly to a node. */
  focusHandle: { current: ((node: NodeId) => void) | null };
}

export function MapView(props: MapViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [hover, setHover] = useState<{ node: NodeId; x: number; y: number } | null>(null);
  const hoverRef = useRef<NodeId | null>(null);
  hoverRef.current = hover?.node ?? null;
  const dirty = useRef(true);
  const userMoved = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const { client, palette } = propsRef.current;
    const r = new MapRenderer(canvas, client.map, palette);
    rendererRef.current = r;
    (window as unknown as { __map?: MapRenderer }).__map = r;
    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      r.resize(rect.width, rect.height, window.devicePixelRatio || 1);
      if (!userMoved.current) r.t = centerOn(r.proj, rect.width, rect.height, 24, 50, 3.2);
      dirty.current = true;
    };
    fit();
    propsRef.current.focusHandle.current = (node) => {
      r.t = centerOn(r.proj, r.width, r.height, client.map.lon[node], client.map.lat[node], Math.max(r.t.k, 4));
      userMoved.current = true;
      dirty.current = true;
    };
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    let alive = true;
    import('world-atlas/countries-50m.json').then((m) => {
      if (!alive) return;
      const topo = (m.default ?? m) as unknown as Topology<{ countries: GeometryCollection; land: GeometryCollection }>;
      r.setTopology(mesh(topo, topo.objects.countries, (a, b) => a !== b), feature(topo, topo.objects.land));
      dirty.current = true;
    });

    const unsub = client.subscribe(() => {
      r.addEvents(client.state.latestEvents, performance.now());
      dirty.current = true;
    });

    let raf = 0;
    const loop = (now: number) => {
      if (dirty.current || r.animating) {
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
        }, now);
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

  const drag = useRef<{ x: number; y: number; t: ViewTransform; moved: boolean } | null>(null);

  const local = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top] as const;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const r = rendererRef.current!;
    const [x, y] = local(e);
    drag.current = { x, y, t: r.t, moved: false };
    canvasRef.current!.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const r = rendererRef.current!;
    const [x, y] = local(e);
    const d = drag.current;
    if (d) {
      if (Math.hypot(x - d.x, y - d.y) > 4) d.moved = true;
      if (d.moved) {
        r.t = { k: d.t.k, x: d.t.x + x - d.x, y: d.t.y + y - d.y };
        userMoved.current = true;
        dirty.current = true;
        return;
      }
    }
    const node = pickNode(r.map, r.proj, r.t, x, y);
    setHover(node === null ? null : { node, x, y });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const r = rendererRef.current!;
    const [x, y] = local(e);
    const p = propsRef.current;
    if (p.targeting) {
      const node = pickNode(r.map, r.proj, r.t, x, y);
      if (node !== null) p.onTarget(node);
      return;
    }
    for (let i = r.hits.length - 1; i >= 0; i--) {
      const h = r.hits[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
        if (h.zoomTo !== null) {
          r.t = centerOn(r.proj, r.width, r.height, r.map.lon[h.node], r.map.lat[h.node], h.zoomTo);
          userMoved.current = true;
          dirty.current = true;
        } else {
          // A stack that cannot open further: repeated clicks cycle through it.
          const at = p.selected ? h.ids.indexOf(p.selected) : -1;
          p.onSelectFormation(h.ids[(at + 1) % h.ids.length]);
        }
        return;
      }
    }
    p.onSelectFormation(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = rendererRef.current!;
    const [x, y] = local(e);
    r.t = zoomAt(r.t, x, y, Math.exp(-e.deltaY * 0.0015));
    userMoved.current = true;
    dirty.current = true;
  };

  const { client, places } = props;
  const hoverInfo = hover && (() => {
    const owner = client.state.control[hover.node];
    const ids = client.meta?.nationIds ?? client.map.nationIds;
    const holder = owner === NO_NATION ? null : client.state.nations.get(ids[owner]);
    const map = client.map;
    const sea = map.isSea(hover.node);
    const here = rendererRef.current?.formationsAt(hover.node) ?? [];
    return (
      <div className="map-tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
        <div className="tt-title">{places.name(hover.node)}</div>
        <div>{sea ? 'Sea zone' : `${map.terrain[hover.node]} · ${holder?.name ?? 'unclaimed'}`}</div>
        {!sea && map.owner[hover.node] !== (holder?.id ?? '') && <div className="tt-warn">Occupied (pre-war: {map.owner[hover.node]})</div>}
        {here.length > 0 && (
          <ul className="tt-list">
            {here.slice(0, 6).map((f) => <li key={f.entry.id}>{f.entry.nation} · {f.entry.name}</li>)}
            {here.length > 6 && <li className="muted">+{here.length - 6} more</li>}
          </ul>
        )}
        {props.targeting && <div className="tt-hint">Click to set target</div>}
      </div>
    );
  })();

  return (
    <div className="map-wrap">
      <canvas
        ref={canvasRef}
        className={`map-canvas ${props.targeting ? `targeting-${props.targeting}` : ''}`}
        data-testid="map"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onWheel={onWheel}
      />
      {hoverInfo}
    </div>
  );
}
