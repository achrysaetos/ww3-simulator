import { describe, expect, it } from 'vitest';
import { frontStat } from '../src/ui/map/TopBar';

describe('the top bar front figure', () => {
  it('does not read green for a week of ground gained while whole divisions are lost', () => {
    expect(frontStat(4, 3)).toEqual({ label: 'Front · 7d', value: '+4 cells · 3 lost', tone: 'bad' });
    expect(frontStat(4, 1).tone).toBe('warn');
    expect(frontStat(4, 0)).toEqual({ label: 'Front · 7d', value: '+4 cells', tone: 'good' });
  });

  it('reads ground lost as bad and a quiet week as holding', () => {
    expect(frontStat(-2, 0)).toEqual({ label: 'Front · 7d', value: '-2 cells', tone: 'bad' });
    expect(frontStat(0, 0)).toEqual({ label: 'Front · 7d', value: 'Holding' });
    expect(frontStat(null, 0).value).toBe('Holding');
  });
});
