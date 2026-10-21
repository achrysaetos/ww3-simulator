import { useEffect, useRef } from 'react';
import type { GameMap } from '../../core/map';
import type { NodeId } from '../../core/types';

const SPAN_DEG = 3.2;

/**
 * A small situation map around one cell for the brief: the player's ground blue, the enemy's
 * red and hatched, the rest dark, with the cell ringed in gold. Drawn from the control map the
 * player already has.
 */
export function MiniMap({ map, control, version, mine, enemies, node, label, width = 150, height = 168 }: {
  map: GameMap; control: Uint16Array; version: number; mine: number; enemies: ReadonlySet<number>; node: NodeId; label: string; width?: number; height?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr;
    c.height = height * dpr;
    const g = c.getContext('2d');
    if (!g) return;
    g.scale(dpr, dpr);
    const lat0 = map.lat[node], lon0 = map.lon[node], k = Math.cos((lat0 * Math.PI) / 180);
    const ppd = height / SPAN_DEG;
    const x = (lon: number) => width / 2 + (lon - lon0) * k * ppd;
    const y = (lat: number) => height / 2 - (lat - lat0) * ppd;
    g.fillStyle = '#071019';
    g.fillRect(0, 0, width, height);
    const hatch = g.createPattern(hatchTile(), 'repeat');
    for (let n = 0; n < map.landCount; n++) {
      const dLat = Math.abs(map.lat[n] - lat0), dLon = Math.abs(map.lon[n] - lon0) * k;
      if (dLat > SPAN_DEG || dLon > SPAN_DEG * (width / height)) continue;
      const h = map.halfDeg[n];
      const owner = control[n];
      g.fillStyle = owner === mine ? 'rgba(54,120,200,0.55)' : enemies.has(owner) ? 'rgba(200,52,56,0.5)' : 'rgba(60,72,86,0.45)';
      const rx = x(map.lon[n] - h), ry = y(map.lat[n] + h), rw = 2 * h * k * ppd + 0.6, rh = 2 * h * ppd + 0.6;
      g.fillRect(rx, ry, rw, rh);
      if (enemies.has(owner) && hatch) {
        g.fillStyle = hatch;
        g.fillRect(rx, ry, rw, rh);
      }
    }
    const cx = x(lon0), cy = y(lat0);
    g.strokeStyle = '#ffb547';
    g.lineWidth = 2;
    g.shadowColor = 'rgba(255,181,71,0.8)';
    g.shadowBlur = 8;
    g.beginPath();
    g.arc(cx, cy, 9, 0, Math.PI * 2);
    g.stroke();
    g.shadowBlur = 0;
    g.fillStyle = '#ffb547';
    g.beginPath();
    g.arc(cx, cy, 2.5, 0, Math.PI * 2);
    g.fill();
  }, [map, control, version, mine, enemies, node, width, height]);
  const lat = map.lat[node], lon = map.lon[node];
  return (
    <figure className="ww-minimap" style={{ width, height }}>
      <canvas ref={ref} style={{ width, height }} aria-hidden="true" />
      <figcaption className="ww-minimap-label">{label}</figcaption>
      <span className="ww-minimap-coord ww-mono">{Math.abs(lat).toFixed(2)}{lat >= 0 ? 'N' : 'S'} {Math.abs(lon).toFixed(2)}{lon >= 0 ? 'E' : 'W'}</span>
    </figure>
  );
}

let tile: HTMLCanvasElement | null = null;
function hatchTile(): HTMLCanvasElement {
  if (tile) return tile;
  tile = document.createElement('canvas');
  tile.width = tile.height = 8;
  const g = tile.getContext('2d')!;
  g.strokeStyle = 'rgba(255,120,120,0.35)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(0, 8);
  g.lineTo(8, 0);
  g.stroke();
  return tile;
}
