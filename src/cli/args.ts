import { SCENARIOS } from '../scenarios';

export interface CliArgs {
  list: boolean;
  quiet: boolean;
  /** Print the after-action report (war cost, production race, workarounds) at the end. */
  report: boolean;
  days: number;
  seed: number;
  scenario: string;
  resume?: string;
  save?: string;
}

const VALUE_FLAGS = new Set(['days', 'seed', 'scenario', 'resume', 'save']);
const BOOL_FLAGS = new Set(['list', 'quiet', 'report']);

export class CliError extends Error {}

function integer(flag: string, raw: string | undefined, min: number): number {
  if (raw === undefined || !/^-?\d+$/.test(raw)) throw new CliError(`--${flag} needs a whole number, got ${raw === undefined ? 'nothing' : `"${raw}"`}`);
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < min) throw new CliError(`--${flag} must be a whole number of at least ${min}, got ${raw}`);
  return n;
}

/** Parses argv (without node and script) once, so the run never starts on input it cannot honour. */
export function parseArgs(argv: string[]): CliArgs {
  const raw = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new CliError(`unexpected argument "${a}"`);
    const flag = a.slice(2);
    if (BOOL_FLAGS.has(flag)) raw.set(flag, 'true');
    else if (VALUE_FLAGS.has(flag)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new CliError(`--${flag} needs a value`);
      raw.set(flag, v);
      i++;
    } else throw new CliError(`unknown flag --${flag}; flags are ${[...VALUE_FLAGS, ...BOOL_FLAGS].map((f) => `--${f}`).join(' ')}`);
  }
  const scenario = raw.get('scenario') ?? 'ww3-2027';
  if (!raw.has('resume') && !raw.has('list') && !SCENARIOS.some((s) => s.id === scenario))
    throw new CliError(`unknown scenario "${scenario}"; try ${SCENARIOS.map((s) => s.id).join(', ')}`);
  if (raw.has('resume') && raw.has('scenario')) throw new CliError('--resume takes the scenario from the save; drop --scenario');
  return {
    list: raw.has('list'),
    quiet: raw.has('quiet'),
    report: raw.has('report'),
    days: raw.has('days') ? integer('days', raw.get('days'), 0) : 30,
    seed: raw.has('seed') ? integer('seed', raw.get('seed'), 0) : 1,
    scenario,
    resume: raw.get('resume'),
    save: raw.get('save'),
  };
}
