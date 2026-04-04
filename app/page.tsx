'use client'

import dynamic from 'next/dynamic'

// Mapbox GL accesses window/document — must be client-only (ssr: false requires a Client Component in Next 16)
const DiscoveryMap = dynamic(
  () => import('@/components/map/DiscoveryMap').then(m => m.DiscoveryMap),
  {
    ssr: false,
    loading: () => <div className="h-screen w-screen bg-muted" />,
  }
)

export default function HomePage() {
  return <DiscoveryMap />
}
