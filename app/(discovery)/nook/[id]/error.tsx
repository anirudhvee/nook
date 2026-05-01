'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function NookError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error('[nook/[id]] route error:', error)
  }, [error])

  return (
    <div className="absolute top-[140px] left-4 right-4 md:top-[72px] md:right-auto md:bottom-6 md:w-[300px] z-30 flex flex-col rounded-2xl bg-background/95 backdrop-blur-sm shadow-lg border border-border overflow-hidden p-6">
      <h2 className="font-display text-2xl tracking-tight">Something went wrong</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        We couldn&apos;t load this nook. Try again, or head back to the map.
      </p>
      {process.env.NODE_ENV !== 'production' && error.message && (
        <p className="mt-2 text-xs font-mono text-muted-foreground/70 break-words">
          {error.message}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium bg-primary text-primary-foreground"
        >
          Retry
        </button>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium border border-border"
        >
          Back to map
        </Link>
      </div>
    </div>
  )
}
