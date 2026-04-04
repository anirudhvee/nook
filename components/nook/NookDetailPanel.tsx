'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Wifi, Plug, Volume2, Laptop, Star, MapPin, Clock, BookmarkPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NookPlace, NookType } from '@/types/nook'

interface PlaceDetail {
  rating?: number
  regularOpeningHours?: {
    openNow?: boolean
    weekdayDescriptions?: string[]
  }
}

const TYPE_LABELS: Record<NookType, string> = {
  cafe: 'café',
  library: 'library',
  coworking: 'coworking',
  other: 'other',
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

  useEffect(() => {
    setDetail(null)
    setFetching(true)
    fetch(`/api/places/${encodeURIComponent(nook.id)}`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: PlaceDetail | null) => {
        setDetail(data)
        setFetching(false)
      })
      .catch(() => setFetching(false))
  }, [nook.id])

  const rating = detail?.rating ?? nook.rating
  const openNow = detail?.regularOpeningHours?.openNow
  const hours = detail?.regularOpeningHours?.weekdayDescriptions
    ? todayHours(detail.regularOpeningHours.weekdayDescriptions)
    : null

  return (
    <div className="flex flex-col h-full animate-in slide-in-from-left-4 duration-200">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 shrink-0 border-b border-border">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          back to list
        </button>

        {fetching ? (
          <div className="space-y-2">
            <div className="h-5 w-3/4 rounded bg-muted animate-pulse" />
            <div className="h-3.5 w-1/2 rounded bg-muted animate-pulse" />
          </div>
        ) : (
          <>
            <h2 className="font-semibold text-base leading-snug">{nook.name}</h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
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

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3 space-y-4">
        {/* Address */}
        <div className="flex gap-2.5 items-start">
          <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <span className="text-sm leading-snug">{nook.address}</span>
        </div>

        {/* Hours */}
        {(hours !== null || openNow != null) && (
          <div className="flex gap-2.5 items-center">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-2 flex-wrap">
              {openNow != null && (
                <span
                  className={cn(
                    'text-xs font-semibold px-1.5 py-0.5 rounded',
                    openNow ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'
                  )}
                >
                  {openNow ? 'open' : 'closed'}
                </span>
              )}
              {hours && <span className="text-xs text-muted-foreground">{hours}</span>}
            </div>
          </div>
        )}

        {/* Work signals */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            work signals
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { icon: Wifi, label: 'WiFi' },
                { icon: Plug, label: 'Outlets' },
                { icon: Volume2, label: 'Noise' },
                { icon: Laptop, label: 'Laptop-friendly' },
              ] as const
            ).map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 p-2.5 rounded-xl border border-border bg-card"
              >
                <Icon className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground leading-none mb-0.5">{label}</p>
                  <p className="text-xs font-medium text-muted-foreground">—</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Passport stamp */}
        <button
          disabled
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm font-medium opacity-50 cursor-not-allowed"
        >
          <BookmarkPlus className="h-4 w-4" />
          stamp my passport
        </button>
      </div>
    </div>
  )
}
