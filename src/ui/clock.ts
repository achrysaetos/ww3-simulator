/** How long before the shown time reaches the latest tick the clock asks for the next, in real time: most ticks take less. */
export const LEAD_MS = 1000;

/**
 * The clock the player sees. The engine steps in whole ticks of `dtHours`; this clock runs the
 * hours of the latest applied tick at a constant rate, from the tick before it up to it. A little
 * before it gets there it asks the engine for the next tick, and holds that snapshot until the
 * shown time reaches the tick it extends, so the display glides on without waiting. If the engine
 * is late the clock holds. The shown time is never past the applied tick, and the engine is never
 * more than one tick past that while the clock runs or after it pauses. Paused, nothing new is shown.
 */
export class GameClock {
  /** Hours since tick 0 that the player sees. */
  shown: number;
  /** The latest tick applied to what the player sees. */
  tick: number;
  /** Game hours per real second: 0 is paused, Infinity runs as fast as the engine steps. */
  rate = 0;
  /** Ticks the engine delivered that are not applied yet. */
  private held = 0;
  /** A tick asked of the engine and not delivered yet. */
  private inFlight = false;
  /** Step pressed while paused: apply what the engine delivers at once. */
  private stepping = false;
  private at: number;

  constructor(readonly dtHours: number, tick: number, now: number) {
    this.tick = tick;
    this.shown = tick * dtHours;
    this.at = now;
  }

  /** How far the shown time is through the latest applied tick, 0 at the tick before it and 1 at it. */
  get fraction(): number {
    return Math.max(0, Math.min(1, 1 - (this.tick * this.dtHours - this.shown) / this.dtHours));
  }

  /**
   * Run the shown time up to `now` and say what is due: apply the next held tick, or ask the engine
   * for one. Call it until it returns null; each apply moves `tick` on by one.
   */
  advance(now: number): 'apply' | 'ask' | null {
    this.runTo(now);
    const end = this.tick * this.dtHours;
    if (this.held && (this.stepping ? !this.inFlight : this.rate && this.shown >= end)) {
      this.held--;
      this.tick++;
      if (this.stepping) {
        this.shown = this.tick * this.dtHours;
        this.stepping = this.held > 0;
      }
      return 'apply';
    }
    if (!this.rate || this.inFlight || this.held || end - this.shown > Math.min(this.dtHours, (this.rate * LEAD_MS) / 1000)) return null;
    this.inFlight = true;
    return 'ask';
  }

  /** Change speed from `now` on; the time run so far counts at the old rate. */
  setRate(rate: number, now: number): void {
    this.runTo(now);
    this.rate = Math.max(0, rate);
  }

  /**
   * One more tick on demand while paused, shown at once with anything held before it. True when the
   * engine must be asked; one already on its way serves.
   */
  step(): boolean {
    if (this.rate) return false;
    this.stepping = true;
    if (this.inFlight) return false;
    this.inFlight = true;
    return true;
  }

  /** A snapshot of `tick` landed; true when it is a new tick to hold, false when it repeats one the clock has. */
  arrived(tick: number): boolean {
    if (tick <= this.tick + this.held) return false;
    this.held++;
    this.inFlight = false;
    return true;
  }

  private runTo(now: number): void {
    // Frame times can trail a performance.now() taken just before them; time never runs back.
    const ms = Math.max(0, now - this.at);
    const end = this.tick * this.dtHours;
    if (this.rate) this.shown = this.rate === Infinity ? end : Math.min(end, this.shown + (this.rate * ms) / 1000);
    this.at += ms;
  }
}
