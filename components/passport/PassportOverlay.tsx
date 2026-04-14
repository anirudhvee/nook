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
      <div className="shrink-0 border-b border-border px-4 pt-2 pb-3">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-base font-semibold transition-colors hover:text-foreground/70"
        >
          <ArrowLeft className="h-4 w-4 text-muted-foreground shrink-0" />
          my passport
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
        {loading ? (
          <div className="flex min-h-[12rem] flex-col items-center justify-center">
            <LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="mt-3 text-xs text-muted-foreground">
              loading stamps...
            </p>
          </div>
        ) : error ? (
          <div className="flex min-h-[12rem] flex-col items-center justify-center text-center">
            <Ticket className="h-5 w-5 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">passport unavailable</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
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
