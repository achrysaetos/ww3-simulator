/**
 * Pure nuclear-weapon effects. Distances in km, yields in kt, doses in rad.
 *
 * Blast scaling follows Glasstone & Dolan, "The Effects of Nuclear Weapons" (1977), cube-root scaling from 1 kt.
 * At 1 kt the 5 psi ground range is ~0.71 km for an optimum-height air burst and ~0.54 km for a surface burst
 * (G&D fig. 3.73-3.74). NUKEMAP reproduces these within ~10% (e.g. 300 kt air burst: 5 psi at ~4.7 km).
 */
import type { Burst } from './state';

const R5_PER_KT13: Record<Exclude<Burst, 'high_altitude'>, number> = { air: 0.71, ground: 0.54 };

/**
 * Ground range of a given peak overpressure. Between ~1 and ~2000 psi the G&D curves fit r ~ psi^-0.4 within ~20%;
 * this reproduces the Tsipis hard-target lethal radius (300 kt, 2000 psi: ~0.25 km) from the 5 psi anchor.
 * High overpressures need a surface burst, so above 20 psi an air burst uses the surface curve.
 */
export function overpressureRadiusKm(yieldKt: number, psi: number, burst: Burst): number {
  if (burst === 'high_altitude') return 0;
  const curve = burst === 'air' && psi <= 20 ? 'air' : 'ground';
  return R5_PER_KT13[curve] * Math.cbrt(yieldKt) * (5 / psi) ** 0.4;
}

/** Third-degree burn radius, 0.67 Y^0.41 km for a clear-day air burst (NUKEMAP fit to G&D ch. 7); a surface burst loses ~20%. */
export function thermalRadiusKm(yieldKt: number, burst: Burst): number {
  if (burst === 'high_altitude') return 0;
  return 0.67 * yieldKt ** 0.41 * (burst === 'ground' ? 0.8 : 1);
}

/**
 * Fatality fraction by zone. Blast bands from OTA, "The Effects of Nuclear War" (1979) p. 19: >12 psi 98%,
 * 5-12 psi 50%, 2-5 psi 5%. Flash burns add 20% inside the third-degree radius beyond 5 psi: roughly the share of
 * people outdoors or behind windows, few of whom survive without burn care in a mass-casualty event (estimate).
 */
export function fatalityZones(yieldKt: number, burst: Burst): { outerKm: number; fraction: number }[] {
  const r12 = overpressureRadiusKm(yieldKt, 12, burst);
  const r5 = overpressureRadiusKm(yieldKt, 5, burst);
  const r2 = overpressureRadiusKm(yieldKt, 2, burst);
  const th = thermalRadiusKm(yieldKt, burst);
  const edges = [...new Set([r12, r5, r2, th])].sort((a, b) => a - b);
  const at = (r: number) => (r <= r12 ? 0.98 : r <= r5 ? 0.5 : (r <= r2 ? 0.05 : 0) + (r <= th ? 0.2 : 0));
  return edges.map((outerKm) => ({ outerKm, fraction: at(outerKm) }));
}

/** Deaths from blast and fire, given how many people live within each radius of ground zero. */
export function blastFatalities(yieldKt: number, burst: Burst, popWithin: (rKm: number) => number): number {
  let dead = 0, innerPop = 0;
  for (const z of fatalityZones(yieldKt, burst)) {
    const p = popWithin(z.outerKm);
    dead += z.fraction * (p - innerPop);
    innerPop = p;
  }
  return dead;
}

/**
 * People within r of a city centre under Clark's exponential density law, D(r) = D0 e^(-r/b). The central density
 * D0 rises with city size (Bertaud & Malpezzi 2014 density gradients: ~3-4k/km^2 for small cities, 15-25k for
 * megacities); the fit below is an estimate.
 */
export function cityPopWithin(cityPop: number, rKm: number): number {
  if (cityPop <= 0) return 0;
  const d0 = Math.min(20_000, Math.max(2_000, 2_500 * (cityPop / 1e5) ** 0.35));
  const b = Math.sqrt(cityPop / (2 * Math.PI * d0));
  const x = rKm / b;
  return cityPop * (1 - (1 + x) * Math.exp(-x));
}

/** Single-shot kill probability against a point target: 1 - 0.5^((LR/CEP)^2). */
export function sspk(yieldKt: number, hardnessPsi: number, cepM: number, burst: Burst): number {
  const lr = overpressureRadiusKm(yieldKt, hardnessPsi, burst) * 1000;
  return 1 - 0.5 ** ((lr / Math.max(1, cepM)) ** 2);
}

// ---------------------------------------------------------------- fallout

/**
 * Fission products of 1 kt spread evenly over 1 square mile give ~2,900 rad/h at H+1 (G&D para. 9.159), i.e.
 * ~7,500 rad/h per kt/km^2. A surface burst drops ~60% of its activity as local fallout (G&D 9.50); fission is
 * ~50% of a modern thermonuclear yield.
 */
const RAD_PER_KT_KM2 = 7_500;
const LOCAL_FALLOUT = 0.6;
const FISSION_FRACTION = 0.5;
/** Share of local fallout deposited in ground zero's cell and the next cells downwind (a 15 mph wind crosses a 1-degree cell in ~4 h). */
export const PLUME_SHARES = [0.4, 0.3, 0.2, 0.1] as const;

/** H+1 reference dose rate averaged over a cell of the given area for one plume share. */
export function falloutR1(yieldKt: number, share: number, cellAreaKm2: number): number {
  return (RAD_PER_KT_KM2 * yieldKt * FISSION_FRACTION * LOCAL_FALLOUT * share) / cellAreaKm2;
}

/** Way-Wigner decay, R(t) = R1 t^-1.2 with t in hours after detonation (G&D 9.145). */
export function falloutDoseRate(r1: number, hoursAfter: number): number {
  return r1 * Math.max(1, hoursAfter) ** -1.2;
}

/** Dose accumulated between two times after detonation: the integral of R1 t^-1.2. */
export function falloutDose(r1: number, fromHour: number, toHour: number): number {
  const a = Math.max(1, fromHour), b = Math.max(1, toHour);
  return b <= a ? 0 : 5 * r1 * (a ** -0.2 - b ** -0.2);
}

/**
 * Fallout is not even across a cell: the plume covers about a tenth of it at ten times the average. People shelter
 * in ordinary buildings with a protection factor of ~3 (G&D table 9.115). Lethality is a logistic in dose with
 * LD50 450 rad (G&D 12.108).
 */
export const PLUME_COVER = 0.1;
const PROTECTION_FACTOR = 3;
export function falloutFatalFraction(cellAverageDose: number): number {
  const d = cellAverageDose / PLUME_COVER / PROTECTION_FACTOR;
  return d <= 0 ? 0 : 1 / (1 + (450 / d) ** 4);
}

/** Military operations in a node are denied while the plume's dose rate exceeds 1 rad/h (estimate after FM 3-3-1 operational exposure guidance). */
export function falloutDeniesUse(cellAverageRate: number): boolean {
  return cellAverageRate / PLUME_COVER >= 1;
}

// ---------------------------------------------------------------- high-altitude EMP

/** Line-of-sight radius from burst height h: sqrt(2 R h). 400 km gives ~2,250 km (EMP Commission 2008). */
export function empRadiusKm(heightKm = 400): number {
  return Math.sqrt(2 * 6371 * heightKm);
}

/**
 * Share of infrastructure function lost under the E1/E3 footprint. The EMP Commission (2008, 2017) projects
 * widespread grid and electronics failure from a megaton-class burst; 30% at 1 Mt scaling with sqrt(yield) is an estimate.
 */
export function empDamage(yieldKt: number): number {
  return Math.min(0.4, 0.3 * Math.sqrt(yieldKt / 1000));
}
