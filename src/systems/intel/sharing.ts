/**
 * Who passes which intelligence to whom. Treaty allies pool every fix (NATO, the US-Japan and
 * US-ROK alliances run shared pictures). Co-belligerents without a treaty fight side by side and
 * pass what their troops on a shared front see, not what their satellites and ISR aircraft
 * collect: there is no evidence of fused Russian, Iranian and North Korean targeting data. A
 * supporting power that is not in the war can still feed a belligerent its collection, as the US
 * and UK have fed Ukraine since 2022.
 */
import { defineParam } from '../../core/params';
import type { IntelSource } from '.';

/** Sources a co-belligerent outside any shared treaty passes on: front-line liaison only. */
export const LIAISON_SOURCES: ReadonlySet<IntelSource> = new Set(['contact', 'territory']);

export interface IntelSupport {
  from: string;
  to: string;
  sources: readonly IntelSource[];
  source: string;
}

export const INTEL_SUPPORT: readonly IntelSupport[] = [
  { from: 'USA', to: 'UKR', sources: ['satellite', 'airborne', 'naval'], source: 'US satellite and ISR sharing with Ukraine since 2022 (NYT, WaPo); paused 5-12 March 2025 (Reuters)' },
  { from: 'GBR', to: 'UKR', sources: ['airborne', 'naval'], source: 'RAF RC-135W and Poseidon flights over the Black Sea feeding Ukraine (UK MoD, 2022-25)' },
];

/**
 * Share of a supporting power's fixes that reach the recipient: 1 is the 2022-25 norm, 0 the
 * March 2025 US pause. A lever on the scenario, not on how war works.
 */
export const SUPPORT_SHARE = defineParam({
  id: 'intel.SUPPORT_SHARE', value: 1, range: [0, 1], tag: 'scenario',
  source: 'US-Ukraine sharing 2022-25, paused a week in March 2025 (Reuters)',
  affects: 'satellite and ISR fixes a non-belligerent supporter passes to a belligerent',
});

/**
 * Commercial imaging satellites a nation can task, as equivalent military reconnaissance
 * satellites: Ukraine has bought ICEYE SAR and Maxar, Planet and Capella imagery since 2022
 * (ICEYE, Aug 2022; Maxar). Judgment: about half the fix rate of a 20-satellite military
 * constellation, since tasking competes with other customers and imagery arrives hours late.
 */
export const COMMERCIAL_IMAGERY: Readonly<Record<string, number>> = { UKR: 10 };

const supportBy = new Map<string, Set<IntelSource>>();
const supportersTo = new Map<string, string[]>();
for (const s of INTEL_SUPPORT) {
  supportBy.set(`${s.from}|${s.to}`, new Set(s.sources));
  (supportersTo.get(s.to) ?? supportersTo.set(s.to, []).get(s.to)!).push(s.from);
}

/** Sources `from` passes to `to` while not fighting beside it, if any. */
export function supportSources(from: string, to: string): ReadonlySet<IntelSource> | undefined {
  return supportBy.get(`${from}|${to}`);
}

/** Nations that pass collection to `to` while not fighting beside it. */
export function supportersOf(to: string): readonly string[] {
  return supportersTo.get(to) ?? [];
}
