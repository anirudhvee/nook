'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, LoaderCircle, Ticket } from 'lucide-react'
import { PassportPageClient } from '@/components/passport/PassportPageClient'
import { dispatchOpenAuthModal } from '@/lib/auth-modal'
import type { PassportStampRecord } from '@/lib/passport'

interface PassportResponse {
  stamps: PassportStampRecord[]
  totalCheckIns: number
  error?: string
}

export interface PassportPin {
  nookId: string
  lat: number
  lng: number
}

interface Props {
  onClose: () => void
  onStampsLoaded?: (pins: PassportPin[]) => void
  onStampExpand?: () => void
}

export function PassportOverlay({ onClose, onStampsLoaded, onStampExpand }: Props) {
  const searchParams = useSearchParams()
  const highlightedNookId = searchParams.get('highlight')
  const [data, setData] = useState<PassportResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function loadPassport() {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/passport', {
          signal: controller.signal,
        })

        const payload = (await response.json()) as PassportResponse

        if (!response.ok) {
          if (!cancelled) {
            if (response.status === 401) {
              dispatchOpenAuthModal()
              onClose()
              return
            }
            setError(payload.error ?? 'Passport could not be loaded right now.')
          }
          return
        }

        if (!cancelled) {
          setData(payload)

          const pins: PassportPin[] = payload.stamps.flatMap(stamp => {
            const lat = stamp.place?.lat
            const lng = stamp.place?.lng
            if (lat == null || lng == null) return []
            return [{ nookId: stamp.nookId, lat, lng }]
          })
          onStampsLoaded?.(pins)
        }
      } catch (fetchError) {
        if (cancelled) return
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return
        setError('Passport could not be loaded right now.')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadPassport()

    return () => {
      cancelled = true
      controller.abort()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex h-full flex-col animate-in slide-in-from-right-4 duration-200">
      <div className="shrink-0 px-5 pt-2 pb-4 md:pt-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
            aria-label="Close passport"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[1.95rem] leading-[1.02] tracking-[-0.02em] text-foreground">
              My Passport
            </h2>
            <p className="meta-mono mt-1 text-[10px] uppercase text-muted-foreground/80">
              Stamps collected from every nook
            </p>
          </div>
        </div>
      </div>

      <div className="hairline mx-5" aria-hidden />

      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-5">
        {loading ? (
          <div className="flex min-h-[12rem] flex-col items-center justify-center">
            <LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="mt-3 font-display italic text-[0.95rem] text-muted-foreground">
              loading stamps…
            </p>
          </div>
        ) : error ? (
          <div className="flex min-h-[12rem] flex-col items-center justify-center text-center">
            <Ticket className="h-5 w-5 text-muted-foreground/80" />
            <p className="font-display mt-3 text-[1.25rem] leading-[1.1] tracking-[-0.01em]">
              passport unavailable
            </p>
            <p className="mt-1.5 max-w-sm text-[12.5px] text-muted-foreground">
              {error}
            </p>
          </div>
        ) : data ? (
          <PassportPageClient
            stamps={data.stamps}
            totalCheckIns={data.totalCheckIns}
            highlightedNookId={highlightedNookId}
            isCompact
            onExpand={onStampExpand}
          />
        ) : null}
      </div>
    </div>
  )
}
