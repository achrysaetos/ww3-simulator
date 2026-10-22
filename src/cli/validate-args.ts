import { BANDS, CASES } from '../validation/cases';
import { CliError } from './args';

export interface ValidateArgs {
  cases: string[];
  runs: number;
  seeds: number[];
  /** tagged: a Latin hypercube over every estimated, judgment and contested param; none: seeds only. */
  sweep: 'tagged' | 'none';
  workers?: number;
  json: boolean;
}

const VALUE_FLAGS = new Set(['cases', 'runs', 'seeds', 'sweep', 'workers']);
const BOOL_FLAGS = new Set(['json']);

function whole(flag: string, raw: string, min: number): number {
  const n = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n < min) throw new CliError(`--${flag} must be a whole number of at least ${min}, got "${raw}"`);
  return n;
}

const list = (raw: string) => raw.split(',').map((s) => s.trim()).filter(Boolean);

/** Parses `npm run validate` argv (without node and script). */
export function parseValidateArgs(argv: string[]): ValidateArgs {
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
  const cases = raw.has('cases') ? list(raw.get('cases')!) : CASES.map((c) => c.id);
  const known = [...CASES, ...BANDS].map((c) => c.id);
  const unknown = cases.filter((id) => !known.includes(id));
  if (unknown.length) throw new CliError(`unknown case ${unknown.join(', ')}; try ${known.join(', ')}`);
  const sweep = raw.get('sweep') ?? 'tagged';
  if (sweep !== 'tagged' && sweep !== 'none') throw new CliError(`--sweep is tagged or none, got "${sweep}"`);
  return {
    cases,
    runs: raw.has('runs') ? whole('runs', raw.get('runs')!, 1) : 8,
    seeds: raw.has('seeds') ? list(raw.get('seeds')!).map((s) => whole('seeds', s, 0)) : [1, 2, 3, 4],
    sweep,
    workers: raw.has('workers') ? whole('workers', raw.get('workers')!, 0) : undefined,
    json: raw.has('json'),
  };
}
