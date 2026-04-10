import type { NookPhotoAuthorAttribution } from '@/types/nook'

interface Props {
  attributions: NookPhotoAuthorAttribution[]
  linkToSource?: boolean
}

export function PlacePhotoAttribution({ attributions, linkToSource = true }: Props) {
  const namedAttributions = attributions.filter(attribution => Boolean(attribution.displayName?.trim()))
  if (namedAttributions.length === 0) return null

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-2.5 py-2 text-[10px] leading-tight text-white/92">
      <span className="font-medium">Photo:</span>{' '}
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
                className="pointer-events-auto underline decoration-white/60 underline-offset-2 hover:text-white"
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
