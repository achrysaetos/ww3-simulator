import { useSyncExternalStore } from 'react';
import type { Command, NationId } from '../../core/types';
import type { SimClient } from '../client';
import { PillCard } from '../drag/Pill';
import { FlagRow, PeaceGauge } from '../diplomacy/Diplomacy';
import { flagRow, peaceNeedle, type FlagContext } from '../diplomacy/flags';
import { useFlagDrag } from '../diplomacy/useFlagDrag';
import { TopBar, type TopBarProps } from './TopBar';

type Props = Omit<TopBarProps, 'date' | 'day' | 'grip' | 'row' | 'gauges'> & {
  client: SimClient;
  /** Send a command; `label` is what the toast says was done. */
  onCommand(c: Command, label: string): void;
};

/** The top bar on the game clock's time, which re-renders each game hour without re-rendering the game around it. */
export function LiveTopBar({ client, onCommand, ...p }: Props) {
  const hour = useSyncExternalStore(client.subscribeClock, client.shownHour);
  const { state, clock, meta } = client;
  const date = state.date && clock ? new Date(Date.parse(state.date) + (hour - state.tick * clock.dtHours) * 3_600_000) : null;
  const day = date && meta ? Math.max(0, Math.floor((date.getTime() - Date.parse(meta.scenario.startDate)) / 864e5)) : 0;
  const detail = state.focusNation?.id === p.nation.id ? state.focusNation : undefined;
  const ctx: FlagContext = {
    name: (n: NationId) => client.namer.nation(n),
    dayOf: (tick) => (meta ? Math.floor((tick * meta.dtHours) / 24) : 0),
  };
  const row = detail ? flagRow(detail, state.nations) : [];
  const drag = useFlagDrag({ detail, row, ctx, onCommand });
  const v = drag.view;
  return (
    <>
      <TopBar
        {...p}
        date={date}
        day={day}
        grip={drag.grip}
        row={detail && <FlagRow row={row} detail={detail} name={ctx.name} over={v?.over?.nation ?? null} dragging={drag.dragging} />}
        gauges={detail && <PeaceGauge needle={peaceNeedle(detail, ctx)} name={ctx.name} />}
      />
      {v && (
        <PillCard
          fixed
          x={v.x}
          y={v.y}
          width={window.innerWidth}
          height={window.innerHeight}
          words={v.aim?.words ?? { kicker: 'Diplomacy', primary: 'Drop on a nation’s flag', tone: 'wait' }}
        />
      )}
    </>
  );
}
