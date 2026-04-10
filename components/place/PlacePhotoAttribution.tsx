import { Camera } from 'lucide-react'
import type { NookPhotoAuthorAttribution } from '@/types/nook'

interface Props {
  attributions: NookPhotoAuthorAttribution[]
  linkToSource?: boolean
  compact?: boolean
}

export function PlacePhotoAttribution({
  attributions,
  linkToSource = true,
  compact = false,
}: Props) {
  const namedAttributions = attributions.filter(attribution => Boolean(attribution.displayName?.trim()))
  if (namedAttributions.length === 0) return null

  const containerClass = compact
    ? 'pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 via-black/18 to-transparent px-2 py-1 text-[9px] leading-snug text-white/80'
    : 'pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/28 to-transparent px-2.5 py-1.5 text-[10px] leading-snug text-white/88'

  const linkClass = compact
    ? 'pointer-events-auto underline decoration-white/45 underline-offset-2 hover:text-white'
    : 'pointer-events-auto underline decoration-white/60 underline-offset-2 hover:text-white'

  return (
    <div className={containerClass}>
      <Camera aria-hidden="true" className="mr-1 inline-block h-2.5 w-2.5 align-[-1px] text-white/58" />
      <span className="sr-only">Photo credit: </span>
      {namedAttributions.map((attribution, index) => {
        const content = attribution.displayName!.trim()

        return (
          <span key={`${content}-${index}`}>
            {index > 0 ? ', ' : null}
            {linkToSource && attribution.uri ? (
              <a
                href={attribution.uri}
                target="_blank"
                rel="noreferrer"
                className={linkClass}
              >
                {content}
              </a>
            ) : (
              content
            )}
          </span>
        )
      })}
    </div>
  )
}
