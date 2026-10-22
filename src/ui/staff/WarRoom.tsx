import type { NationId } from '../../core/types';
import type { Action, Card } from './advice';
import { advisorOf } from './advisors';
import type { Sent } from './desk';
import { Portrait } from './Portrait';

interface CardProps {
  card: Card;
  me: NationId;
  /** Set once the player acted on the card. */
  sent?: Sent;
  paused: boolean;
  onAct(card: Card, action: Action): void;
  onDismiss?(key: string): void;
}

/** What became of the player's choice: waiting, in transit, done, refused, or never answered. */
export function AnswerLine({ sent, paused }: { sent: Sent; paused: boolean }) {
  const a = sent.answer;
  if (sent.silent && !a) return <div className="ww-answer silent" data-testid="card-answer"><span className="ww-chip">No answer</span><span>The staff heard nothing back.</span></div>;
  if (!a) {
    return (
      <div className="ww-answer waiting" data-testid="card-answer">
        <i className="ww-pulse" aria-hidden="true" />
        <span>{paused ? `${sent.action.label}: queued, it goes out when the clock runs` : `${sent.action.label}: sent, waiting for the answer`}</span>
      </div>
    );
  }
  const tone = !a.ok ? 'red' : a.final ? 'green' : 'blue';
  return (
    <div className={`ww-answer ${tone}`} data-testid="card-answer">
      <span className={`ww-chip ${tone}`}>{!a.ok ? 'Refused' : a.final ? 'Done' : 'In transit'}</span>
      <span>{a.text}</span>
    </div>
  );
}

const TOPIC_ICON: Record<Card['topic'], string> = {
  threat: 'M8 1 L15 14 L1 14 Z M8 6 L8 10 M8 12 L8 12.5',
  opportunity: 'M2 14 L2 2 L12 5 L2 8',
  supply: 'M3 5 L8 2 L13 5 L13 11 L8 14 L3 11 Z M3 5 L8 8 L13 5 M8 8 L8 14',
  diplomacy: 'M2 8 C2 4 5 2 8 2 C11 2 14 4 14 8 C14 12 11 14 8 14 C5 14 2 12 2 8 Z M2 8 L14 8 M8 2 C5.5 5 5.5 11 8 14 M8 2 C10.5 5 10.5 11 8 14',
  nuclear: 'M8 8 m-1.6 0 a1.6 1.6 0 1 0 3.2 0 a1.6 1.6 0 1 0 -3.2 0 M8 6 L5 1.5 A7 7 0 0 1 11 1.5 Z M6.3 9 L1.3 9 A7 7 0 0 0 4.3 14.2 Z M9.7 9 L14.7 9 A7 7 0 0 1 11.7 14.2 Z',
  command: 'M2 3 L14 3 L14 11 L8 11 L5 14 L5 11 L2 11 Z',
  news: 'M2 8 C2 4 5 2 8 2 C11 2 14 4 14 8 C14 12 11 14 8 14 C5 14 2 12 2 8 Z M2 8 L14 8 M8 2 C5.5 5 5.5 11 8 14 M8 2 C10.5 5 10.5 11 8 14',
};

export function TopicIcon({ topic }: { topic: Card['topic'] }) {
  return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="ww-topic-icon"><path d={TOPIC_ICON[topic]} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

function Buttons({ card, onAct }: Pick<CardProps, 'card' | 'onAct'>) {
  if (!card.primary && !card.secondary) return null;
  return (
    <div className="ww-card-actions">
      {card.primary && <button type="button" className="ww-btn gold small" onClick={() => onAct(card, card.primary!)} data-testid="card-primary">{card.primary.label}</button>}
      {card.secondary && <button type="button" className="ww-btn small" onClick={() => onAct(card, card.secondary!)} data-testid="card-secondary">{card.secondary.label}</button>}
    </div>
  );
}

/** One card in the War Room: who brings it, what it is, and the one button the staff recommends. */
export function StaffCard({ card, me, sent, paused, onAct, onDismiss }: CardProps) {
  if (card.tone === 'live') {
    return (
      <article className="ww-glass ww-card live" data-testid="war-card" data-key={card.key}>
        <div className="ww-card-head"><span className="ww-title">{card.title}</span><span className="ww-mono live-tag">LIVE</span></div>
        <p>{card.text}</p>
        {card.meter && <span className="ww-bar red" title={`${Math.round(card.meter.value * 100)}% shot down`}><i style={{ width: `${Math.round(card.meter.value * 100)}%` }} /></span>}
        {card.primary && <button type="button" className="ww-link" onClick={() => onAct(card, card.primary!)} data-testid="card-primary">{card.primary.label}</button>}
      </article>
    );
  }
  if (!card.role) {
    return (
      <article className="ww-glass ww-card wire" data-testid="war-card" data-key={card.key}>
        <TopicIcon topic={card.topic} />
        <span>{card.title}</span>
        {onDismiss && <button type="button" className="ww-x" aria-label="Dismiss" onClick={() => onDismiss(card.key)}>×</button>}
      </article>
    );
  }
  const who = advisorOf(me, card.role);
  return (
    <article className={`ww-glass ww-card advice ${card.tone}`} data-testid="war-card" data-key={card.key}>
      <div className="ww-card-who">
        <Portrait advisor={who} size={38} />
        <div>
          <span className="ww-card-name">{who.name}</span>
          <span className="ww-label">{who.title}</span>
        </div>
        {card.chip && !sent && <span className={`ww-chip ${card.urgent ? 'red' : 'gold'} ww-card-chip`}>{card.chip}</span>}
      </div>
      <span className="ww-card-title">{card.title}</span>
      <p>{card.text}</p>
      {sent ? <AnswerLine sent={sent} paused={paused} /> : <Buttons card={card} onAct={onAct} />}
      {sent && (sent.answer?.final || sent.silent) && onDismiss && <button type="button" className="ww-x" aria-label="Dismiss" onClick={() => onDismiss(card.key)}>×</button>}
    </article>
  );
}

interface Props {
  cards: readonly Card[];
  answered: readonly Sent[];
  me: NationId;
  paused: boolean;
  onAct(card: Card, action: Action): void;
  onDismiss(key: string): void;
}

const SHOWN = 6;

/** The right-hand feed: live alerts, then decisions still open, then the record of what the player answered. */
export function WarRoom({ cards, answered, me, paused, onAct, onDismiss }: Props) {
  const advice = cards.filter((c) => c.tone === 'advice').length;
  const alerts = cards.filter((c) => c.tone === 'live').length;
  const open = cards.map((card) => ({ card, sent: undefined as Sent | undefined }));
  const all = [...open.filter((x) => x.card.tone === 'live'), ...open.filter((x) => x.card.tone !== 'live'), ...answered.map((s) => ({ card: s.card, sent: s }))];
  const ordered = all.slice(0, SHOWN);
  const more = all.length - ordered.length;
  return (
    <section className="ww-warroom" aria-label="War room" data-testid="war-room">
      <div className="ww-warroom-head"><span className="ww-label">War room</span><span className="ww-muted">{advice ? `${advice} for you` : alerts ? `${alerts} live` : 'All quiet'}</span></div>
      <div className="ww-warroom-list">
        {ordered.map(({ card, sent }) => <StaffCard key={card.key} card={card} me={me} sent={sent} paused={paused} onAct={onAct} onDismiss={onDismiss} />)}
        {!ordered.length && <p className="ww-glass ww-card quiet">Your staff has nothing for you. The war runs on its plans.</p>}
        {more > 0 && <p className="ww-warroom-more ww-muted">{more} more in the brief and the log</p>}
      </div>
    </section>
  );
}
