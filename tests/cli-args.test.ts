import { describe, expect, it } from 'vitest';
import { CliError, parseArgs } from '../src/cli/args';

describe('cli arguments', () => {
  it('defaults to the ww3-2027 scenario for 30 days, seed 1', () => {
    expect(parseArgs([])).toMatchObject({ scenario: 'ww3-2027', days: 30, seed: 1, quiet: false, list: false });
  });
  it('reads every flag', () => {
    expect(parseArgs(['--scenario', 'peace-2027', '--days', '0', '--seed', '7', '--quiet', '--save', 'a.json'])).toMatchObject({ scenario: 'peace-2027', days: 0, seed: 7, quiet: true, save: 'a.json' });
    expect(parseArgs(['--resume', 'a.json', '--days', '2']).resume).toBe('a.json');
  });
  it.each([
    [['--days', 'abc'], '--days needs a whole number'],
    [['--days', '-3'], '--days must be a whole number of at least 0'],
    [['--days', '1.5'], '--days needs a whole number'],
    [['--days'], '--days needs a value'],
    [['--days', '--quiet'], '--days needs a value'],
    [['--seed', 'xyz'], '--seed needs a whole number'],
    [['--day', '2'], 'unknown flag --day'],
    [['stray'], 'unexpected argument'],
    [['--scenario', 'nope'], 'unknown scenario "nope"'],
    [['--resume', 'a.json', '--scenario', 'peace-2027'], 'drop --scenario'],
  ])('rejects %j', (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(CliError);
    expect(() => parseArgs(argv)).toThrow(message);
  });
});
