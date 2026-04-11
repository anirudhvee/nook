import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EMPTY_PASSPORT_CHECK_IN_SUMMARY,
  groupPassportVisits,
  summarizePassportVisits,
} from '../../../lib/passport'

test('groupPassportVisits collapses many rows into one stamp per nook', () => {
  const grouped = groupPassportVisits([
    { id: 'visit-1', nook_id: 'place-a', stamped_at: '2026-04-09T10:00:00.000Z' },
    { id: 'visit-2', nook_id: 'place-b', stamped_at: '2026-04-10T14:00:00.000Z' },
    { id: 'visit-3', nook_id: 'place-a', stamped_at: '2026-04-11T09:30:00.000Z' },
  ])

  assert.equal(grouped.length, 2)
  assert.equal(grouped[0].nookId, 'place-a')
  assert.equal(grouped[0].visitsCount, 2)
  assert.equal(grouped[0].firstVisitedAt, '2026-04-09T10:00:00.000Z')
  assert.equal(grouped[0].latestVisitedAt, '2026-04-11T09:30:00.000Z')
  assert.deepEqual(grouped[0].visits.map(visit => visit.id), ['visit-3', 'visit-1'])
})

test('summarizePassportVisits returns an empty summary when there are no visits', () => {
  assert.deepEqual(summarizePassportVisits([]), EMPTY_PASSPORT_CHECK_IN_SUMMARY)
})

test('summarizePassportVisits returns the per-place visit summary for the panel', () => {
  const summary = summarizePassportVisits([
    { id: 'visit-1', nook_id: 'place-a', stamped_at: '2026-04-09T10:00:00.000Z' },
    { id: 'visit-2', nook_id: 'place-a', stamped_at: '2026-04-11T09:30:00.000Z' },
  ])

  assert.equal(summary.hasVisits, true)
  assert.equal(summary.visitsCount, 2)
  assert.equal(summary.firstVisitedAt, '2026-04-09T10:00:00.000Z')
  assert.equal(summary.latestVisitedAt, '2026-04-11T09:30:00.000Z')
})
