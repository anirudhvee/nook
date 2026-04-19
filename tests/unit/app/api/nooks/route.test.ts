import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest } from 'next/server'
import { GET } from '../../../../../app/api/nooks/route'

test('GET passes proximity bias to Geoapify and returns normalized suggestions', async () => {
  const originalFetch = global.fetch
  process.env.GEOAPIFY_API_KEY = 'test-key'

  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input)

    assert.match(url, /text=starbucks/)
    assert.match(url, /bias=proximity%3A-122\.4194%2C37\.7749/)
    assert.match(url, /apiKey=test-key/)
    assert.match(url, /lang=en/)

    return new Response(JSON.stringify({
      results: [
        {
          place_id: 'geoapify-poi',
          name: 'Starbucks',
          housenumber: '150',
          street: 'Van Ness Avenue',
          address_line1: '150 Van Ness Avenue',
          address_line2: 'San Francisco, California 94102, United States',
          formatted: 'Starbucks, 150 Van Ness Avenue, San Francisco, California 94102, United States',
          lat: 37.7764,
          lon: -122.4192,
          result_type: 'amenity',
          category: 'catering.cafe',
          city: 'San Francisco',
          state: 'California',
          country: 'United States',
          country_code: 'us',
        },
      ],
    }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    })
  }) as typeof fetch

  try {
    const request = new NextRequest('http://localhost:3000/api/nooks?q=starbucks&lat=37.7749&lng=-122.4194', {
      headers: {
        'accept-language': 'en-US,en;q=0.9',
      },
    })
    const response = await GET(request)
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.equal(payload.unavailable, false)
    assert.equal(payload.suggestions[0]?.name, 'Starbucks')
    assert.equal(payload.suggestions[0]?.lng, -122.4192)
    assert.equal(payload.suggestions[0]?.lat, 37.7764)
  } finally {
    global.fetch = originalFetch
  }
})

test('GET returns a temporary unavailable state when Geoapify quota is exhausted', async () => {
  const originalFetch = global.fetch
  process.env.GEOAPIFY_API_KEY = 'test-key'

  global.fetch = (async () => {
    return new Response(JSON.stringify({ error: 'Quota exceeded' }), {
      status: 429,
      headers: {
        'content-type': 'application/json',
      },
    })
  }) as typeof fetch

  try {
    const request = new NextRequest('http://localhost:3000/api/nooks?q=starbucks')
    const response = await GET(request)
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.deepEqual(payload, {
      suggestions: [],
      unavailable: true,
    })
  } finally {
    global.fetch = originalFetch
  }
})
