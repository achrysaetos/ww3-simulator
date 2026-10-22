/**
 * Simplified national flags, drawn in a 30 x 20 box from bands and a few marks. They are
 * recognisable at the 38 px the HUD shows them, not heraldic; a nation without an entry
 * gets a badge with its code.
 */
import type { ReactElement } from 'react';

type Mark =
  | ['rect', number, number, number, number, string]
  | ['circle', number, number, number, string]
  | ['star', number, number, number, string]
  | ['poly', string, string]
  | ['outline', string, string]
  /** A path, for curved shapes. */
  | ['path', string, string]
  /** A Nordic or centred cross: centre x, centre y, thickness. */
  | ['cross', number, number, number, string]
  | ['saltire', number, string]
  /** A crescent opening right: x, y, r, colour, the field colour that cuts it. */
  | ['crescent', number, number, number, string, string];

interface Spec {
  /** Horizontal bands, top to bottom. */
  h?: string[];
  /** Vertical bands, hoist to fly. */
  v?: string[];
  /** Relative band widths, when not equal. */
  w?: number[];
  marks?: Mark[];
}

const UNION: Mark[] = [['rect', 0, 0, 30, 20, '#012169'], ['saltire', 4, '#ffffff'], ['saltire', 1.4, '#c8102e'], ['cross', 15, 10, 6, '#ffffff'], ['cross', 15, 10, 3.4, '#c8102e']];
const unionCanton = (scale: number): Mark[] => [['poly', `0,0 ${30 * scale},0 ${30 * scale},${20 * scale} 0,${20 * scale}`, '#012169'],
  ['poly', `0,0 ${2 * scale},0 ${30 * scale},${18.6 * scale} ${30 * scale},${20 * scale} ${28 * scale},${20 * scale} 0,${1.4 * scale}`, '#ffffff'],
  ['poly', `${30 * scale},0 ${28 * scale},0 0,${18.6 * scale} 0,${20 * scale} ${2 * scale},${20 * scale} ${30 * scale},${1.4 * scale}`, '#ffffff'],
  ['rect', 12 * scale, 0, 6 * scale, 20 * scale, '#ffffff'], ['rect', 0, 7 * scale, 30 * scale, 6 * scale, '#ffffff'],
  ['rect', 13.3 * scale, 0, 3.4 * scale, 20 * scale, '#c8102e'], ['rect', 0, 8.3 * scale, 30 * scale, 3.4 * scale, '#c8102e']];
const nordic = (field: string, cross: string, inner?: string): Spec => ({
  h: [field], marks: [['cross', 11, 10, 4.4, cross], ...(inner ? [['cross', 11, 10, 2, inner] as Mark] : [])],
});

const FLAGS: Record<string, Spec> = {
  UKR: { h: ['#0057b7', '#ffd700'] },
  RUS: { h: ['#ffffff', '#0039a6', '#d52b1e'] },
  POL: { h: ['#ffffff', '#dc143c'] },
  DEU: { h: ['#000000', '#dd0000', '#ffce00'] },
  EST: { h: ['#0072ce', '#000000', '#ffffff'] },
  LTU: { h: ['#fdb913', '#006a44', '#c1272d'] },
  LVA: { h: ['#9e3039', '#ffffff', '#9e3039'], w: [2, 1, 2] },
  NLD: { h: ['#ae1c28', '#ffffff', '#21468b'] },
  HUN: { h: ['#ce2939', '#ffffff', '#477050'] },
  BGR: { h: ['#ffffff', '#00966e', '#d62612'] },
  AUT: { h: ['#ed2939', '#ffffff', '#ed2939'] },
  YEM: { h: ['#ce1126', '#ffffff', '#000000'] },
  EGY: { h: ['#ce1126', '#ffffff', '#000000'], marks: [['circle', 15, 10, 1.8, '#c09300']] },
  SYR: { h: ['#ce1126', '#ffffff', '#000000'], marks: [['star', 11, 10, 1.6, '#007a3d'], ['star', 19, 10, 1.6, '#007a3d']] },
  IRQ: { h: ['#ce1126', '#ffffff', '#000000'], marks: [['rect', 10, 9, 10, 2, '#007a3d']] },
  SRB: { h: ['#c6363c', '#0c4076', '#ffffff'] },
  SVN: { h: ['#ffffff', '#0000ff', '#ff0000'] },
  SVK: { h: ['#ffffff', '#0b4ea2', '#ee1c25'] },
  HRV: { h: ['#ff0000', '#ffffff', '#171796'] },
  ARM: { h: ['#d90012', '#0033a0', '#f2a800'] },
  AZE: { h: ['#00b5e2', '#ef3340', '#509e2f'] },
  IDN: { h: ['#ce1126', '#ffffff'] },
  COL: { h: ['#fcd116', '#003893', '#ce1126'], w: [2, 1, 1] },
  ESP: { h: ['#aa151b', '#f1bf00', '#aa151b'], w: [1, 2, 1] },
  THA: { h: ['#a51931', '#f4f5f8', '#2d2a4a', '#f4f5f8', '#a51931'], w: [1, 1, 2, 1, 1] },
  ARG: { h: ['#74acdf', '#ffffff', '#74acdf'], marks: [['circle', 15, 10, 1.8, '#f6b40e']] },
  BLR: { h: ['#c8313e', '#4aa657'], w: [2, 1], marks: [['rect', 0, 0, 3.4, 20, '#ffffff'], ['rect', 1, 0, 1.4, 20, '#c8313e']] },
  KAZ: { h: ['#00afca'], marks: [['circle', 15, 9, 3.4, '#fec50c']] },
  FRA: { v: ['#002395', '#ffffff', '#ed2939'] },
  ITA: { v: ['#009246', '#ffffff', '#ce2b37'] },
  BEL: { v: ['#000000', '#fdda24', '#ef3340'] },
  IRL: { v: ['#169b62', '#ffffff', '#ff883e'] },
  ROU: { v: ['#002b7f', '#fcd116', '#ce1126'] },
  MDA: { v: ['#0046ae', '#ffd200', '#cc092f'] },
  MEX: { v: ['#006847', '#ffffff', '#ce1126'], marks: [['circle', 15, 10, 2, '#8c5a2b']] },
  NGA: { v: ['#008751', '#ffffff', '#008751'] },
  CAN: { v: ['#d52b1e', '#ffffff', '#d52b1e'], w: [1, 2, 1], marks: [['poly', '15,4.5 16.4,7.6 18.6,7 17.6,10.6 19.6,11 15.6,13.4 15.6,15.6 14.4,15.6 14.4,13.4 10.4,11 12.4,10.6 11.4,7 13.6,7.6', '#d52b1e']] },
  JPN: { h: ['#ffffff'], marks: [['circle', 15, 10, 6, '#bc002d']] },
  KOR: { h: ['#ffffff'], marks: [['circle', 15, 10, 5, '#003478'], ['path', 'M10 10 A5 5 0 0 1 20 10 Z', '#cd2e3a'], ['circle', 12.5, 10, 2.5, '#cd2e3a'], ['circle', 17.5, 10, 2.5, '#003478'],
    ['rect', 4, 3.5, 4, 0.8, '#000000'], ['rect', 4, 5, 4, 0.8, '#000000'], ['rect', 22, 14.2, 4, 0.8, '#000000'], ['rect', 22, 15.7, 4, 0.8, '#000000'], ['rect', 22, 3.5, 4, 0.8, '#000000'], ['rect', 4, 15.7, 4, 0.8, '#000000']] },
  PRK: { h: ['#024fa2', '#ffffff', '#ed1c27', '#ffffff', '#024fa2'], w: [3, 0.6, 12, 0.6, 3], marks: [['circle', 10.5, 10, 3.8, '#ffffff'], ['star', 10.5, 10, 3.5, '#ed1c27']] },
  CHN: { h: ['#ee1c25'], marks: [['star', 5.5, 5.5, 3, '#ffff00'], ['star', 10.5, 2.4, 1, '#ffff00'], ['star', 12.4, 4.4, 1, '#ffff00'], ['star', 12.4, 7.2, 1, '#ffff00'], ['star', 10.5, 9.2, 1, '#ffff00']] },
  TWN: { h: ['#fe0000'], marks: [['rect', 0, 0, 15, 10, '#000095'], ['circle', 7.5, 5, 3.2, '#ffffff'], ['circle', 7.5, 5, 2.2, '#000095'], ['circle', 7.5, 5, 1.8, '#ffffff']] },
  VNM: { h: ['#da251d'], marks: [['star', 15, 10, 5.5, '#ffff00']] },
  USA: {
    h: ['#b22234', '#ffffff', '#b22234', '#ffffff', '#b22234', '#ffffff', '#b22234', '#ffffff', '#b22234', '#ffffff', '#b22234', '#ffffff', '#b22234'],
    marks: [['rect', 0, 0, 12, 10.8, '#3c3b6e'], ...[1.6, 3.6, 5.6, 7.6, 9.4].flatMap((y, r) => [1.4, 3.6, 5.8, 8, 10.2].slice(0, r % 2 ? 4 : 5).map((x) => ['circle', x + (r % 2 ? 1.1 : 0), y, 0.42, '#ffffff'] as Mark))],
  },
  GBR: { marks: UNION },
  AUS: { h: ['#00008b'], marks: [...unionCanton(0.5), ['star', 7.5, 15, 2.2, '#ffffff'], ['star', 22.5, 4, 1, '#ffffff'], ['star', 19, 9, 1, '#ffffff'], ['star', 25.5, 8, 1, '#ffffff'], ['star', 22.5, 16, 1.1, '#ffffff']] },
  NZL: { h: ['#012169'], marks: [...unionCanton(0.5), ['star', 22, 5, 1.1, '#c8102e'], ['star', 19.5, 9, 1.1, '#c8102e'], ['star', 25, 8.5, 1, '#c8102e'], ['star', 22, 15, 1.2, '#c8102e']] },
  ISR: { h: ['#ffffff'], marks: [['rect', 0, 2, 30, 2.6, '#0038b8'], ['rect', 0, 15.4, 30, 2.6, '#0038b8'], ['outline', '15,6 18.5,12 11.5,12', '#0038b8'], ['outline', '15,14 11.5,8 18.5,8', '#0038b8']] },
  IRN: { h: ['#239f40', '#ffffff', '#da0000'], marks: [['circle', 15, 10, 1.9, '#da0000'], ['circle', 15, 10, 1.1, '#ffffff']] },
  IND: { h: ['#ff9933', '#ffffff', '#138808'], marks: [['circle', 15, 10, 2.6, '#000080'], ['circle', 15, 10, 2, '#ffffff'], ['circle', 15, 10, 0.7, '#000080']] },
  PAK: { h: ['#01411c'], marks: [['rect', 0, 0, 7.5, 20, '#ffffff'], ['crescent', 18.6, 10, 5, '#ffffff', '#01411c'], ['star', 21.4, 7.6, 1.8, '#ffffff']] },
  TUR: { h: ['#e30a17'], marks: [['crescent', 11, 10, 5, '#ffffff', '#e30a17'], ['star', 16.4, 10, 2, '#ffffff']] },
  SAU: { h: ['#006c35'], marks: [['rect', 7, 6, 16, 2.4, '#ffffff'], ['rect', 8, 12.6, 14, 0.8, '#ffffff']] },
  ARE: { h: ['#00732f', '#ffffff', '#000000'], marks: [['rect', 0, 0, 7.5, 20, '#ff0000']] },
  JOR: { h: ['#000000', '#ffffff', '#007a3d'], marks: [['poly', '0,0 14,10 0,20', '#ce1126'], ['star', 4.5, 10, 1.2, '#ffffff']] },
  CZE: { h: ['#ffffff', '#d7141a'], marks: [['poly', '0,0 15,10 0,20', '#11457e']] },
  PHL: { h: ['#0038a8', '#ce1126'], marks: [['poly', '0,0 17,10 0,20', '#ffffff'], ['circle', 5.6, 10, 2, '#fcd116']] },
  CUB: { h: ['#002a8f', '#ffffff', '#002a8f', '#ffffff', '#002a8f'], marks: [['poly', '0,0 17,10 0,20', '#cf142b'], ['star', 5.6, 10, 2.4, '#ffffff']] },
  GRC: { h: ['#0d5eaf', '#ffffff', '#0d5eaf', '#ffffff', '#0d5eaf', '#ffffff', '#0d5eaf', '#ffffff', '#0d5eaf'], marks: [['rect', 0, 0, 11.1, 11.1, '#0d5eaf'], ['cross', 5.55, 5.55, 2.2, '#ffffff']] },
  GEO: { h: ['#ffffff'], marks: [['cross', 15, 10, 3, '#ff0000'], ['cross', 6.5, 4.5, 1, '#ff0000'], ['cross', 23.5, 4.5, 1, '#ff0000'], ['cross', 6.5, 15.5, 1, '#ff0000'], ['cross', 23.5, 15.5, 1, '#ff0000']] },
  BRA: { h: ['#009c3b'], marks: [['poly', '15,2.4 27.4,10 15,17.6 2.6,10', '#ffdf00'], ['circle', 15, 10, 4.6, '#002776']] },
  SGP: { h: ['#ef3340', '#ffffff'], marks: [['crescent', 6, 5, 3, '#ffffff', '#ef3340']] },
  FIN: nordic('#ffffff', '#002f6c'),
  SWE: nordic('#006aa7', '#fecc02'),
  DNK: nordic('#c8102e', '#ffffff'),
  NOR: nordic('#ba0c2f', '#ffffff', '#00205b'),
  ISL: nordic('#02529c', '#ffffff', '#dc1e35'),
  CHE: { h: ['#da291c'], marks: [['rect', 12.6, 4.5, 4.8, 11, '#ffffff'], ['rect', 9.5, 7.6, 11, 4.8, '#ffffff']] },
  QAT: { h: ['#8a1538'], marks: [['poly', '0,0 9,0 11,1.1 9,2.2 11,3.3 9,4.4 11,5.5 9,6.6 11,7.7 9,8.8 11,10 9,11.1 11,12.2 9,13.3 11,14.4 9,15.5 11,16.6 9,17.7 11,18.8 9,20 0,20', '#ffffff']] },
  KWT: { h: ['#007a3d', '#ffffff', '#ce1126'], marks: [['poly', '0,0 7,6.7 7,13.3 0,20', '#000000']] },
  ZAF: { h: ['#e03c31', '#ffffff', '#001489'], marks: [['poly', '0,0 4,0 14,8 30,8 30,12 14,12 4,20 0,20', '#ffffff'], ['poly', '0,1.5 2,1.5 13,9.2 30,9.2 30,10.8 13,10.8 2,18.5 0,18.5', '#007749'], ['poly', '0,3.4 9,10 0,16.6', '#000000']] },
};

function star(x: number, y: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.4 : r;
    pts.push(`${(x + rr * Math.cos(a)).toFixed(2)},${(y + rr * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

function draw(m: Mark, i: number): ReactElement {
  switch (m[0]) {
    case 'rect': return <rect key={i} x={m[1]} y={m[2]} width={m[3]} height={m[4]} fill={m[5]} />;
    case 'circle': return <circle key={i} cx={m[1]} cy={m[2]} r={m[3]} fill={m[4]} />;
    case 'star': return <polygon key={i} points={star(m[1], m[2], m[3])} fill={m[4]} />;
    case 'poly': return <polygon key={i} points={m[1]} fill={m[2]} />;
    case 'outline': return <polygon key={i} points={m[1]} fill="none" stroke={m[2]} strokeWidth={0.9} />;
    case 'path': return <path key={i} d={m[1]} fill={m[2]} />;
    case 'cross': return <g key={i} fill={m[4]}><rect x={m[1] - m[3] / 2} y={0} width={m[3]} height={20} /><rect x={0} y={m[2] - m[3] / 2} width={30} height={m[3]} /></g>;
    case 'saltire': return <path key={i} d="M0 0 L30 20 M30 0 L0 20" stroke={m[2]} strokeWidth={m[1]} />;
    case 'crescent': return <g key={i}><circle cx={m[1]} cy={m[2]} r={m[3]} fill={m[4]} /><circle cx={m[1] + m[3] * 0.32} cy={m[2]} r={m[3] * 0.8} fill={m[5]} /></g>;
  }
}

function bands(s: Spec): ReactElement[] {
  const list = s.h ?? s.v ?? [];
  const w = s.w ?? list.map(() => 1);
  const total = w.reduce((a, b) => a + b, 0);
  let at = 0;
  return list.map((c, i) => {
    const from = at;
    at += w[i];
    return s.v
      ? <rect key={`b${i}`} x={(30 * from) / total} y={0} width={(30 * w[i]) / total + 0.05} height={20} fill={c} />
      : <rect key={`b${i}`} x={0} y={(20 * from) / total} width={30} height={(20 * w[i]) / total + 0.05} fill={c} />;
  });
}

export const hasFlag = (id: string) => Object.hasOwn(FLAGS, id);

export function Flag({ id, name, width = 38, className }: { id: string; name: string; width?: number; className?: string }) {
  const spec = FLAGS[id];
  const height = Math.round((width * 2) / 3);
  return (
    <svg width={width} height={height} viewBox="0 0 30 20" role="img" aria-label={`Flag of ${name}`} className={className} preserveAspectRatio="none">
      {spec ? <>{bands(spec)}{spec.marks?.map(draw)}</>
        : <><rect x="0" y="0" width="30" height="20" fill="#14263c" /><text x="15" y="13.4" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="8" fontWeight="600" fill="#cfe6ff">{id}</text></>}
      <rect x="0.25" y="0.25" width="29.5" height="19.5" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.5" />
    </svg>
  );
}
