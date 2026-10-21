import type { Command, NationId } from '../core/types';
import type { SimClient } from './client';
import { treatyName } from './events';
import type { NationDetail } from './snapshot';

interface Props {
  client: SimClient;
  d: NationDetail;
  onCommand(c: Command, label: string): void;
}

/**
 * Decisions only the player can take, waiting with a deadline: treaty calls to go to war, and
 * peace offers from enemies. Shown over the map until answered.
 */
export function Decisions({ client, d, onCommand }: Props) {
  const name = (id: NationId) => client.namer.nation(id);
  const dt = client.meta?.dtHours ?? 6;
  const tick = client.state.tick;
  const delegated = d.authority.ai.strategic;
  const offers = d.peaceOffers.filter((o) => o.to === d.id);
  if (!d.treatyCalls.length && !offers.length) return null;
  const left = (due: number) => {
    const h = Math.max(0, (due - tick) * dt);
    return h >= 24 ? `${Math.round(h / 24)} days` : `${h} hours`;
  };
  return (
    <div className="decisions" data-testid="decisions">
      {d.treatyCalls.map((c) => (
        <div key={`${c.war}|${c.treaty}`} className="decision treaty" data-testid="treaty-call">
          <div className="decision-head">Treaty call · decide within {left(c.dueTick)}</div>
          <p>
            {name(c.aggressor)} is at war with {name(c.victim)}. Under the {treatyName(c.treaty)}, {name(c.victim)} calls on {name(d.id)} to fight{c.reconsidered ? ' (asked again after your earlier refusal)' : ''}.
          </p>
          <p className="muted small">
            Joining means war with {name(c.aggressor)} and its allies. If you do not answer in time, {delegated ? 'your AI delegate decides, as you have delegated strategic decisions' : 'you stand aside, since strategic decisions are yours'}.
          </p>
          <div className="row gap">
            <button className="danger" onClick={() => onCommand({ type: 'answer_treaty', nation: d.id, war: c.war, treaty: c.treaty, join: true }, `${name(d.id)} enters the war in defence of ${name(c.victim)}`)} data-testid="treaty-join">Go to war</button>
            <button onClick={() => onCommand({ type: 'answer_treaty', nation: d.id, war: c.war, treaty: c.treaty, join: false }, `${name(d.id)} stands aside`)} data-testid="treaty-decline">Stand aside</button>
          </div>
        </div>
      ))}
      {offers.map((o) => (
        <div key={o.from} className="decision peace" data-testid="peace-offer">
          <div className="decision-head">Peace offer</div>
          <p>{name(o.from)} offers an armistice on current lines.</p>
          <div className="row gap">
            <button onClick={() => onCommand({ type: 'offer_peace', nation: d.id, target: o.from }, `Peace accepted with ${name(o.from)}`)} data-testid="peace-accept">Accept</button>
          </div>
          <p className="muted small">Ignore it to fight on; the offer stays open.</p>
        </div>
      ))}
    </div>
  );
}
