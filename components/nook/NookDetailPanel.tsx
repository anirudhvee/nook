'use client'

import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ChevronUp,
  MapPin,
  Clock,
  CirclePlus,
  History,
  Wifi,
  Plug,
  Volume2,
  Laptop,
  Globe,
  Phone,
} from 'lucide-react'
import {
  EMPTY_PASSPORT_CHECK_IN_SUMMARY,
  type PassportCheckInSummary,
} from '@/lib/passport'
import { dispatchOpenAuthModal } from '@/lib/auth-modal'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { getPassportUrl } from '@/components/map/passportRoute'
import { NOOK_TYPE_LABELS } from '@/types/nook'
import type { NookPlace } from '@/types/nook'

interface WorkSignalSummary {
  report_count: number
  wifi_great: number
  wifi_okay: number
  wifi_none: number
  outlets_plenty: number
  outlets_few: number
  outlets_none: number
  noise_silent: number
  noise_quiet: number
  noise_moderate: number
  noise_loud: number
  laptop_friendly_yes: number
  laptop_friendly_no: number
  top_tags: string[] | null
}

interface NookDetails {
  google_maps_url?: string | null
}

interface NookDetail extends NookPlace {
  googleMapsUrl?: string | null
  google_maps_url?: string | null
  nook_details?: NookDetails | null
  workSignalSummary?: WorkSignalSummary | null
  work_signal_summary?: WorkSignalSummary | null
  reviewSummary?: {
    text?: {
      text?: string
    }
    disclosureText?: {
      text?: string
    }
  } | null
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

function winningSignal(
  entries: Array<{ label: string; count: number }>,
): string | null {
  const sorted = entries
    .filter(entry => entry.count > 0)
    .sort((a, b) => b.count - a.count)

  return sorted[0]?.label ?? null
}

function buildWorkSignals(summary: WorkSignalSummary | null | undefined): string[] {
  if (!summary || summary.report_count <= 0) return []

  const signals = [
    winningSignal([
      { label: 'great wifi', count: summary.wifi_great },
      { label: 'okay wifi', count: summary.wifi_okay },
      { label: 'no wifi', count: summary.wifi_none },
    ]),
    winningSignal([
      { label: 'plenty of outlets', count: summary.outlets_plenty },
      { label: 'some outlets', count: summary.outlets_few },
      { label: 'no outlets', count: summary.outlets_none },
    ]),
    winningSignal([
      { label: 'silent', count: summary.noise_silent },
      { label: 'quiet', count: summary.noise_quiet },
      { label: 'moderate noise', count: summary.noise_moderate },
      { label: 'loud', count: summary.noise_loud },
    ]),
    winningSignal([
      { label: 'laptop friendly', count: summary.laptop_friendly_yes },
      { label: 'not laptop friendly', count: summary.laptop_friendly_no },
    ]),
  ].filter((signal): signal is string => Boolean(signal))

  for (const tag of summary.top_tags ?? []) {
    if (tag && !signals.includes(tag)) signals.push(tag)
  }

  return signals.slice(0, 6)
}

interface Props {
  nook: NookPlace
  onClose: () => void
  showPeekLift?: boolean
  onPeekLift?: () => void
}

function formatCheckInDate(date: string | null): string | null {
  if (!date) return null

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

function formatLocation(city: string | null, region: string | null, country: string | null): string | null {
  const parts = [city, region, country].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

function formatWebsiteLabel(website: string): string {
  try {
    return new URL(website).hostname.replace(/^www\./, '')
  } catch {
    return 'website'
  }
}

function normalizeExternalUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

export function NookDetailPanel({ nook, onClose, showPeekLift = false, onPeekLift }: Props) {
  const [supabase] = useState(() => createBrowserSupabaseClient())
  const [detail, setDetail] = useState<NookDetail | null>(null)
  const [fetching, setFetching] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [checkInSummary, setCheckInSummary] = useState<PassportCheckInSummary>(
    EMPTY_PASSPORT_CHECK_IN_SUMMARY,
  )
  const [checkInLoading, setCheckInLoading] = useState(true)
  const [checkInSubmitting, setCheckInSubmitting] = useState(false)
  const [checkInFeedback, setCheckInFeedback] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function loadUser() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()

      if (isMounted) {
        setUser(authUser ?? null)
      }
    }

    void loadUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((
      _event: AuthChangeEvent,
      session: Session | null,
    ) => {
      if (!isMounted) return
      setUser(session?.user ?? null)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [supabase])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    setDetail(null)
    setFetching(true)

    async function loadPanelData() {
      try {
        const response = await fetch(`/api/places/${encodeURIComponent(nook.slug)}`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          return
        }

        const data = (await response.json()) as NookDetail
        if (!cancelled) {
          setDetail(data)
        }
      } catch (error) {
        if (isAbortError(error)) return
      } finally {
        if (!cancelled) setFetching(false)
      }
    }

    void loadPanelData()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [nook.slug])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    if (!user) {
      setCheckInSummary(EMPTY_PASSPORT_CHECK_IN_SUMMARY)
      setCheckInLoading(false)
      setCheckInFeedback(null)
      return () => controller.abort()
    }

    async function loadCheckInSummary() {
      setCheckInLoading(true)
      setCheckInFeedback(null)
      setCheckInSummary(EMPTY_PASSPORT_CHECK_IN_SUMMARY)

      try {
        const response = await fetch(
          `/api/passport/check-ins?nookId=${encodeURIComponent(nook.id)}`,
          {
            signal: controller.signal,
          },
        )

        if (!response.ok) {
          if (!cancelled) {
            setCheckInSummary(EMPTY_PASSPORT_CHECK_IN_SUMMARY)
          }
          return
        }

        const summary = (await response.json()) as PassportCheckInSummary
        if (!cancelled) {
          setCheckInSummary(summary)
        }
      } catch (error) {
        if (isAbortError(error)) return
        if (!cancelled) {
          setCheckInSummary(EMPTY_PASSPORT_CHECK_IN_SUMMARY)
        }
      } finally {
        if (!cancelled) {
          setCheckInLoading(false)
        }
      }
    }

    void loadCheckInSummary()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [nook.id, user])

  const address = detail?.address ?? nook.address
  const city = detail?.city ?? nook.city
  const region = detail?.region ?? nook.region
  const country = detail?.country ?? nook.country
  const website = detail?.website ?? nook.website
  const phone = detail?.phone ?? nook.phone
  const locationLabel = formatLocation(city, region, country)
  const websiteUrl = normalizeExternalUrl(website)
  const googleMapsUrl = normalizeExternalUrl(
    detail?.nook_details?.google_maps_url ??
    detail?.google_maps_url ??
    detail?.googleMapsUrl ??
    null,
  )
  const signalSummary = detail?.workSignalSummary ?? detail?.work_signal_summary ?? null
  const signals = buildWorkSignals(signalSummary)
  const workSummary = detail?.reviewSummary?.text?.text ?? null
  const summaryAttribution =
    detail?.reviewSummary?.disclosureText?.text ??
    (signalSummary && signalSummary.report_count > 0
      ? `Based on ${signalSummary.report_count} community report${signalSummary.report_count === 1 ? '' : 's'}`
      : null)
  const hasDetails = Boolean(address || websiteUrl || phone || googleMapsUrl)
  const hasVisits = checkInSummary.visitsCount > 0
  const firstVisitedLabel = formatCheckInDate(checkInSummary.firstVisitedAt)
  const showLoadingSkeleton = fetching && !detail

  async function handleCheckIn() {
    if (!user) {
      setCheckInFeedback(null)
      dispatchOpenAuthModal()
      return
    }

    setCheckInSubmitting(true)
    setCheckInFeedback(null)

    try {
      const response = await fetch('/api/passport/check-ins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nookId: nook.id,
        }),
      })

      const payload = (await response.json()) as PassportCheckInSummary & {
        error?: string
      }

      if (!response.ok) {
        setCheckInFeedback(payload.error ?? 'Unable to check in right now.')
        return
      }

      setCheckInSummary(payload)
      setCheckInFeedback(
        payload.visitsCount > 1
          ? 'Checked in again. Your Passport just got another visit.'
          : 'Checked in. Added to your Passport.',
      )
    } catch {
      setCheckInFeedback('Unable to check in right now.')
    } finally {
      setCheckInSubmitting(false)
      setCheckInLoading(false)
    }
  }

  function handleViewPreviousVisits() {
    window.history.pushState(null, '', getPassportUrl(nook.id))
  }

  return (
    <div className="flex h-full flex-col animate-in slide-in-from-left-4 duration-200">
      <div className="shrink-0 border-b border-border px-4 pt-2 pb-3 md:pt-1">
        {showPeekLift && onPeekLift ? (
          <button
            type="button"
            onClick={onPeekLift}
            className="flex w-full items-center justify-between gap-3 text-left transition-colors hover:text-foreground"
          >
            {showLoadingSkeleton ? (
              <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
            ) : (
              <h2 className="min-w-0 flex-1 break-words text-base font-semibold leading-snug">{nook.name}</h2>
            )}
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-primary shadow-sm">
              <ChevronUp className="h-4 w-4" strokeWidth={2.25} />
            </span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Back to list"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            {showLoadingSkeleton ? (
              <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
            ) : (
              <h2 className="min-w-0 flex-1 break-words text-base font-semibold leading-snug">{nook.name}</h2>
            )}
          </div>
        )}

        {!fetching && !showPeekLift && (
          <div className="mt-1.5 ml-6 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {NOOK_TYPE_LABELS[nook.type]}
            </span>
            {locationLabel && (
              <span className="text-xs text-muted-foreground">{locationLabel}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 pt-3 pb-4">
        {hasDetails && (
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              details
            </p>
            <div className="space-y-2.5">
              {address && (
                <div className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm leading-snug">{address}</span>
                </div>
              )}

              {websiteUrl && (
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-2.5 text-sm text-primary transition-colors hover:underline"
                >
                  <Globe className="h-4 w-4 shrink-0" />
                  {formatWebsiteLabel(websiteUrl)}
                </a>
              )}

              {phone && (
                <a
                  href={`tel:${phone}`}
                  className="flex items-center gap-2.5 text-sm text-primary transition-colors hover:underline"
                >
                  <Phone className="h-4 w-4 shrink-0" />
                  {phone}
                </a>
              )}

              {googleMapsUrl && (
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-2.5 text-sm text-primary transition-colors hover:underline"
                >
                  <Clock className="h-4 w-4 shrink-0" />
                  view hours and directions
                </a>
              )}
            </div>
          </div>
        )}

        {((showLoadingSkeleton && !workSummary) || workSummary) && (
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              work summary
            </p>
            {showLoadingSkeleton ? (
              <div className="space-y-2">
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              </div>
            ) : workSummary ? (
              <>
                <p className="text-sm leading-6 text-foreground">{workSummary}</p>
                {summaryAttribution && (
                  <p className="mt-2 text-[11px] text-muted-foreground">{summaryAttribution}</p>
                )}
              </>
            ) : null}
          </div>
        )}

        {((showLoadingSkeleton && signals.length === 0) || signals.length > 0) && (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              work signals
            </p>
            {showLoadingSkeleton ? (
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

        <div className="rounded-2xl border border-primary/15 bg-primary/8 p-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">
              passport
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {checkInLoading
                ? 'checking your visit history...'
                : hasVisits
                  ? `${checkInSummary.visitsCount} visit${checkInSummary.visitsCount === 1 ? '' : 's'} logged`
                  : 'no check-ins yet'}
            </p>
            {hasVisits && firstVisitedLabel ? (
              <p className="mt-1 text-xs text-muted-foreground">
                First visit {firstVisitedLabel}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Check in when you start working from this nook.
              </p>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            {hasVisits ? (
              <>
                <button
                  onClick={handleViewPreviousVisits}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:flex-1"
                >
                  <History className="h-4 w-4" />
                  view previous visits
                </button>
                <button
                  onClick={handleCheckIn}
                  disabled={checkInSubmitting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-60 sm:flex-1"
                >
                  <CirclePlus className="h-4 w-4" />
                  {checkInSubmitting ? 'checking in...' : 'check in again'}
                </button>
              </>
            ) : (
              <button
                onClick={handleCheckIn}
                disabled={checkInSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-60"
              >
                <CirclePlus className="h-4 w-4" />
                {checkInSubmitting
                  ? 'checking in...'
                  : user
                    ? 'check in to nook'
                    : 'sign in to check in'}
              </button>
            )}
          </div>

          {checkInFeedback ? (
            <p className="mt-2 text-xs text-muted-foreground">{checkInFeedback}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
