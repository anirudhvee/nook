'use client'

import dynamic from 'next/dynamic'

// dynamic() with ssr: false must live in a Client Component in Next.js 16
const DiscoveryMap = dynamic(
  () => import('@/components/map/DiscoveryMap').then(m => m.DiscoveryMap),
  { ssr: false }
)

export function DiscoveryMapLoader({ initialCenter }: { initialCenter: [number, number] }) {
  return <DiscoveryMap initialCenter={initialCenter} />
}
