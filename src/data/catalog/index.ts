/**
 * The full weapons and platforms catalog. Ids are stable snake_case strings;
 * orders of battle and scenarios reference them. `catalogIndex` is a markdown
 * table of every id, generated from the data so it never drifts.
 */
import { Catalog } from '../../core/catalog';
import type { Munition, Platform } from '../../core/types';
import { airPlatforms } from './air';
import { landPlatforms } from './land';
import { munitions } from './munitions';
import { navalPlatforms } from './naval';
import { spacePlatforms } from './space';
import { strategicPlatforms } from './strategic';
import { subsurfacePlatforms } from './subsurface';

export type { MunitionKey } from './munitions';
export { munitions };

export const platforms: Platform[] = [...landPlatforms, ...strategicPlatforms, ...airPlatforms, ...navalPlatforms, ...subsurfacePlatforms, ...spacePlatforms];

let cached: Catalog | undefined;

/** The full catalog, built once per process. */
export function loadCatalog(): Catalog {
  return (cached ??= new Catalog(platforms, munitions));
}

const producers = (p: readonly string[]) => (p.length ? p.join(' ') : '-');
const row = (cells: (string | number)[]) => `| ${cells.join(' | ')} |`;

function indexOf(ps: readonly Platform[], ms: readonly Munition[]): string {
  return [
    '# Catalog index',
    '',
    `${ps.length} platforms, ${ms.length} munitions. Producers are ISO3 codes; "-" means no nation builds it today.`,
    '',
    '## Platforms',
    '',
    row(['id', 'name', 'class', 'domain', 'producers']),
    row(['---', '---', '---', '---', '---']),
    ...ps.map((p) => row([p.id, p.name, p.class, p.domain, producers(p.producers)])),
    '',
    '## Munitions',
    '',
    row(['id', 'name', 'kind', 'producers']),
    row(['---', '---', '---', '---']),
    ...ms.map((m) => row([m.id, m.name, m.kind, producers(m.producers)])),
    '',
  ].join('\n');
}

export const catalogIndex: string = indexOf(platforms, munitions);
