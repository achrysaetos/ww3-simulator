import type { PriorityEffect } from '../../systems/logistics';
import { fmtNum } from '../widgets';
import type { PillWords } from './Pill';

const days = (tons: number, perDay: number) => {
  const d = tons / perDay;
  return d < 1 ? 'under a day' : `${d.toFixed(d < 10 ? 1 : 0)} days`;
};
const units = (n: number) => `${n} unit${n === 1 ? '' : 's'}`;

/** The supply drag's pill over a cell: undefined while the staff works it out, null when the player does not hold it. */
export function supplyWords(e: PriorityEffect | null | undefined, place: string): PillWords {
  const kicker = `Supply priority · ${place}`;
  if (e === undefined) return { kicker, primary: 'Reading the supply lines…', tone: 'wait' };
  if (e === null) return { kicker, primary: 'Only ground you hold can have supply priority', tone: 'refused' };
  const gain = e.after - e.before;
  if (!e.here) return { kicker, primary: 'None of your units is near here', tone: 'even' };
  if (e.short < 1) return { kicker, primary: 'Units here are full: nothing to send', tone: 'even' };
  if (gain < 1) return { kicker, primary: 'No lift to spare elsewhere', secondary: 'Your other units are cut off or there are none', tone: 'even' };
  const lift = `+${fmtNum(gain)} t a day to ${units(e.here)} here · ${Math.round(e.restCut * 100)}% less lift for ${units(e.rest)} elsewhere`;
  if (e.short <= e.before) return { kicker, primary: 'Units here refill within a day already', secondary: lift, tone: 'even' };
  if (e.after < e.before * 1.25) return { kicker, primary: 'Little to gain: units here take what they can', secondary: lift, tone: 'even' };
  return {
    kicker,
    primary: `Refilled in ${days(e.short, e.after)}, not ${days(e.short, e.before)}`,
    secondary: lift,
    tone: 'good',
  };
}
