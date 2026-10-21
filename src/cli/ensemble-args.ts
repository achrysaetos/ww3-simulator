import { SCENARIOS } from '../scenarios';
import { CliError } from './args';

export interface EnsembleArgs {
  scenario: string;
  days: number;
  /** lhs: runs; oat: levels per param. */
  runs: number;
  seeds: number[];
  sweep: string[] | 'tagged';
  method: 'lhs' | 'oat';
  workers?: number;
  /** Metric specs; absent = the scenario's defaults. */
  metrics?: string[];
  json: boolean;
}

const VALUE_FLAGS = new Set(['scenario', 'days', 'runs', 'seeds', 'sweep', 'method', 'workers', 'metrics']);
const BOOL_FLAGS = new Set(['json']);

function whole(flag: string, raw: string, min: number): number {
  const n = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n < min) throw new CliError(`--${flag} must be a whole number of at least ${min}, got "${raw}"`);
  return n;
}

const list = (raw: string) => raw.split(',').map((s) => s.trim()).filter(Boolean);

/** Parses `npm run ensemble` argv (without node and script). */
export function parseEnsembleArgs(argv: string[]): EnsembleArgs {
  const raw = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i].startsWith('--') ? argv[i].slice(2) : undefined;
    if (flag && BOOL_FLAGS.has(flag)) raw.set(flag, 'true');
    else if (flag && VALUE_FLAGS.has(flag)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new CliError(`--${flag} needs a value`);
      raw.set(flag, v);
    } else throw new CliError(`unexpected argument "${argv[i]}"; flags are ${[...VALUE_FLAGS, ...BOOL_FLAGS].map((f) => `--${f}`).join(' ')}`);
  }
  const scenario = raw.get('scenario') ?? 'ukraine-2026';
  if (!SCENARIOS.some((s) => s.id === scenario)) throw new CliError(`unknown scenario "${scenario}"; try ${SCENARIOS.map((s) => s.id).join(', ')}`);
  const method = raw.get('method') ?? 'lhs';
  if (method !== 'lhs' && method !== 'oat') throw new CliError(`--method is lhs or oat, got "${method}"`);
  const sweep = raw.get('sweep') ?? 'tagged';
  return {
    scenario,
    days: raw.has('days') ? whole('days', raw.get('days')!, 1) : 30,
    runs: raw.has('runs') ? whole('runs', raw.get('runs')!, method === 'oat' ? 2 : 1) : method === 'oat' ? 3 : 16,
    seeds: raw.has('seeds') ? list(raw.get('seeds')!).map((s) => whole('seeds', s, 0)) : [1, 2, 3, 4],
    sweep: sweep === 'tagged' ? 'tagged' : list(sweep),
    method,
    workers: raw.has('workers') ? whole('workers', raw.get('workers')!, 0) : undefined,
    metrics: raw.has('metrics') ? list(raw.get('metrics')!) : undefined,
    json: raw.has('json'),
  };
}
