'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { ArrowLeft, Star, MapPin, Clock, BookmarkPlus, Wifi, Plug, Volume2, Laptop } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildPlacePhotoUrl } from '@/lib/place-photo'
import { PlacePhotoAttribution } from '@/components/place/PlacePhotoAttribution'
import { NOOK_TYPE_LABELS } from '@/types/nook'
import type { NookPlace, NookPhoto } from '@/types/nook'

interface PlaceReview {
  rating?: number
  text?: {
    text?: string
  }
  originalText?: {
    text?: string
  }
}

interface PlaceDetail {
  rating?: number
  photo?: NookPhoto
  reviewSummary?: {
    text?: {
      text?: string
    }
    disclosureText?: {
      text?: string
    }
  }
  generativeSummary?: {
    overview?: {
      text?: string
    }
  }
  reviews?: PlaceReview[]
  regularOpeningHours?: {
    openNow?: boolean
    weekdayDescriptions?: string[]
  }
}

function signalIcon(signal: string) {
  const s = signal.toLowerCase()
  if (s.includes('wifi')) return <Wifi className="h-3.5 w-3.5 shrink-0" />
  if (s.includes('outlet')) return <Plug className="h-3.5 w-3.5 shrink-0" />
  if (s.includes('loud') || s.includes('quiet') || s.includes('noise')) return <Volume2 className="h-3.5 w-3.5 shrink-0" />
  if (s.includes('laptop')) return <Laptop className="h-3.5 w-3.5 shrink-0" />
  return null
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

// weekdayDescriptions is Mon=0 .. Sun=6; JS getDay() is 0=Sun..6=Sat
function todayHours(descriptions: string[]): string {
  const idx = (new Date().getDay() + 6) % 7
  const desc = descriptions[idx] ?? ''
  return desc.replace(/^[^:]+:\s*/, '')
}

function toAiReviews(reviews: PlaceReview[] | undefined): Array<{ text: string; rating: number | null }> {
  return (reviews ?? []).slice(0, 5).flatMap(review => {
    const text = review.text?.text?.trim() || review.originalText?.text?.trim() || ''
    if (!text) return []

    return [
      {
        text,
        rating: review.rating ?? null,
      },
    ]
  })
}

interface Props {
  nook: NookPlace
  onClose: () => void
}

export function NookDetailPanel({ nook, onClose }: Props) {
  const [detail, setDetail] = useState<PlaceDetail | null>(null)
  const [photo, setPhoto] = useState<NookPhoto | undefined>(nook.photo)
  const [fetching, setFetching] = useState(true)
  const [signals, setSignals] = useState<string[]>([])
  const [signalsLoading, setSignalsLoading] = useState(true)
  const [aiSummary, setAiSummary] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function loadPanelData() {
      if (!cancelled) {
        setDetail(null)
        setPhoto(nook.photo)
        setSignals([])
        setAiSummary(null)
        setFetching(true)
        setSignalsLoading(true)
      }

      try {
        const photoPromise = nook.photo
          ? Promise.resolve<{ photo?: NookPhoto }>({ photo: nook.photo })
          : fetch(`/api/places/${encodeURIComponent(nook.id)}/photo`, {
              signal: controller.signal,
            }).then(async response => {
              if (!response.ok) return { photo: undefined }
              return await response.json() as { photo?: NookPhoto }
            })

        const detailPromise = fetch(`/api/places/${encodeURIComponent(nook.id)}`, {
          signal: controller.signal,
        })

        const [photoData, detailResponse] = await Promise.all([photoPromise, detailPromise])

        if (!cancelled) {
          setPhoto(photoData.photo)
        }

        if (!detailResponse.ok) return

        const detailData = (await detailResponse.json()) as PlaceDetail
        if (!cancelled) {
          setDetail(detailData)
          setFetching(false)
        }

        const aiReviews = toAiReviews(detailData.reviews)
        const googleSummary =
          detailData.reviewSummary?.text?.text ?? detailData.generativeSummary?.overview?.text ?? null
        const needsAiSummary = !googleSummary && aiReviews.length > 0

        const aiResponse = await fetch('/api/ai', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            place_id: nook.id,
            reviews: aiReviews,
            generateSummary: needsAiSummary,
          }),
          signal: controller.signal,
        })

        if (!aiResponse.ok) return

        const aiData = (await aiResponse.json()) as { signals?: string[]; summary?: string | null }
        if (!cancelled) {
          setSignals(aiData.signals ?? [])
          setAiSummary(aiData.summary ?? null)
        }
      } catch (error) {
        if (isAbortError(error)) return
      } finally {
        if (!cancelled) {
          setFetching(false)
          setSignalsLoading(false)
        }
      }
    }

    void loadPanelData()

    return () => {
      cancelled = true
      setAiSummary(null)
      controller.abort()
    }
  }, [nook.id, nook.photo])

  const rating = detail?.rating ?? nook.rating
  const openNow = detail?.regularOpeningHours?.openNow
  const hours = detail?.regularOpeningHours?.weekdayDescriptions
    ? todayHours(detail.regularOpeningHours.weekdayDescriptions)
    : null
  const reviewSummary =
    detail?.reviewSummary?.text?.text ??
    detail?.generativeSummary?.overview?.text ??
    aiSummary ??
    null
  const summaryAttribution =
    reviewSummary === aiSummary && aiSummary != null
      ? 'Summarized with AI'
      : detail?.reviewSummary?.disclosureText?.text ?? 'Summarized with Gemini'

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
                {NOOK_TYPE_LABELS[nook.type]}
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
        {photo && (
          <div className="relative h-48 overflow-hidden rounded-2xl border border-border bg-muted">
            <Image
              src={buildPlacePhotoUrl(photo.ref, 900)}
              alt={nook.name}
              fill
              sizes="300px"
              unoptimized
              loading="eager"
              fetchPriority="high"
              className="object-cover"
            />
            <PlacePhotoAttribution attributions={photo.authorAttributions} />
          </div>
        )}

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

        {(fetching || signalsLoading || reviewSummary) && (
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              review summary
            </p>
            {fetching || signalsLoading ? (
              <div className="space-y-2">
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              </div>
            ) : reviewSummary ? (
              <>
                <p className="text-sm leading-6 text-foreground">{reviewSummary}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">{summaryAttribution}</p>
              </>
            ) : null}
          </div>
        )}

        {(signalsLoading || signals.length > 0) && (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              work signals
            </p>
            {signalsLoading ? (
              <div className="flex flex-wrap gap-2">
                <div className="h-7 w-24 animate-pulse rounded-full bg-muted" />
                <div className="h-7 w-28 animate-pulse rounded-full bg-muted" />
                <div className="h-7 w-16 animate-pulse rounded-full bg-muted" />
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {signals.map(signal => (
                  <span
                    key={signal}
                    className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                  >
                    {signalIcon(signal)}
                    {signal}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

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
