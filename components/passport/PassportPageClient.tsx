'use client'

import Link from 'next/link'
import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, MapPinned, Ticket } from 'lucide-react'
import type { User, UserIdentity } from '@supabase/supabase-js'
import type { PassportStampRecord } from '@/lib/passport'
import { getUserInitials } from '@/lib/auth-profile'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { NookStamp, getPalette } from './NookStamp'

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

function useStampInteractive() {
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const isHoverDevice =
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches
    if (!isHoverDevice) return

    let frame = 0
    let ready = false
    const readyTimer = window.setTimeout(() => {
      ready = true
    }, 320)

    const reset = () => {
      cancelAnimationFrame(frame)
      el.style.setProperty('--tilt-x', '0deg')
      el.style.setProperty('--tilt-y', '0deg')
      el.style.setProperty('--sheen-x', '50%')
      el.style.setProperty('--sheen-y', '50%')
      el.style.setProperty('--sheen-opacity', '0')
      el.style.setProperty('--lift', '0px')
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!ready) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect()
        const x = (e.clientX - rect.left) / rect.width
        const y = (e.clientY - rect.top) / rect.height
        const tiltX = (0.5 - y) * 18
        const tiltY = (x - 0.5) * 18
        el.style.setProperty('--tilt-x', `${tiltX}deg`)
        el.style.setProperty('--tilt-y', `${tiltY}deg`)
        el.style.setProperty('--sheen-x', `${x * 100}%`)
        el.style.setProperty('--sheen-y', `${y * 100}%`)
        el.style.setProperty('--sheen-opacity', '0.55')
        el.style.setProperty('--lift', '10px')
      })
    }

    el.addEventListener('mousemove', handleMouseMove)
    el.addEventListener('mouseleave', reset)
    return () => {
      clearTimeout(readyTimer)
      cancelAnimationFrame(frame)
      el.removeEventListener('mousemove', handleMouseMove)
      el.removeEventListener('mouseleave', reset)
    }
  }, [])

  return ref
}

function InteractiveStampShell({
  isHighlighted,
  isFlipped,
  onClick,
  frontFace,
  backFace,
}: {
  isHighlighted: boolean
  isFlipped: boolean
  onClick: () => void
  frontFace: React.ReactNode
  backFace: React.ReactNode
}) {
  const buttonRef = useStampInteractive()
  const rotorRef = useRef<HTMLDivElement>(null)
  const prevFlippedRef = useRef<boolean | null>(null)
  const rotationRef = useRef(0)
  const animationRef = useRef<Animation | null>(null)

  useLayoutEffect(() => {
    const el = rotorRef.current
    if (!el) return

    if (prevFlippedRef.current === null) {
      prevFlippedRef.current = isFlipped
      rotationRef.current = isFlipped ? -180 : 0
      el.style.transform = `rotateY(${rotationRef.current}deg)`
      return
    }

    if (prevFlippedRef.current === isFlipped) return
    prevFlippedRef.current = isFlipped

    if (animationRef.current) {
      animationRef.current.cancel()
    }

    const fromY = rotationRef.current
    const toY = fromY - 180
    rotationRef.current = toY
    const midY = (fromY + toY) / 2

    animationRef.current = el.animate(
      [
        { transform: `rotateY(${fromY}deg) translateZ(0px) scale(1)`, offset: 0 },
        { transform: `rotateY(${midY}deg) translateZ(80px) scale(1.07)`, offset: 0.5 },
        { transform: `rotateY(${toY}deg) translateZ(0px) scale(1)`, offset: 1 },
      ],
      {
        duration: 720,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'forwards',
      },
    )
  }, [isFlipped])

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className={cn(
        'passport-stamp-shell group relative block w-full text-left',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20',
        isHighlighted && 'shadow-[0_22px_40px_rgba(88,120,61,0.28)]',
      )}
      style={{
        transform:
          'perspective(1400px) translateY(calc(var(--lift, 0px) * -1)) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg))',
        transformStyle: 'preserve-3d',
        transition: 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
        willChange: 'transform',
      }}
    >
      <div
        ref={rotorRef}
        className="relative"
        style={{
          transformStyle: 'preserve-3d',
        }}
      >
        <div
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
        >
          {frontFace}
        </div>
        <div
          className="absolute inset-0"
          style={{
            transform: 'rotateY(180deg)',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
        >
          {backFace}
        </div>
      </div>
    </button>
  )
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
  const [userInitials, setUserInitials] = useState('NK')
  const [mapImages, setMapImages] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    const client = createBrowserSupabaseClient()

    async function loadInitials() {
      const { data } = await client.auth.getUser()
      const user: User | null = data.user ?? null
      const identities: UserIdentity[] = user?.identities ?? []
      if (!cancelled) {
        setUserInitials(getUserInitials(user, identities))
      }
    }

    void loadInitials()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const observers: IntersectionObserver[] = []
    const requested = new Set<string>()

    async function snapshot(nookId: string, lat: number, lng: number) {
      if (requested.has(nookId)) return
      requested.add(nookId)
      try {
        const { getStampMapImage } = await import('@/lib/stamp-map')
        const dataUrl = await getStampMapImage(nookId, lat, lng)
        if (cancelled) return
        setMapImages((prev) => (prev[nookId] === dataUrl ? prev : { ...prev, [nookId]: dataUrl }))
      } catch {
        // Snapshot failed — leave stamp on the typographic fallback.
      }
    }

    for (const stamp of stamps) {
      const node = stampRefs.current[stamp.nookId]
      const lat = stamp.place?.lat
      const lng = stamp.place?.lng
      if (!node || lat == null || lng == null) continue

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              void snapshot(stamp.nookId, lat, lng)
              observer.disconnect()
            }
          }
        },
        { rootMargin: '200px' },
      )
      observer.observe(node)
      observers.push(observer)
    }

    return () => {
      cancelled = true
      for (const o of observers) o.disconnect()
    }
  }, [stamps])

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
      <div className="rounded-2xl border border-border/70 bg-card px-6 py-12 text-center">
        <Ticket className="mx-auto h-6 w-6 text-muted-foreground/80" />
        <p className="font-display mt-3 text-[1.25rem] leading-[1.1] tracking-[-0.01em]">
          no stamps yet
        </p>
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">
          Check in to a nook to start collecting stamps.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 px-1">
        <p className="font-display text-[1.45rem] leading-[1.05] tracking-[-0.015em] text-foreground">
          {stamps.length} {stamps.length === 1 ? 'nook' : 'nooks'}
        </p>
        <span className="meta-mono text-[10px] uppercase text-muted-foreground">
          {totalCheckIns} {totalCheckIns === 1 ? 'visit' : 'visits'} total
        </span>
        {oldestVisit && (
          <span className="meta-mono text-[10px] uppercase text-muted-foreground">
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
        {stamps.map((stamp) => {
          const isHighlighted = highlightedStampId === stamp.nookId
          const isFlipped = expandedNookId === stamp.nookId
          const place = stamp.place
          const palette = getPalette(place?.type)
          const visibleVisits = stamp.visits.slice(0, 4)
          const extraVisits = stamp.visits.length - visibleVisits.length

          return (
            <div
              key={stamp.nookId}
              ref={node => {
                stampRefs.current[stamp.nookId] = node
              }}
              className={cn(
                'w-full',
                isCompact ? 'max-w-[12.5rem]' : 'max-w-[13rem]',
              )}
            >
              <InteractiveStampShell
                isHighlighted={isHighlighted}
                isFlipped={isFlipped}
                onClick={() => {
                  const isOpening = expandedNookId !== stamp.nookId
                  setExpandedNookId(current =>
                    current === stamp.nookId ? null : stamp.nookId,
                  )
                  if (isOpening) onExpand?.()
                }}
                frontFace={
                  <div
                    className="passport-stamp-perforated relative"
                    style={stampMaskStyle}
                  >
                    <NookStamp
                      stamp={stamp}
                      userInitials={userInitials}
                      mapImageUrl={mapImages[stamp.nookId] ?? null}
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          'radial-gradient(circle at var(--sheen-x, 50%) var(--sheen-y, 50%), rgba(255, 244, 220, 1) 0%, rgba(255, 244, 220, 0) 55%)',
                        mixBlendMode: 'soft-light',
                        opacity: 'var(--sheen-opacity, 0)',
                        transition: 'opacity 220ms ease-out',
                      }}
                    />
                  </div>
                }
                backFace={
                  <div
                    className="passport-stamp-perforated relative h-full w-full"
                    style={{
                      ...stampMaskStyle,
                      backgroundColor: palette.paper,
                      color: palette.accent,
                    }}
                  >
                    <div
                      className="absolute inset-0"
                      style={{
                        background: `radial-gradient(circle at 30% 20%, ${palette.paper} 0%, ${palette.paper} 60%, rgba(0,0,0,0.06) 100%)`,
                      }}
                      aria-hidden
                    />
                    <div className="relative flex h-full flex-col px-4 py-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className="meta-mono text-[9px] uppercase tracking-[0.18em]"
                          style={{ color: palette.inkSoft }}
                        >
                          visits
                        </span>
                        <span
                          className="font-display text-[1.6rem] leading-none"
                          style={{ color: palette.ink }}
                        >
                          {stamp.visitsCount}
                        </span>
                      </div>

                      <div
                        className="my-2.5 h-px"
                        style={{ background: palette.inkSoft, opacity: 0.4 }}
                        aria-hidden
                      />

                      <div className="flex-1 space-y-1.5 overflow-hidden">
                        {visibleVisits.map((visit, visitIndex) => (
                          <div
                            key={visit.id}
                            className="flex items-baseline justify-between gap-2"
                          >
                            <span
                              className="meta-mono text-[8.5px] uppercase tracking-[0.14em]"
                              style={{ color: palette.inkSoft }}
                            >
                              #{stamp.visitsCount - visitIndex}
                            </span>
                            <span
                              className="meta-mono text-[9px] tracking-[0.04em]"
                              style={{ color: palette.accent }}
                            >
                              {formatVisitTimestamp(visit.visitedAt)}
                            </span>
                          </div>
                        ))}
                        {extraVisits > 0 && (
                          <p
                            className="meta-mono text-[8.5px] uppercase tracking-[0.14em]"
                            style={{ color: palette.inkSoft }}
                          >
                            + {extraVisits} more
                          </p>
                        )}
                      </div>

                      {place?.address && (
                        <>
                          <div
                            className="my-2.5 h-px"
                            style={{ background: palette.inkSoft, opacity: 0.4 }}
                            aria-hidden
                          />
                          <div className="flex items-start gap-1.5">
                            <MapPinned
                              className="mt-0.5 h-3 w-3 shrink-0"
                              style={{ color: palette.inkSoft }}
                            />
                            <span
                              className="text-[10.5px] leading-snug"
                              style={{ color: palette.accent }}
                            >
                              {place.address}
                            </span>
                          </div>
                        </>
                      )}

                      {place?.slug && (
                        <Link
                          href={`/nook/${encodeURIComponent(place.slug)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="meta-mono mt-3 inline-flex w-full items-center justify-between gap-1 rounded-md border px-2.5 py-1.5 text-[9px] uppercase tracking-[0.16em] transition-colors hover:bg-black/5"
                          style={{
                            borderColor: palette.inkSoft,
                            color: palette.ink,
                          }}
                        >
                          open nook
                          <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                }
              />
            </div>
          )
        })}
      </section>
    </div>
  )
}
