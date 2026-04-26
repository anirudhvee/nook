import type { PassportStampRecord } from '@/lib/passport'

interface StampPalette {
  paper: string
  ink: string
  inkSoft: string
  accent: string
}

const PALETTES: Record<string, StampPalette> = {
  cafe: {
    paper: '#f4ead0',
    ink: '#c75a2a',
    inkSoft: 'rgba(199, 90, 42, 0.72)',
    accent: '#3a2014',
  },
  library: {
    paper: '#ece5d0',
    ink: '#364675',
    inkSoft: 'rgba(54, 70, 117, 0.72)',
    accent: '#1d2440',
  },
  coworking: {
    paper: '#e9e3c8',
    ink: '#2c5739',
    inkSoft: 'rgba(44, 87, 57, 0.72)',
    accent: '#1a2e1f',
  },
  other: {
    paper: '#efe3c5',
    ink: '#a3402e',
    inkSoft: 'rgba(163, 64, 46, 0.72)',
    accent: '#3a1916',
  },
}

export function getPalette(type?: string | null): StampPalette {
  return PALETTES[type ?? 'other'] ?? PALETTES.other
}

export type { StampPalette }

function getPlaceInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'NK'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

function formatStampDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(iso))
    .toUpperCase()
}

const TYPE_LABEL: Record<string, string> = {
  cafe: 'café',
  library: 'library',
  coworking: 'coworking',
  other: 'nook',
}

const STREET_ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bStreet\b/gi, 'St'],
  [/\bAvenue\b/gi, 'Ave'],
  [/\bBoulevard\b/gi, 'Blvd'],
  [/\bDrive\b/gi, 'Dr'],
  [/\bRoad\b/gi, 'Rd'],
  [/\bPlace\b/gi, 'Pl'],
  [/\bSquare\b/gi, 'Sq'],
  [/\bHighway\b/gi, 'Hwy'],
  [/\bLane\b/gi, 'Ln'],
  [/\bCourt\b/gi, 'Ct'],
  [/\bTerrace\b/gi, 'Ter'],
  [/\bParkway\b/gi, 'Pkwy'],
  [/\bSuite\b/gi, 'Ste'],
]

function formatStreet(address: string | null | undefined, maxLen = 22): string | null {
  if (!address) return null
  const first = address.split(',')[0]?.trim()
  if (!first) return null
  let abbreviated = first
  for (const [pattern, replacement] of STREET_ABBREVIATIONS) {
    abbreviated = abbreviated.replace(pattern, replacement)
  }
  abbreviated = abbreviated.toUpperCase().trim()
  if (abbreviated.length > maxLen) {
    abbreviated = `${abbreviated.slice(0, maxLen - 1).trimEnd()}…`
  }
  return abbreviated
}

function formatLat(lat: number): string {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`
}

function formatLng(lng: number): string {
  return `${Math.abs(lng).toFixed(2)}°${lng >= 0 ? 'E' : 'W'}`
}

interface Props {
  stamp: PassportStampRecord
  userInitials: string
  mapImageUrl?: string | null
}

export function NookStamp({ stamp, userInitials, mapImageUrl }: Props) {
  const place = stamp.place
  const palette = getPalette(place?.type)
  const name = place?.name ?? 'Unknown Nook'
  const placeInitials = getPlaceInitials(name)
  const cityLabel = (place?.city ?? place?.locationLine ?? '').toUpperCase()
  const typeLabel = TYPE_LABEL[place?.type ?? 'other'].toUpperCase()
  const streetLabel = formatStreet(place?.address)
  const metaLeft = streetLabel ? `${typeLabel} · ${streetLabel}` : typeLabel
  const dateLabel = formatStampDate(stamp.firstVisitedAt)
  const lat = place?.lat ?? null
  const lng = place?.lng ?? null
  const hasCoords = typeof lat === 'number' && typeof lng === 'number'
  const latLabel = hasCoords ? formatLat(lat as number) : null
  const lngLabel = hasCoords ? formatLng(lng as number) : null

  // Title typographic scaling — bold sans uppercase, pushed large.
  const upperName = name.toUpperCase()
  const titleSize =
    upperName.length > 28 ? 17 : upperName.length > 20 ? 21 : upperName.length > 14 ? 26 : 32

  const id = `stamp-${stamp.nookId}`

  return (
    <svg
      viewBox="0 0 240 340"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`Passport stamp for ${name}`}
      style={{ display: 'block', width: '100%', height: 'auto' }}
    >
      <defs>
        {/* Halftone dot grain — uniform texture across whole stamp */}
        <pattern id={`${id}-halftone`} width="3" height="3" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="0.55" fill={palette.accent} />
        </pattern>

        {/* Slightly larger grain for the map area to add print noise */}
        <pattern id={`${id}-grain`} width="4" height="4" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="0.4" fill={palette.paper} />
        </pattern>

        {/* Duotone filter — collapses the monochrome map to paper + ink */}
        <filter
          id={`${id}-duotone`}
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feColorMatrix
            type="matrix"
            values={`
              0.33 0.33 0.33 0 0
              0.33 0.33 0.33 0 0
              0.33 0.33 0.33 0 0
              0    0    0    1 0
            `}
          />
          <feComponentTransfer>
            <feFuncR type="table" tableValues={`${hexChannel(palette.ink, 0)} ${hexChannel(palette.paper, 0)}`} />
            <feFuncG type="table" tableValues={`${hexChannel(palette.ink, 1)} ${hexChannel(palette.paper, 1)}`} />
            <feFuncB type="table" tableValues={`${hexChannel(palette.ink, 2)} ${hexChannel(palette.paper, 2)}`} />
          </feComponentTransfer>
        </filter>

        <clipPath id={`${id}-map-clip`}>
          <rect x="20" y="20" width="200" height="180" rx="6" />
        </clipPath>

        <radialGradient id={`${id}-paper`} cx="30%" cy="20%" r="120%">
          <stop offset="0%" stopColor={lighten(palette.paper, 0.04)} />
          <stop offset="60%" stopColor={palette.paper} />
          <stop offset="100%" stopColor={darken(palette.paper, 0.05)} />
        </radialGradient>
      </defs>

      {/* Cream paper background */}
      <rect x="0" y="0" width="240" height="340" fill={`url(#${id}-paper)`} />

      {/* Map area */}
      <g clipPath={`url(#${id}-map-clip)`}>
        <rect x="20" y="20" width="200" height="180" fill={palette.paper} />
        {mapImageUrl ? (
          <>
            <image
              href={mapImageUrl}
              x="20"
              y="20"
              width="200"
              height="180"
              preserveAspectRatio="xMidYMid slice"
              filter={`url(#${id}-duotone)`}
            />
            {/* Print noise on the map */}
            <rect
              x="20"
              y="20"
              width="200"
              height="180"
              fill={`url(#${id}-grain)`}
              style={{ mixBlendMode: 'screen', opacity: 0.4 }}
            />
            {/* Center pin */}
            <g transform="translate(120 110)">
              <circle r="6" fill={palette.paper} stroke={palette.ink} strokeWidth="2" />
              <circle r="2" fill={palette.ink} />
            </g>

            {/* Coordinate survey chip — top-right of map */}
            {latLabel && lngLabel ? (
              <g transform="translate(204 42)">
                <rect
                  x="-44"
                  y="-9"
                  width="44"
                  height="22"
                  fill={palette.paper}
                  stroke={palette.ink}
                  strokeWidth="0.8"
                  rx="1.5"
                />
                <text
                  x="-22"
                  y="-1.5"
                  fontFamily="var(--font-mono), ui-monospace, monospace"
                  fontSize="6.5"
                  letterSpacing="0.6"
                  fontWeight="600"
                  fill={palette.ink}
                  textAnchor="middle"
                >
                  {latLabel}
                </text>
                <text
                  x="-22"
                  y="8"
                  fontFamily="var(--font-mono), ui-monospace, monospace"
                  fontSize="6.5"
                  letterSpacing="0.6"
                  fontWeight="600"
                  fill={palette.ink}
                  textAnchor="middle"
                >
                  {lngLabel}
                </text>
              </g>
            ) : null}
          </>
        ) : (
          <>
            {/* Fallback: typographic medallion */}
            <rect x="20" y="20" width="200" height="180" fill={palette.ink} opacity="0.10" />
            <text
              x="120"
              y="120"
              fontFamily="var(--font-sans), system-ui, sans-serif"
              fontSize="78"
              fontWeight="800"
              fill={palette.ink}
              textAnchor="middle"
              dominantBaseline="central"
              letterSpacing="-2"
            >
              {placeInitials}
            </text>
          </>
        )}
      </g>

      {/* Publisher mark — vertical on right edge, reads bottom-to-top */}
      <g transform="translate(231 175) rotate(-90)">
        <text
          x="0"
          y="0"
          fontFamily="var(--font-mono), ui-monospace, monospace"
          fontSize="5.5"
          letterSpacing="2.4"
          fontWeight="600"
          fill={palette.inkSoft}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          FINDANOOK.COM
        </text>
      </g>

      {/* Type + street address row above the title */}
      <text
        x="20"
        y="212"
        fontFamily="var(--font-mono), ui-monospace, monospace"
        fontSize="6.5"
        letterSpacing="2"
        fill={palette.inkSoft}
      >
        {metaLeft}
      </text>

      {/* Title + city block — flows naturally below the map */}
      <foreignObject x="18" y="218" width="204" height="82">
        <div
          style={{
            display: 'flex',
            flexDirection: 'column' as const,
            gap: '4px',
            color: palette.ink,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-sans), system-ui, sans-serif',
              fontWeight: 800,
              fontSize: `${titleSize}px`,
              lineHeight: 0.95,
              letterSpacing: '-0.02em',
              textTransform: 'uppercase',
              textWrap: 'balance' as const,
              wordBreak: 'break-word',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical' as const,
              overflow: 'hidden',
            }}
          >
            {name}
          </span>
          {cityLabel ? (
            <span
              style={{
                fontFamily: 'var(--font-sans), system-ui, sans-serif',
                fontWeight: 700,
                fontSize: '10.5px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {cityLabel}
            </span>
          ) : null}
        </div>
      </foreignObject>

      {/* Bottom rule */}
      <line x1="20" y1="305" x2="220" y2="305" stroke={palette.ink} strokeWidth="0.6" opacity="0.45" />

      {/* Bottom meta row: user initials · date · ×visits */}
      <text
        x="20"
        y="318"
        fontFamily="var(--font-mono), ui-monospace, monospace"
        fontSize="7.5"
        letterSpacing="1.4"
        fill={palette.ink}
        fontWeight="600"
      >
        {userInitials}
      </text>
      <text
        x="120"
        y="318"
        fontFamily="var(--font-mono), ui-monospace, monospace"
        fontSize="7.5"
        letterSpacing="1.6"
        fill={palette.inkSoft}
        textAnchor="middle"
      >
        {dateLabel}
      </text>
      {stamp.visitsCount > 1 ? (
        <text
          x="220"
          y="318"
          fontFamily="var(--font-mono), ui-monospace, monospace"
          fontSize="7.5"
          letterSpacing="1.4"
          fill={palette.ink}
          textAnchor="end"
          fontWeight="600"
        >
          {stamp.visitsCount} VISITS
        </text>
      ) : null}


      {/* Halftone grain across whole stamp */}
      <rect
        x="0"
        y="0"
        width="240"
        height="340"
        fill={`url(#${id}-halftone)`}
        style={{ mixBlendMode: 'multiply', opacity: 0.10 }}
      />
    </svg>
  )
}

// Helpers

function hexChannel(hex: string, channel: 0 | 1 | 2): number {
  const h = hex.replace('#', '')
  const value = parseInt(h.slice(channel * 2, channel * 2 + 2), 16)
  return value / 255
}

function lighten(hex: string, amount: number): string {
  return shiftHex(hex, amount)
}
function darken(hex: string, amount: number): string {
  return shiftHex(hex, -amount)
}
function shiftHex(hex: string, amount: number): string {
  const h = hex.replace('#', '')
  const channels = [0, 1, 2].map((i) => {
    const value = parseInt(h.slice(i * 2, i * 2 + 2), 16)
    const shifted = Math.max(0, Math.min(255, Math.round(value + amount * 255)))
    return shifted.toString(16).padStart(2, '0')
  })
  return `#${channels.join('')}`
}
