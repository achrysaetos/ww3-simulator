import { COMMAND_DOMAINS, type Command, type CommandDomain, type NationId } from '../../core/types';
import { DOMAIN_OF_KIND } from '../../systems/orders';
import type { FormationView } from '../snapshot';
import { COMMAND_ROLES, delegateCommands, roleOf, type Delegation } from './roles';

const ROW: Record<CommandDomain, { label: string; unit?: [string, string] }> = {
  land: { label: 'Land', unit: ['formation', 'formations'] },
  air: { label: 'Air and missiles', unit: ['wing', 'wings'] },
  naval: { label: 'Navy', unit: ['group', 'groups'] },
  homefront: { label: 'Economy and mobilisation' },
  strategic: { label: 'War, peace, nuclear' },
};

interface Props {
  me: NationId;
  ai: Delegation;
  /** Domains the player has just switched and the engine has not confirmed yet. */
  pending: Partial<Delegation>;
  formations: readonly FormationView[];
  onDelegate(commands: Command[]): void;
}

/** "Your staff runs": one click takes a domain back from the AI staff or hands it over. */
export function StaffPanel({ me, ai, pending, formations, onDelegate }: Props) {
  const want = { ...ai, ...pending };
  const role = roleOf(want);
  const count: Partial<Record<CommandDomain, number>> = {};
  for (const f of formations) if (f.entry.nation === me && f.status !== 'destroyed') count[DOMAIN_OF_KIND[f.entry.kind]] = (count[DOMAIN_OF_KIND[f.entry.kind]] ?? 0) + 1;
  return (
    <section className="ww-glass ww-panel ww-staff" aria-label="Your staff" data-testid="staff-panel">
      <div className="ww-panel-head"><span className="ww-label">Your staff runs</span><span className="ww-muted" title="Your role sets which domains your staff runs. Change any single one below.">{role ? role.name : 'Custom'}</span></div>
      <div className="ww-seg" role="group" aria-label="Your role">
        {COMMAND_ROLES.map((r) => (
          <button key={r.id} type="button" className={role?.id === r.id ? 'on' : ''} aria-pressed={role?.id === r.id} title={r.name} onClick={() => onDelegate(delegateCommands(me, want, r.ai))} data-testid={`role-${r.id}`}>{r.short}</button>
        ))}
      </div>
      <ul className="ww-staff-rows">
        {COMMAND_DOMAINS.map((k) => {
          const n = count[k] ?? 0;
          const unit = ROW[k].unit;
          const waiting = pending[k] !== undefined;
          return (
            <li key={k}>
              <span>{ROW[k].label}{unit && n > 0 && <span className="ww-muted"> · {n} {n === 1 ? unit[0] : unit[1]}</span>}</span>
              <button
                type="button"
                className={`ww-chip ${want[k] ? 'blue' : 'gold'} ${waiting ? 'waiting' : ''}`}
                onClick={() => onDelegate(delegateCommands(me, want, { ...want, [k]: !want[k] }))}
                aria-pressed={!want[k]}
                title={want[k] ? 'Your AI staff decides this. Click to take it yourself.' : 'You decide this. Click to hand it to your AI staff.'}
                data-testid={`staff-${k}`}
              >
                {want[k] ? 'AI staff' : 'You'}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
