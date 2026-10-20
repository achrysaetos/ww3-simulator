const RATE_WINDOW_MS = 3_000;

/**
 * Runs the engine one tick at a time toward a target rate. Each tick ends in a
 * snapshot the UI must ack before the next tick starts, so a slow engine or a
 * slow UI lowers the achieved rate instead of building a queue. Between ticks
 * the worker yields, so orders and focus changes land between steps.
 */
export class Pacer {
  private ticksPerSec = 0;
  private awaitingAck = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastStart = -Infinity;
  private readonly finished: number[] = [];
  /** Wall time of the latest tick. */
  stepMs = 0;

  constructor(private readonly runTick: () => void, private readonly now: () => number = () => performance.now()) {}

  /** Ticks completed per second over the last few seconds while running; 0 when paused. */
  get achievedTps(): number {
    if (!this.ticksPerSec) return 0;
    const now = this.now(), f = this.finished;
    while (f.length && now - f[0] > RATE_WINDOW_MS) f.shift();
    return f.length < 2 ? 0 : (f.length - 1) / ((f[f.length - 1] - f[0]) / 1000);
  }

  setSpeed(ticksPerSec: number) {
    this.ticksPerSec = ticksPerSec;
    this.finished.length = 0;
    this.schedule();
  }

  /** A snapshot went out; hold further ticks until it is acked. */
  sent() {
    this.awaitingAck = true;
  }

  ack() {
    this.awaitingAck = false;
    this.schedule();
  }

  /** One tick on demand, only while paused and with nothing in flight. */
  step() {
    if (!this.ticksPerSec && !this.awaitingAck) this.tick();
  }

  stop() {
    this.ticksPerSec = 0;
    clearTimeout(this.timer);
  }

  private tick() {
    this.lastStart = this.now();
    this.runTick();
    const end = this.now();
    this.stepMs = end - this.lastStart;
    this.finished.push(end);
  }

  private schedule() {
    clearTimeout(this.timer);
    if (!this.ticksPerSec || this.awaitingAck) return;
    this.timer = setTimeout(() => this.tick(), Math.max(0, this.lastStart + 1000 / this.ticksPerSec - this.now()));
  }
}
