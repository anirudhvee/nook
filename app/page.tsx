'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'

// Mapbox GL accesses window/document — must be client-only (ssr: false requires a Client Component in Next 16)
const DiscoveryMap = dynamic(
  () => import('@/components/map/DiscoveryMap').then(m => m.DiscoveryMap),
  { ssr: false }
)

export default function HomePage() {
  return (
    <Suspense fallback={<div className="h-screen w-screen bg-muted" />}>
      <DiscoveryMap />
    </Suspense>
  )
}
