import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { SetRow } from '../components/SetBits'
import { BackPill, ErrorMessage, Message, PageHeader, Screen, Skeleton, TopRow } from '../components/ui'
import { paletteColor } from '../data/set-colors'
import { alpha } from '../lib/color'
import { useSeriesLogos } from '../lib/queries'
import { groupBySeries, useSetSummaries } from '../lib/summaries'
import { seriesLogoFor } from '../lib/tcgdex'

/** Every set in one series, newest first. */
export function SeriesPage() {
  const { slug = '' } = useParams()
  const name = decodeURIComponent(slug)
  const summaries = useSetSummaries()
  const logos = useSeriesLogos()
  const group = useMemo(() => groupBySeries(summaries.official).find((g) => g.name === name), [summaries.official, name])
  const logo = seriesLogoFor(logos.data, name)
  const [failed, setFailed] = useState(false)
  const color = paletteColor(name)

  return (
    <Screen>
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[500px]" style={{ background: `radial-gradient(60% 50% at 50% 0%, ${alpha(color, 0.2)}, transparent 70%)` }} />
      <TopRow left={<BackPill label="Sets" to="/sets" />} />

      {logo && !failed && (
        <div className="grid h-[110px] place-items-center">
          <img src={logo} alt="" className="max-h-[100px] max-w-[80%] object-contain" style={{ filter: `drop-shadow(0 0 20px ${alpha(color, 0.4)})` }} onError={() => setFailed(true)} />
        </div>
      )}
      <PageHeader eyebrow={group ? `${group.sets.length} sets${group.tracked ? ` · ${group.tracked} tracked` : ''}` : 'Series'} title={name} />

      {summaries.setsLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[88px] !rounded-[22px]" />
          ))}
        </div>
      ) : summaries.setsError && !group ? (
        <ErrorMessage error={summaries.setsError} retry={() => summaries.refetchSets()} />
      ) : !group ? (
        <Message title="Series not found" body="It isn't in the card list." />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
          {group.sets.map((s) => (
            <SetRow key={s.key} set={s} />
          ))}
        </div>
      )}
    </Screen>
  )
}
