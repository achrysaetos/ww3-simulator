/**
 * A uniform draw in [0, 1) from (seed, tick, key) alone. Civil and political chance events use
 * it instead of the shared RNG, so adding or removing one of them never shifts another
 * system's draws, and the same world replays the same outcome.
 */
export function draw(seed: number, tick: number, key: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((tick + 0x632be5ab) | 0, 0xc2b2ae35) ^ Math.imul((key + 0x27d4eb2f) | 0, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** FNV-1a of a string, as a draw key for a nation. */
export function keyOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h | 0;
}
