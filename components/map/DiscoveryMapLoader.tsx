'use client'

import dynamic from 'next/dynamic'
import type { NookPlace } from '@/types/nook'

// dynamic() with ssr: false must live in a Client Component in Next.js 16
const DiscoveryMap = dynamic(
  () => import('@/components/map/DiscoveryMap').then(m => m.DiscoveryMap),
  { ssr: false }
)

export function DiscoveryMapLoader({
  initialCenter,
  initialSelectedNook = null,
}: {
  initialCenter: [number, number]
  initialSelectedNook?: NookPlace | null
}) {
  return <DiscoveryMap initialCenter={initialCenter} initialSelectedNook={initialSelectedNook} />
}
