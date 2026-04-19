import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAddressFallbackQuery,
  buildPartialAddressFallbackQuery,
  buildSuggestionFallback,
  mergeSuggestionResults,
  mergeSuggestions,
  resolvePrimaryThenOptionalFallback,
} from '@/components/map/searchPillQuery'
import type { SearchSuggestion } from '@/components/map/searchTypes'

function makeSuggestion(id: string): SearchSuggestion {
  return {
    name: id,
    namePreferred: id,
    id,
    placeId: id,
    featureType: 'poi',
    address: '',
    fullAddress: '',
    placeFormatted: '',
    context: {},
    lat: 0,
    lng: 0,
    category: '',
    type: '',
    importance: 0,
    placeRank: null,
  }
}

test('buildAddressFallbackQuery removes a house number from brand-first queries', () => {
  assert.equal(
    buildAddressFallbackQuery('starbucks 150 van ness avenue'),
    'starbucks van ness avenue'
  )
})

test('buildAddressFallbackQuery removes a leading house number when extra query text follows the address', () => {
  assert.equal(
    buildAddressFallbackQuery('150 van ness avenue starbucks'),
    'van ness avenue starbucks'
  )
})

test('buildAddressFallbackQuery skips pure address queries', () => {
  assert.equal(buildAddressFallbackQuery('150 van ness avenue'), null)
})

test('buildAddressFallbackQuery skips queries without a plain house number', () => {
  assert.equal(buildAddressFallbackQuery('starbucks 24th street'), null)
})

test('buildAddressFallbackQuery skips venue names that only contain a number', () => {
  assert.equal(buildAddressFallbackQuery('cafe 86'), null)
  assert.equal(buildAddressFallbackQuery('studio 54 coffee'), null)
})

test('buildAddressFallbackQuery removes the address number instead of a numeric brand token', () => {
  assert.equal(
    buildAddressFallbackQuery('7 eleven 150 market street'),
    '7 eleven market street'
  )
})

test('buildAddressFallbackQuery skips ambiguous numeric-brand locality queries', () => {
  assert.equal(buildAddressFallbackQuery('7 eleven market street san francisco'), null)
  assert.equal(buildSuggestionFallback('7 eleven market street san francisco'), null)
})

test('buildAddressFallbackQuery skips street-type abbreviations inside street names', () => {
  assert.equal(
    buildAddressFallbackQuery('starbucks 150 st john street'),
    'starbucks st john street'
  )
  assert.deepEqual(buildSuggestionFallback('starbucks 150 st john street'), {
    addressTokens: ['150', 'street', 'john', 'street'],
    promotionTokens: ['starbucks'],
    query: 'starbucks st john street',
  })
})

test('buildPartialAddressFallbackQuery removes a house number for partial street queries', () => {
  assert.equal(buildPartialAddressFallbackQuery('starbucks 233 wi'), 'starbucks wi')
  assert.equal(buildPartialAddressFallbackQuery('starbucks 150 van'), 'starbucks van')
})

test('buildPartialAddressFallbackQuery skips short numeric brand tokens', () => {
  assert.equal(buildPartialAddressFallbackQuery('cafe 86 wi'), null)
  assert.equal(buildPartialAddressFallbackQuery('studio 54 win'), null)
})

test('buildSuggestionFallback prefers full address fallback over partial street fallback', () => {
  assert.deepEqual(buildSuggestionFallback('starbucks 150 van ness avenue'), {
    addressTokens: ['150', 'van', 'ness', 'avenue'],
    promotionTokens: ['starbucks'],
    query: 'starbucks van ness avenue',
  })
  assert.deepEqual(buildSuggestionFallback('starbucks 233 wi'), {
    addressTokens: ['233', 'wi'],
    promotionTokens: ['starbucks'],
    query: 'starbucks wi',
  })
  assert.deepEqual(buildSuggestionFallback('150 market street san francisco'), {
    addressTokens: ['150', 'market', 'street'],
    promotionTokens: ['san', 'francisco'],
    query: 'market street san francisco',
  })
  assert.deepEqual(buildSuggestionFallback('10 market street starbucks'), {
    addressTokens: ['10', 'market', 'street'],
    promotionTokens: ['starbucks'],
    query: 'market street starbucks',
  })
  assert.deepEqual(buildSuggestionFallback('150 market street starbucks san francisco'), {
    addressTokens: ['150', 'market', 'street'],
    promotionTokens: ['starbucks', 'san', 'francisco'],
    query: 'market street starbucks san francisco',
  })
})

test('mergeSuggestions de-duplicates while preserving order', () => {
  const merged = mergeSuggestions(
    [makeSuggestion('a'), makeSuggestion('b')],
    [makeSuggestion('b'), makeSuggestion('c')],
    5
  )

  assert.deepEqual(merged.map(suggestion => suggestion.id), ['a', 'b', 'c'])
})

test('mergeSuggestions respects the result limit', () => {
  const merged = mergeSuggestions(
    [makeSuggestion('a'), makeSuggestion('b'), makeSuggestion('c')],
    [makeSuggestion('d')],
    2
  )

  assert.deepEqual(merged.map(suggestion => suggestion.id), ['a', 'b'])
})

test('resolvePrimaryThenOptionalFallback returns both results when both succeed', async () => {
  let seenPrimary: string | null = null

  const result = await resolvePrimaryThenOptionalFallback(
    Promise.resolve('primary'),
    Promise.resolve('fallback'),
    primary => {
      seenPrimary = primary
    }
  )

  assert.equal(seenPrimary, 'primary')
  assert.deepEqual(result, ['primary', 'fallback'])
})

test('resolvePrimaryThenOptionalFallback ignores fallback failures', async () => {
  let seenPrimary: string | null = null

  const result = await resolvePrimaryThenOptionalFallback(
    Promise.resolve('primary'),
    Promise.reject(new Error('fallback failed')),
    primary => {
      seenPrimary = primary
    }
  )

  assert.equal(seenPrimary, 'primary')
  assert.deepEqual(result, ['primary', null])
})

test('resolvePrimaryThenOptionalFallback still rejects primary failures', async () => {
  await assert.rejects(() => {
    return resolvePrimaryThenOptionalFallback(
      Promise.reject(new Error('primary failed')),
      Promise.resolve('fallback'),
      () => undefined
    )
  })
})

test('resolvePrimaryThenOptionalFallback settles fallback rejection even when primary fails', async () => {
  const unhandledRejections: unknown[] = []
  const handleUnhandledRejection = (reason: unknown) => {
    unhandledRejections.push(reason)
  }

  process.on('unhandledRejection', handleUnhandledRejection)

  try {
    await assert.rejects(() => {
      return resolvePrimaryThenOptionalFallback(
        Promise.reject(new Error('primary failed')),
        Promise.reject(new Error('fallback failed')),
        () => undefined
      )
    })

    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(unhandledRejections, [])
  } finally {
    process.off('unhandledRejection', handleUnhandledRejection)
  }
})

test('resolvePrimaryThenOptionalFallback exposes primary results before fallback resolves', async () => {
  let resolvePrimary!: (value: string) => void
  let resolveFallback!: (value: string) => void
  let seenPrimary: string | null = null

  const primaryPromise = new Promise<string>(resolve => {
    resolvePrimary = resolve
  })
  const fallbackPromise = new Promise<string>(resolve => {
    resolveFallback = resolve
  })

  const resultPromise = resolvePrimaryThenOptionalFallback(
    primaryPromise,
    fallbackPromise,
    primary => {
      seenPrimary = primary
    }
  )

  resolvePrimary('primary')
  await Promise.resolve()

  assert.equal(seenPrimary, 'primary')

  resolveFallback('fallback')
  assert.deepEqual(await resultPromise, ['primary', 'fallback'])
})

test('mergeSuggestionResults promotes fallback POIs that match the typed address prefix', () => {
  const primary = [
    {
      ...makeSuggestion('address-1'),
      featureType: 'address',
      address: '233 Winston Drive',
      fullAddress: '233 Winston Drive, San Francisco, California 94132, United States',
      name: '233 Winston Drive',
    },
    {
      ...makeSuggestion('address-2'),
      featureType: 'address',
      address: '233 Willow Street',
      fullAddress: '233 Willow Street, San Francisco, California 94109, United States',
      name: '233 Willow Street',
    },
  ] as SearchSuggestion[]

  const fallback = [
    {
      ...makeSuggestion('poi-1'),
      featureType: 'poi',
      name: 'Starbucks',
      address: '233 Winston Drive',
      fullAddress: '233 Winston Drive, San Francisco, California 94132, United States',
    },
    {
      ...makeSuggestion('poi-2'),
      featureType: 'poi',
      name: 'Starbucks',
      address: '201 Mission Street',
      fullAddress: '201 Mission Street, San Francisco, California 94105, United States',
    },
  ] as SearchSuggestion[]

  const merged = mergeSuggestionResults(
    primary,
    fallback,
    { addressTokens: ['233', 'wi'], promotionTokens: ['starbucks'], query: 'starbucks wi' },
    5
  )

  assert.deepEqual(merged.map(suggestion => suggestion.id), ['poi-1', 'address-1', 'address-2', 'poi-2'])
})

test('mergeSuggestionResults requires an exact house-number match before promoting a fallback POI', () => {
  const primary = [
    {
      ...makeSuggestion('address-1'),
      featureType: 'address',
      address: '150 Van Ness Avenue',
      fullAddress: '150 Van Ness Avenue, San Francisco, California 94102, United States',
      name: '150 Van Ness Avenue',
    },
  ] as SearchSuggestion[]

  const fallback = [
    {
      ...makeSuggestion('poi-1500'),
      featureType: 'poi',
      name: 'Starbucks',
      address: '1500 Van Ness Avenue',
      fullAddress: '1500 Van Ness Avenue, San Francisco, California 94109, United States',
    },
    {
      ...makeSuggestion('poi-150'),
      featureType: 'poi',
      name: 'Starbucks',
      address: '150 Van Ness Avenue',
      fullAddress: '150 Van Ness Avenue, San Francisco, California 94102, United States',
    },
  ] as SearchSuggestion[]

  const merged = mergeSuggestionResults(
    primary,
    fallback,
    { addressTokens: ['150', 'van', 'ness'], promotionTokens: ['starbucks'], query: 'starbucks van ness' },
    5
  )

  assert.deepEqual(merged.map(suggestion => suggestion.id), ['poi-150', 'address-1', 'poi-1500'])
})

test('mergeSuggestionResults skips promotion when fallback only matches locality tokens', () => {
  const primary = [
    {
      ...makeSuggestion('address-1'),
      featureType: 'address',
      address: '150 Market Street',
      fullAddress: '150 Market Street, San Francisco, California 94105, United States',
      name: '150 Market Street',
    },
  ] as SearchSuggestion[]

  const fallback = [
    {
      ...makeSuggestion('poi-1'),
      featureType: 'poi',
      name: 'Starbucks',
      address: '150 Market Street',
      fullAddress: '150 Market Street, San Francisco, California 94105, United States',
    },
  ] as SearchSuggestion[]

  const merged = mergeSuggestionResults(
    primary,
    fallback,
    {
      addressTokens: ['150', 'market', 'street'],
      promotionTokens: ['san', 'francisco'],
      query: 'market street san francisco',
    },
    5
  )

  assert.deepEqual(merged.map(suggestion => suggestion.id), ['address-1', 'poi-1'])
})

test('mergeSuggestionResults ignores trailing locality tokens after a matched venue name', () => {
  const primary = [
    {
      ...makeSuggestion('address-1'),
      featureType: 'address',
      address: '150 Market Street',
      fullAddress: '150 Market Street, San Francisco, California 94105, United States',
      name: '150 Market Street',
    },
  ] as SearchSuggestion[]

  const fallback = [
    {
      ...makeSuggestion('poi-1'),
      featureType: 'poi',
      name: 'Starbucks',
      address: '150 Market Street',
      fullAddress: '150 Market Street, San Francisco, California 94105, United States',
    },
  ] as SearchSuggestion[]

  const merged = mergeSuggestionResults(
    primary,
    fallback,
    {
      addressTokens: ['150', 'market', 'street'],
      promotionTokens: ['starbucks', 'san', 'francisco'],
      query: 'market street starbucks san francisco',
    },
    5
  )

  assert.deepEqual(merged.map(suggestion => suggestion.id), ['poi-1', 'address-1'])
})

test('mergeSuggestionResults promotes POIs for street names that include street-type abbreviations', () => {
  const primary = [
    {
      ...makeSuggestion('address-1'),
      featureType: 'address',
      address: '150 St John Street',
      fullAddress: '150 St John Street, San Jose, California 95113, United States',
      name: '150 St John Street',
    },
  ] as SearchSuggestion[]

  const fallback = [
    {
      ...makeSuggestion('poi-1'),
      featureType: 'poi',
      name: 'Starbucks',
      address: '150 St John Street',
      fullAddress: '150 St John Street, San Jose, California 95113, United States',
    },
  ] as SearchSuggestion[]

  const merged = mergeSuggestionResults(
    primary,
    fallback,
    {
      addressTokens: ['150', 'street', 'john', 'street'],
      promotionTokens: ['starbucks'],
      query: 'starbucks st john street',
    },
    5
  )

  assert.deepEqual(merged.map(suggestion => suggestion.id), ['poi-1', 'address-1'])
})
