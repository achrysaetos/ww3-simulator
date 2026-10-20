import type { System } from '../core/engine';

/**
 * Tick order. Commands are applied first (by whichever system owns each type),
 * then every system steps in this order. Order matters: air control is settled
 * before ground combat reads it, combat before logistics refills, and AI last so
 * its orders are queued for the next tick.
 */
export const SYSTEMS: System[] = [];
