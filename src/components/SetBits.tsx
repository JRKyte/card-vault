import { useState } from 'react'
import { Link } from 'react-router-dom'
import { alpha } from '../lib/color'
import { fmtUsd } from '../lib/pricing'
import { useCard } from '../lib/queries'
import type { SetSummary } from '../lib/summaries'
import { IconPlus, IconStar } from './icons'
import { ProgressBar } from './ui'

/** Rounded square for official sets (symbol or code), circle for custom sets (icon card or star). */
export function SetLogo({ set, size = 64 }: { set: Pick<SetSummary, 'kind' | 'color' | 'code' | 'symbol' | 'iconCardId' | 'name'>; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (set.kind !== 'official') return <CustomIcon set={set} size={size} />
  return (
    <div className="grid shrink-0 place-items-center" style={{ width: size, height: size, borderRadius: size * 0.28, background: set.color }}>
      {set.symbol && !failed ? (
        // Symbols are small badges with their own colours, so sit them on a white tile.
        <div className="grid place-items-center bg-white/92 shadow-sm" style={{ width: size * 0.62, height: size * 0.62, borderRadius: size * 0.18 }}>
          <img src={set.symbol} alt="" className="object-contain" style={{ width: size * 0.46, height: size * 0.46 }} onError={() => setFailed(true)} />
        </div>
      ) : (
        <span className="font-extrabold text-white" style={{ fontSize: size * 0.24 }}>
          {set.code}
        </span>
      )}
    </div>
  )
}

function CustomIcon({ set, size }: { set: Pick<SetSummary, 'color' | 'iconCardId'>; size: number }) {
  const card = useCard(set.iconCardId ?? undefined)
  const [failed, setFailed] = useState(false)
  return (
    <div className="grid shrink-0 place-items-center overflow-hidden rounded-full" style={{ width: size, height: size, background: set.color }}>
      {card.data && !failed ? (
        <img src={card.data.images.small} alt="" className="h-full w-full object-cover" style={{ objectPosition: '50% 18%', transform: 'scale(1.6)' }} onError={() => setFailed(true)} />
      ) : (
        <IconStar size={size * 0.45} className="text-white" />
      )}
    </div>
  )
}

export function SetRow({ set }: { set: SetSummary }) {
  const untracked = set.kind === 'official' && !set.tracked
  return (
    <Link to={set.href} className="glass-flat flex items-center gap-4 p-3.5 pr-5 transition-transform active:scale-[0.99]">
      <SetLogo set={set} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[19px] font-bold">{set.name}</span>
            {set.kind !== 'official' && (
              <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider" style={{ background: alpha(set.color, 0.14), color: set.color }}>
                {set.kind === 'smart' ? 'SMART SET' : 'PICKED'}
              </span>
            )}
          </div>
          {!untracked && (
            <span className="shrink-0 text-[14px] font-semibold text-ink-2">
              {set.progress.owned} / {set.progress.total}
              {set.value.priced && <> · {fmtUsd(set.value.usd)}</>}
            </span>
          )}
        </div>
        {untracked ? (
          <div className="mt-1.5 text-[14px] text-ink-2">
            {set.progress.total} cards{set.releaseDate && ` · ${set.releaseDate.slice(0, 4)}`}
            {set.progress.owned > 0 && ` · you have ${set.progress.owned}`}
          </div>
        ) : (
          <ProgressBar pct={set.progress.pct} color={set.color} className="mt-2.5" />
        )}
      </div>
      {untracked ? (
        <span className="pill shrink-0 bg-ink/5 text-[15px]">
          <IconPlus size={18} /> Track
        </span>
      ) : (
        <span className="w-[72px] shrink-0 text-right text-[30px] font-extrabold" style={{ color: set.color }}>
          {set.progress.pct}%
        </span>
      )}
    </Link>
  )
}
