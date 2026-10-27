import { useState } from 'react'
import { Link } from 'react-router-dom'
import { alpha } from '../lib/color'
import { useCard } from '../lib/queries'
import type { SeriesGroup, SetSummary } from '../lib/summaries'
import { paletteColor } from '../data/set-colors'
import { IconStar } from './icons'
import { ProgressBar, tint } from './ui'

type IconSet = Pick<SetSummary, 'kind' | 'color' | 'code' | 'iconCardId' | 'name'>

/** Set icon with a ring and glow in the set colour: the set code, or a custom set's card art. */
export function SetIcon({ set, size = 58, round = false }: { set: IconSet; size?: number; round?: boolean }) {
  const card = useCard(set.kind !== 'official' ? (set.iconCardId ?? undefined) : undefined)
  const [failed, setFailed] = useState(false)
  return (
    <div
      className="grid shrink-0 place-items-center overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: round ? '50%' : size * 0.31,
        background: alpha(set.color, 0.15),
        boxShadow: `0 0 0 1.5px ${set.color}, 0 0 ${Math.round(size * 0.4)}px ${alpha(set.color, 0.45)}`,
      }}
    >
      {card.data && !failed ? (
        <img src={card.data.images.small} alt="" className="h-full w-full object-cover" style={{ objectPosition: '50% 18%', transform: 'scale(1.7)', transformOrigin: '50% 22%' }} onError={() => setFailed(true)} />
      ) : set.kind === 'official' ? (
        <span className="mono font-semibold" style={{ color: set.color, fontSize: Math.max(10, size * 0.21) }}>
          {set.code.slice(0, 4)}
        </span>
      ) : (
        <IconStar size={size * 0.42} style={{ color: set.color }} />
      )}
    </div>
  )
}

const pctLabel = (s: SetSummary) => (s.progress.owned && s.progress.pct < 1 ? '<1%' : `${s.progress.pct}%`)

/** A row on the Sets tab. */
export function SetRow({ set }: { set: SetSummary }) {
  const untracked = set.kind === 'official' && !set.tracked
  return (
    <Link
      to={set.href}
      className="surface flex items-center gap-3.5 !rounded-[22px] p-3.5 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-accent"
    >
      <SetIcon set={set} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[15px] font-semibold tracking-tight">{set.name}</span>
          {set.kind !== 'official' && (
            <span className="mono flex-none rounded-full px-[7px] py-[3px] text-[9.5px] font-semibold tracking-[.1em]" style={{ background: alpha(set.color, 0.16), color: tint(set.color) }}>
              {set.kind === 'smart' ? 'SMART' : 'PICKED'}
            </span>
          )}
        </div>
        <ProgressBar pct={untracked ? 0 : set.progress.pct} color={set.color} />
        <span className="mono text-[11.5px] font-medium text-mute">
          {set.progress.owned} / {set.progress.total}
          {untracked && set.releaseDate && ` · ${set.releaseDate.slice(0, 4)}`}
        </span>
      </div>
      {untracked ? (
        <span className="mono flex-none rounded-full bg-[var(--chip)] px-3 py-2 text-[11px] font-semibold text-accent">TRACK</span>
      ) : (
        <span className="min-w-[52px] flex-none text-right text-[22px] font-bold tracking-tight">{pctLabel(set)}</span>
      )}
    </Link>
  )
}

/** A tile in the Home screen's "Recent sets" scroller. */
export function RecentSetTile({ set }: { set: SetSummary }) {
  return (
    <Link
      to={set.href}
      className="flex flex-col gap-3 rounded-[22px] p-3.5 transition-[transform,box-shadow] duration-200 hover:-translate-y-[3px]"
      style={{
        border: `1px solid ${alpha(set.color, 0.35)}`,
        background: `radial-gradient(120% 70% at 50% 0%, ${alpha(set.color, 0.15)}, transparent 75%), var(--surface)`,
      }}
    >
      <div className="flex items-center justify-between">
        <SetIcon set={set} size={46} round />
        <span className="text-[20px] font-bold tracking-tight">{pctLabel(set)}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-[14px] font-semibold">{set.name}</span>
        <span className="mono text-[11px] font-medium text-mute">
          {set.progress.owned} / {set.progress.total}
        </span>
      </div>
      <ProgressBar pct={set.progress.pct} color={set.color} height={5} />
    </Link>
  )
}

/** A series on the Sets tab: its logo (or name) on a glow in its colour, with set counts. */
export function SeriesTile({ group, logo }: { group: SeriesGroup; logo?: string }) {
  const [failed, setFailed] = useState(false)
  const color = paletteColor(group.name)
  return (
    <Link
      to={`/series/${group.slug}`}
      className="flex flex-col gap-3 rounded-[22px] p-3.5 transition-[transform,box-shadow] duration-200 hover:-translate-y-[3px]"
      style={{
        border: `1px solid ${alpha(color, 0.35)}`,
        background: `radial-gradient(120% 80% at 50% 0%, ${alpha(color, 0.18)}, transparent 75%), var(--surface)`,
      }}
    >
      <div className="grid h-[84px] place-items-center px-2">
        {logo && !failed ? (
          <img
            src={logo}
            alt={group.name}
            loading="lazy"
            className="max-h-[76px] max-w-full object-contain"
            style={{ filter: `drop-shadow(0 0 14px ${alpha(color, 0.35)})` }}
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="text-center text-[22px] leading-tight font-extrabold tracking-[-.03em]" style={{ color: tint(color), textShadow: `0 0 18px ${alpha(color, 0.5)}` }}>
            {group.name}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[14px] font-semibold">{group.name}</div>
        <div className="mono truncate text-[11px] text-mute">
          {group.sets.length} sets{group.tracked > 0 && ` · ${group.tracked} tracked`}
        </div>
      </div>
    </Link>
  )
}
