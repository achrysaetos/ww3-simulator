import type { Munition, MunitionId, Platform, PlatformId } from './types';

/** Read-only lookup over every platform and munition in the simulation. */
export class Catalog {
  readonly platforms = new Map<PlatformId, Platform>();
  readonly munitions = new Map<MunitionId, Munition>();

  constructor(platforms: readonly Platform[], munitions: readonly Munition[]) {
    for (const p of platforms) {
      if (this.platforms.has(p.id)) throw new Error(`duplicate platform ${p.id}`);
      this.platforms.set(p.id, p);
    }
    for (const m of munitions) {
      if (this.munitions.has(m.id)) throw new Error(`duplicate munition ${m.id}`);
      this.munitions.set(m.id, m);
    }
    for (const p of platforms)
      for (const l of p.loadout)
        if (!this.munitions.has(l.munition)) throw new Error(`${p.id} loads unknown munition ${l.munition}`);
  }

  platform(id: PlatformId): Platform {
    const p = this.platforms.get(id);
    if (!p) throw new Error(`unknown platform ${id}`);
    return p;
  }

  munition(id: MunitionId): Munition {
    const m = this.munitions.get(id);
    if (!m) throw new Error(`unknown munition ${id}`);
    return m;
  }
}
