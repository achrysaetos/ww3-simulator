/** Deterministic PRNG (mulberry32). State lives in World.rngState so runs replay exactly. */
export class Rng {
  constructor(public state: number) {}

  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxExclusive: number): number {
    return Math.floor(this.range(min, maxExclusive));
  }

  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.next() * xs.length)];
  }

  /** Standard normal via Box-Muller. */
  normal(mean = 0, sd = 1): number {
    const u = 1 - this.next(), v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Binomial draw; normal approximation for large n so big salvos stay cheap. */
  binomial(n: number, p: number): number {
    if (n <= 0 || p <= 0) return 0;
    if (p >= 1) return n;
    if (n > 40) return Math.max(0, Math.min(n, Math.round(this.normal(n * p, Math.sqrt(n * p * (1 - p))))));
    let k = 0;
    for (let i = 0; i < n; i++) if (this.next() < p) k++;
    return k;
  }
}
