'use client'

import { Bebas_Neue } from 'next/font/google'
import Link from 'next/link'
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, MapPinned, Ticket } from 'lucide-react'
import type { PassportStampRecord } from '@/lib/passport'
import { cn } from '@/lib/utils'

const stampDisplay = Bebas_Neue({
  subsets: ['latin'],
  weight: '400',
})

const stampMaskStyle = {
  WebkitMaskImage: 'url(/stamp-frame.svg)',
  WebkitMaskSize: '100% 100%',
  WebkitMaskRepeat: 'no-repeat',
  maskImage: 'url(/stamp-frame.svg)',
  maskSize: '100% 100%',
  maskRepeat: 'no-repeat',
} as CSSProperties

function formatStampDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
    .format(new Date(date))
    .toUpperCase()
}

function formatVisitTimestamp(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date))
}

interface Props {
  stamps: PassportStampRecord[]
  totalCheckIns: number
  highlightedNookId?: string | null
  isCompact?: boolean
  onExpand?: () => void
}

export function PassportPageClient({
  stamps,
  totalCheckIns,
  highlightedNookId = null,
  isCompact = false,
  onExpand,
}: Props) {
  const [expandedNookId, setExpandedNookId] = useState<string | null>(highlightedNookId)
  const [highlightedStampId, setHighlightedStampId] = useState<string | null>(highlightedNookId)
  const stampRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    setExpandedNookId(highlightedNookId)
  }, [highlightedNookId])

  useEffect(() => {
    if (!highlightedNookId) {
      setHighlightedStampId(null)
      return
    }

    setHighlightedStampId(highlightedNookId)

    const timeoutId = window.setTimeout(() => {
      setHighlightedStampId(current =>
        current === highlightedNookId ? null : current,
      )
    }, 2200)

    return () => window.clearTimeout(timeoutId)
  }, [highlightedNookId])

  useEffect(() => {
    if (!highlightedNookId) return

    const stampNode = stampRefs.current[highlightedNookId]
    if (!stampNode) return

    stampNode.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [highlightedNookId])

  const oldestVisit = useMemo(() => {
    return stamps.reduce<string | null>((oldest, stamp) => {
      if (!oldest) return stamp.firstVisitedAt
      return new Date(stamp.firstVisitedAt).getTime() < new Date(oldest).getTime()
        ? stamp.firstVisitedAt
        : oldest
    }, null)
  }, [stamps])

  if (stamps.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-6 py-10 text-center">
        <Ticket className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">no stamps yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Check in to a nook to start collecting stamps.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-1">
        <p className="text-sm font-medium text-foreground">
          {stamps.length} {stamps.length === 1 ? 'nook' : 'nooks'}
        </p>
        <span className="text-xs text-muted-foreground">
          {totalCheckIns} {totalCheckIns === 1 ? 'visit' : 'visits'} total
        </span>
        {oldestVisit && (
          <span className="text-xs text-muted-foreground">
            since {formatStampDate(oldestVisit).toLowerCase()}
          </span>
        )}
      </div>

      <section
        className={cn(
          'grid justify-items-center gap-3',
          isCompact ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4',
        )}
      >
        {stamps.map((stamp, index) => {
          const isHighlighted = highlightedStampId === stamp.nookId
          const isExpanded = expandedNookId === stamp.nookId
          const place = stamp.place
          const title = place?.name ?? 'Unknown nook'
          const locationLine = place?.locationLine ?? 'Location unavailable'
          const tiltClass =
            index % 2 === 0
              ? 'hover:[transform:perspective(1400px)_rotateX(5deg)_rotateY(-6deg)_translateY(-8px)_scale(1.01)]'
              : 'hover:[transform:perspective(1400px)_rotateX(5deg)_rotateY(6deg)_translateY(-8px)_scale(1.01)]'

          return (
            <div
              key={stamp.nookId}
              ref={node => {
                stampRefs.current[stamp.nookId] = node
              }}
              className={cn(
                'w-full space-y-3',
                isCompact ? 'max-w-[12.5rem]' : 'max-w-[13rem]',
              )}
            >
              <button
                type="button"
                onClick={() => {
                  const isOpening = expandedNookId !== stamp.nookId
                  setExpandedNookId(current =>
                    current === stamp.nookId ? null : stamp.nookId,
                  )
                  if (isOpening) onExpand?.()
                }}
                className={cn(
                  'passport-stamp-shell group block w-full text-left transition-all duration-300',
                  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20',
                  '[transform:perspective(1400px)_rotateX(0deg)_rotateY(0deg)_translateY(0px)]',
                  tiltClass,
                  isHighlighted && '-translate-y-1 shadow-[0_22px_40px_rgba(88,120,61,0.28)]',
                )}
              >
                <div className="passport-stamp-perforated" style={stampMaskStyle}>
                  <div className="relative aspect-[0.68] overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_36%),linear-gradient(160deg,_rgba(111,90,70,0.92),_rgba(45,35,28,0.98))]" />

                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(40,31,24,0)_0%,rgba(40,31,24,0.04)_28%,rgba(31,24,18,0.55)_52%,rgba(25,19,14,0.88)_72%,rgba(22,16,12,0.95)_100%)]" />

                    <div className="absolute inset-x-0 bottom-0 px-2.5 pb-2.5 pt-10 text-white">
                      <p
                        className={cn(
                          'text-[1.05rem] uppercase leading-[0.92] tracking-[0.05em] text-[#f8f1e6] drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)] sm:text-[1.15rem]',
                          stampDisplay.className,
                        )}
                      >
                        {title}
                      </p>
                      <p
                        className={cn(
                          'mt-0.5 text-[0.62rem] uppercase leading-none tracking-[0.08em] text-[#f2e7d8]/86 sm:text-[0.66rem]',
                          stampDisplay.className,
                        )}
                      >
                        {locationLine}
                      </p>

                      <div className="mt-2.5 h-px w-full bg-[#f2e7d8]/70" />

                      <div className="mt-2 grid grid-cols-[1fr_auto_0.6fr] items-end gap-2">
                        <div>
                          <p
                            className={cn(
                              'text-[0.55rem] uppercase leading-none tracking-[0.1em] text-[#f2e7d8]/80',
                              stampDisplay.className,
                            )}
                          >
                            First visit
                          </p>
                          <p
                            className={cn(
                              'mt-0.5 text-[0.95rem] uppercase leading-none tracking-[0.05em] text-[#fff7ee]',
                              stampDisplay.className,
                            )}
                          >
                            {formatStampDate(stamp.firstVisitedAt)}
                          </p>
                        </div>

                        <div className="h-9 w-px bg-[#f2e7d8]/68" />

                        <div className="text-right">
                          <p
                            className={cn(
                              'text-[0.55rem] uppercase leading-none tracking-[0.1em] text-[#f2e7d8]/80',
                              stampDisplay.className,
                            )}
                          >
                            Visits
                          </p>
                          <p
                            className={cn(
                              'mt-0.5 text-[1.1rem] uppercase leading-none tracking-[0.04em] text-[#fff7ee]',
                              stampDisplay.className,
                            )}
                          >
                            {stamp.visitsCount}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {stamp.visitsCount} {stamp.visitsCount === 1 ? 'visit' : 'visits'}
                    </p>
                    {place?.slug ? (
                      <Link
                        href={`/nook/${encodeURIComponent(place.slug)}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:underline"
                      >
                        open nook
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    ) : null}
                  </div>

                  <div className="mt-2 space-y-1.5">
                    {stamp.visits.map((visit, visitIndex) => (
                      <div
                        key={visit.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border px-2.5 py-2"
                      >
                        <span className="text-xs text-muted-foreground">
                          visit {stamp.visitsCount - visitIndex}
                        </span>
                        <span className="text-xs text-foreground">
                          {formatVisitTimestamp(visit.visitedAt)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {place?.address ? (
                    <div className="mt-2.5 flex items-start gap-2 text-xs text-muted-foreground">
                      <MapPinned className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{place.address}</span>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}
