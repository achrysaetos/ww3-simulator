/**
 * The clock the player sees. The engine steps in whole ticks of `dtHours`; this clock runs the
 * hours of the latest tick at a constant rate, from the tick before it up to it, and asks for the
 * next tick only once it gets there, holding while the worker computes it. So the shown time is
 * never past the engine and never more than one tick behind it, and a slow engine stretches the
 * hold instead of building a queue.
 */
export class GameClock {
  /** Hours since tick 0 that the player sees. */
  shown: number;
  /** The latest tick the engine delivered. */
  tick: number;
  /** Game hours per real second: 0 is paused, Infinity runs as fast as the engine steps. */
  rate = 0;
  /** The tick asked of the engine and not yet delivered: run glides into it, step jumps to it. */
  private asked: 'run' | 'step' | null = null;
  private at: number;

  constructor(readonly dtHours: number, tick: number, now: number) {
    this.tick = tick;
    this.shown = tick * dtHours;
    this.at = now;
  }

  /** How far the shown time is through the latest tick, 0 at the tick before it and 1 at it. */
  get fraction(): number {
    return Math.max(0, Math.min(1, 1 - (this.tick * this.dtHours - this.shown) / this.dtHours));
  }

  /** Run the shown time up to `now`; true when the caller should ask the engine for the next tick. */
  advance(now: number): boolean {
    this.runTo(now);
    if (!this.rate || this.asked || this.shown < this.tick * this.dtHours) return false;
    this.asked = 'run';
    return true;
  }

  /** Change speed from `now` on; the time run so far counts at the old rate. The next `advance` asks for a tick if one is due. */
  setRate(rate: number, now: number): void {
    this.runTo(now);
    this.rate = Math.max(0, rate);
  }

  /** One tick on demand while paused, shown at once when it lands; false when one is already on its way. */
  step(): boolean {
    if (this.rate || this.asked) return false;
    this.asked = 'step';
    return true;
  }

  private runTo(now: number): void {
    // Frame times can trail a performance.now() taken just before them; time never runs back.
    const ms = Math.max(0, now - this.at);
    const end = this.tick * this.dtHours;
    if (this.rate) this.shown = this.rate === Infinity ? end : Math.min(end, this.shown + (this.rate * ms) / 1000);
    this.at += ms;
  }

  /** A snapshot of `tick` landed; snapshots that repeat the latest tick (a focus change, a refusal) change nothing. */
  delivered(tick: number): boolean {
    if (tick <= this.tick) return false;
    if (this.asked === 'step') this.shown = tick * this.dtHours;
    this.tick = tick;
    this.asked = null;
    return true;
  }
}
