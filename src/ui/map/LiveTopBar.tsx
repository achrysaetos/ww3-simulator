import { useSyncExternalStore } from 'react';
import type { SimClient } from '../client';
import { TopBar, type TopBarProps } from './TopBar';

/** The top bar on the game clock's time, which re-renders each game hour without re-rendering the game around it. */
export function LiveTopBar({ client, ...p }: Omit<TopBarProps, 'date' | 'day'> & { client: SimClient }) {
  const hour = useSyncExternalStore(client.subscribeClock, client.shownHour);
  const { state, clock, meta } = client;
  const date = state.date && clock ? new Date(Date.parse(state.date) + (hour - state.tick * clock.dtHours) * 3_600_000) : null;
  const day = date && meta ? Math.max(0, Math.floor((date.getTime() - Date.parse(meta.scenario.startDate)) / 864e5)) : 0;
  return <TopBar {...p} date={date} day={day} />;
}
