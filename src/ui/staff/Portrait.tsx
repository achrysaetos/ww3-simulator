import { useId } from 'react';
import type { Advisor } from './advisors';

/** An illustrated bust in a gold ring (KIT.md advisor portrait), varied by the advisor's look. */
export function Portrait({ advisor, size = 40 }: { advisor: Advisor; size?: number }) {
  const clip = useId();
  const { skin, hair, coat, cap } = advisor.look;
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label={`${advisor.name}, ${advisor.title}`} className="ww-portrait">
      <circle cx="22" cy="22" r="21" fill="#0e1826" stroke="#ffb547" strokeWidth="1.5" />
      <clipPath id={clip}><circle cx="22" cy="22" r="20" /></clipPath>
      <g clipPath={`url(#${clip})`}>
        <path d="M6 46 C8 33 15 29 22 29 C29 29 36 33 38 46 Z" fill={coat} />
        {cap ? <path d="M17 30 L22 36 L27 30 Z" fill="#c9b27a" /> : <><path d="M18.5 29.5 L22 35 L25.5 29.5 Z" fill="#e8eef6" /><path d="M21.2 31 L22.8 31 L23.3 37 L22 38.5 L20.7 37 Z" fill="#7a2a34" /></>}
        <circle cx="22" cy="19" r="7.5" fill={skin} />
        {cap ? (
          <>
            <path d="M13.5 16 C14 9 30 9 30.5 16 L31 14 C30 6 14 6 13 14 Z" fill={coat} />
            <rect x="12.5" y="13.5" width="19" height="3" rx="1.2" fill={coat} />
            <rect x="20.5" y="9.5" width="3" height="2.4" rx="0.6" fill="#ffb547" />
          </>
        ) : (
          <path d="M14.4 18 C14 10.5 19 9.6 22 9.6 C25 9.6 30 10.5 29.6 18 C28.6 14.6 26 13.6 22 13.4 C18 13.6 15.4 14.6 14.4 18 Z" fill={hair} />
        )}
      </g>
    </svg>
  );
}
