import type { PassportPlacePreview } from '@/lib/google-places'

export interface PassportVisitRow {
  id: string
  nook_id: string
  stamped_at: string
}

export interface PassportVisit {
  id: string
  visitedAt: string
}

export interface PassportStampAggregate {
  nookId: string
  firstVisitedAt: string
  latestVisitedAt: string
  visitsCount: number
  visits: PassportVisit[]
}

export interface PassportStampRecord extends PassportStampAggregate {
  place: PassportPlacePreview | null
}

export interface PassportCheckInSummary {
  hasVisits: boolean
  firstVisitedAt: string | null
  latestVisitedAt: string | null
  visitsCount: number
  visits: PassportVisit[]
}

export const EMPTY_PASSPORT_CHECK_IN_SUMMARY: PassportCheckInSummary = {
  hasVisits: false,
  firstVisitedAt: null,
  latestVisitedAt: null,
  visitsCount: 0,
  visits: [],
}

export const PASSPORT_CHECK_IN_COOLDOWN_MS = 5 * 60 * 1000

export function getPassportCheckInCooldownCutoff(now = Date.now()): string {
  return new Date(now - PASSPORT_CHECK_IN_COOLDOWN_MS).toISOString()
}

export function groupPassportVisits(
  rows: PassportVisitRow[],
): PassportStampAggregate[] {
  const grouped = new Map<string, PassportStampAggregate>()
  const sortedRows = [...rows].sort(
    (a, b) => new Date(b.stamped_at).getTime() - new Date(a.stamped_at).getTime(),
  )

  for (const row of sortedRows) {
    const existing = grouped.get(row.nook_id)
    const visit = {
      id: row.id,
      visitedAt: row.stamped_at,
    }

    if (!existing) {
      grouped.set(row.nook_id, {
        nookId: row.nook_id,
        firstVisitedAt: row.stamped_at,
        latestVisitedAt: row.stamped_at,
        visitsCount: 1,
        visits: [visit],
      })
      continue
    }

    existing.visits.push(visit)
    existing.visitsCount += 1

    if (new Date(row.stamped_at).getTime() < new Date(existing.firstVisitedAt).getTime()) {
      existing.firstVisitedAt = row.stamped_at
    }
  }

  return Array.from(grouped.values()).sort(
    (a, b) => new Date(b.latestVisitedAt).getTime() - new Date(a.latestVisitedAt).getTime(),
  )
}

export function summarizePassportVisits(
  rows: PassportVisitRow[],
): PassportCheckInSummary {
  const stamp = groupPassportVisits(rows)[0]
  if (!stamp) return EMPTY_PASSPORT_CHECK_IN_SUMMARY

  return {
    hasVisits: true,
    firstVisitedAt: stamp.firstVisitedAt,
    latestVisitedAt: stamp.latestVisitedAt,
    visitsCount: stamp.visitsCount,
    visits: stamp.visits,
  }
}
