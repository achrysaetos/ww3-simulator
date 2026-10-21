import type { ZoomBand } from '../view';

const BANDS: ZoomBand[] = ['world', 'theatre', 'front'];

/** A scale bar length that reads as a round number of km. */
export function scaleBar(kmPerPx: number, maxPx = 110): { km: number; px: number } {
  const raw = kmPerPx * maxPx, pow = 10 ** Math.floor(Math.log10(raw));
  const km = [5, 2, 1].map((m) => m * pow).find((k) => k <= raw) ?? pow;
  return { km, px: km / kmPerPx };
}

/** World, theatre, front: the band the camera is in, a button to fly to each, and the scale. */
export function ZoomControl({ band, kmPerPx, onBand }: { band: ZoomBand; kmPerPx: number; onBand(b: ZoomBand): void }) {
  const bar = scaleBar(kmPerPx);
  return (
    <div className="map-zoom ww-glass" data-testid="map-zoom">
      <div className="map-zoom-bands" role="group" aria-label="Map zoom">
        {BANDS.map((b, i) => (
          <span key={b} className="map-zoom-item">
            {i > 0 && <i className="map-zoom-dot" aria-hidden="true" />}
            <button type="button" className={band === b ? 'on' : ''} aria-pressed={band === b} onClick={() => onBand(b)} data-testid={`zoom-${b}`}>{b}</button>
          </span>
        ))}
      </div>
      <div className="map-zoom-scale">
        <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true"><rect x="1" y="1" width="10" height="14" rx="5" fill="none" stroke="currentColor" strokeWidth="1.2" /><line x1="6" y1="4" x2="6" y2="7" stroke="currentColor" strokeWidth="1.2" /></svg>
        <span>Scroll to zoom</span>
        <span className="map-zoom-rule" style={{ width: bar.px }} />
        <span className="ww-mono">{bar.km >= 1 ? `${bar.km} km` : `${Math.round(bar.km * 1000)} m`}</span>
      </div>
    </div>
  );
}
