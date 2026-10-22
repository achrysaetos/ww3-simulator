import { describe, expect, it } from 'vitest';
import type { NationId } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { frontStat } from '../src/ui/map/TopBar';

describe('the top bar front figure, ww3-2027 as Russia', () => {
  it('does not read green for a week of ground gained while whole divisions are lost', () => {
    const s = createSession('ww3-2027', 1);
    const RUS = 'RUS' as NationId;
    s.world.nations[RUS].controlledBy = 'human';
    const held = () => s.world.control.filter((c) => c === RUS).length;
    const lost = () => Object.values(s.world.formations).filter((f) => f.nation === RUS && f.status === 'destroyed').length;
    // The first week of the war's first two months in which Russia gains ground and loses divisions: which week that is
    // moves with any change upstream, the front figure's reading of it must not.
    let cells = 0, gone = 0;
    s.engine.run(s.world, 12);
    for (let week = 0; week < 8 && !(cells > 0 && gone > 2); week++) {
      const [held0, lost0] = [held(), lost()];
      s.engine.run(s.world, 28);
      [cells, gone] = [held() - held0, lost() - lost0];
    }
    expect(cells).toBeGreaterThan(0);
    expect(gone).toBeGreaterThan(2);
    const stat = frontStat(cells, gone);
    expect(stat.tone).toBe('bad');
    expect(stat.value).toBe(`+${cells} cells · ${gone} lost`);
    expect(frontStat(cells, 0).tone).toBe('good');
  }, 600_000);
});
