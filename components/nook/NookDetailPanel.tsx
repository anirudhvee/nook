'use client'

import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Wifi,
  Plug,
  Volume2,
  Laptop,
  Star,
  MapPin,
  Clock,
  BookmarkPlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NookPlace, NookType } from '@/types/nook'

interface PlaceDetail {
  rating?: number
  regularOpeningHours?: {
    openNow?: boolean
    weekdayDescriptions?: string[]
  }
}

interface WorkSignals {
  wifi_signal: 'good' | 'weak' | 'none' | null
  outlet_signal: 'plenty' | 'few' | 'none' | null
  noise_signal: 'quiet' | 'moderate' | 'loud' | null
  laptop_signal: 'yes' | 'no' | null
}

const TYPE_LABELS: Record<NookType, string> = {
  cafe: 'café',
  library: 'library',
  coworking: 'coworking',
  other: 'other',
}

const SIGNAL_CARDS = [
  { icon: Wifi, label: 'WiFi', key: 'wifi_signal' },
  { icon: Plug, label: 'Outlets', key: 'outlet_signal' },
  { icon: Volume2, label: 'Noise', key: 'noise_signal' },
  { icon: Laptop, label: 'Laptop-friendly', key: 'laptop_signal' },
] as const

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function formatSignal(value: WorkSignals[keyof WorkSignals]): string {
  if (!value) return '—'
  return value.replace(/_/g, ' ')
}

// weekdayDescriptions is Mon=0 .. Sun=6; JS getDay() is 0=Sun..6=Sat
function todayHours(descriptions: string[]): string {
  const idx = (new Date().getDay() + 6) % 7
  const desc = descriptions[idx] ?? ''
  return desc.replace(/^[^:]+:\s*/, '')
}

interface Props {
  nook: NookPlace
  onClose: () => void
}

export function NookDetailPanel({ nook, onClose }: Props) {
  const [detail, setDetail] = useState<PlaceDetail | null>(null)
  const [fetching, setFetching] = useState(true)
  const [signals, setSignals] = useState<WorkSignals | null>(null)
  const [signalsLoading, setSignalsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function loadDetail() {
      if (!cancelled) {
        setDetail(null)
        setFetching(true)
      }

      try {
        const response = await fetch(`/api/places/${encodeURIComponent(nook.id)}`, {
          signal: controller.signal,
        })

        if (!response.ok) return

        const data = (await response.json()) as PlaceDetail
        if (!cancelled) {
          setDetail(data)
        }
      } catch (error) {
        if (isAbortError(error)) return
      } finally {
        if (!cancelled) {
          setFetching(false)
        }
      }
    }

    async function loadSignals() {
      if (!cancelled) {
        setSignals(null)
        setSignalsLoading(true)
      }

      try {
        const reviewsResponse = await fetch(`/api/reviews/${encodeURIComponent(nook.id)}`, {
          signal: controller.signal,
        })
        if (!reviewsResponse.ok) return

        const aiResponse = await fetch('/api/ai', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ place_id: nook.id }),
          signal: controller.signal,
        })
        if (!aiResponse.ok) return

        const data = (await aiResponse.json()) as { signals?: WorkSignals | null }
        if (!cancelled) {
          setSignals(data.signals ?? null)
        }
      } catch (error) {
        if (isAbortError(error)) return
      } finally {
        if (!cancelled) {
          setSignalsLoading(false)
        }
      }
    }

    void loadDetail()
    void loadSignals()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [nook.id])

  const rating = detail?.rating ?? nook.rating
  const openNow = detail?.regularOpeningHours?.openNow
  const hours = detail?.regularOpeningHours?.weekdayDescriptions
    ? todayHours(detail.regularOpeningHours.weekdayDescriptions)
    : null

  return (
    <div className="flex h-full flex-col animate-in slide-in-from-left-4 duration-200">
      <div className="shrink-0 border-b border-border px-4 pt-4 pb-3">
        <button
          onClick={onClose}
          className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          back to list
        </button>

        {fetching ? (
          <div className="space-y-2">
            <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <>
            <h2 className="text-base font-semibold leading-snug">{nook.name}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {TYPE_LABELS[nook.type]}
              </span>
              {nook.neighborhood && (
                <span className="text-xs text-muted-foreground">{nook.neighborhood}</span>
              )}
              {rating != null && (
                <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {rating.toFixed(1)}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 pt-3 pb-4">
        <div className="flex items-start gap-2.5">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm leading-snug">{nook.address}</span>
        </div>

        {(hours !== null || openNow != null) && (
          <div className="flex items-center gap-2.5">
            <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex flex-wrap items-center gap-2">
              {openNow != null && (
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-xs font-semibold',
                    openNow ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  )}
                >
                  {openNow ? 'open' : 'closed'}
                </span>
              )}
              {hours && <span className="text-xs text-muted-foreground">{hours}</span>}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            work signals
          </p>
          <div className="grid grid-cols-2 gap-2">
            {SIGNAL_CARDS.map(({ icon: Icon, label, key }) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-xl border border-border bg-card p-2.5"
              >
                <Icon className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="mb-0.5 text-[10px] leading-none text-muted-foreground">{label}</p>
                  {signalsLoading ? (
                    <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                  ) : (
                    <p className="text-xs font-medium capitalize">
                      {formatSignal(signals?.[key] ?? null)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          disabled
          className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/10 py-2.5 text-sm font-medium text-primary opacity-50"
        >
          <BookmarkPlus className="h-4 w-4" />
          stamp my passport
        </button>
      </div>
    </div>
  )
}
