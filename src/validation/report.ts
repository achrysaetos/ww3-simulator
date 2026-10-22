import type { QuestionScore } from './score';
import type { ValidationCase } from './types';

function fmt(x: number): string {
  if (Number.isNaN(x)) return 'n/a';
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
  const a = Math.abs(x);
  return a >= 1000 ? Math.round(x).toLocaleString('en-US') : a >= 10 ? x.toFixed(0) : a >= 1 ? x.toFixed(1) : x.toFixed(2);
}

const range = (lo: number, hi: number) => (lo === hi ? fmt(lo) : !Number.isFinite(hi) ? `>=${fmt(lo)}` : `${fmt(lo)}-${fmt(hi)}`);

const pad = (s: string, n: number, right = false) => (right ? s.padStart(n) : s.padEnd(n));

/** Notes a reader needs next to a row: the observable was tuned on, or only a party to the war vouches for it. */
const marks = (s: QuestionScore) => (s.provenance === 'tuned-on' ? 'T' : '') + (s.combatantOnly ? 'C' : '');

/** The validation table: one row per question, case headers with provenance, then a per-case Brier summary. */
export function formatTable(cases: readonly ValidationCase[], scores: readonly QuestionScore[]): string {
  const out: string[] = [];
  const cols = ['question', 'observed', 'p10', 'p50', 'p90', 'P(obs)', 'base Brier', 'model Brier', 'beats'];
  const w = [30, 12, 9, 9, 9, 7, 11, 12, 6];
  for (const c of cases) {
    const rows = scores.filter((s) => s.caseId === c.id);
    if (!rows.length) continue;
    out.push(`\n${c.id}: ${c.name}, ${c.period} [${c.provenance}], ${rows[0].runs} runs over ${c.days} days`);
    out.push('  ' + cols.map((h, i) => pad(h, w[i], i > 0)).join(' '));
    for (const s of rows) {
      const q = `${s.question}${marks(s) ? ` [${marks(s)}]` : ''}`;
      out.push('  ' + [q, range(s.observed.lo, s.observed.hi), fmt(s.p10), fmt(s.p50), fmt(s.p90), `${Math.round(s.pModel * 100)}%`, s.baseline.brier.toFixed(3), s.model.brier.toFixed(3), s.beats ? 'yes' : 'no'].map((v, i) => pad(v, w[i], i > 0)).join(' '));
    }
    const held = rows.filter((s) => s.provenance !== 'tuned-on');
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    out.push(`  not tuned on: model beats baseline on ${held.filter((s) => s.beats).length} of ${held.length}; mean Brier model ${mean(held.map((s) => s.model.brier)).toFixed(3)} vs baseline ${mean(held.map((s) => s.baseline.brier)).toFixed(3)}`);
  }
  const held = scores.filter((s) => s.provenance !== 'tuned-on');
  out.push(`\nall cases, questions not tuned on: model beats baseline on ${held.filter((s) => s.beats).length} of ${held.length}`);
  out.push('  observed: the outcome range the sources span. p10/p50/p90: the model over the ensemble. P(obs): model chance of landing in the observed range.');
  out.push('  Brier: (1 - P(obs))^2, lower is better; the baseline (persistence unless the case says otherwise) is scored as an ensemble of the same size that always gives its point forecast.');
  out.push('  [T] this observable was tuned on, so it does not count as validation. [C] only combatant claims back the observed range.');
  return out.join('\n');
}
