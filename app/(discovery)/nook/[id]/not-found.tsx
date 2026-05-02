import Link from 'next/link'

export default function NookNotFound() {
  return (
    <div className="absolute top-[140px] left-4 right-4 md:top-[72px] md:right-auto md:bottom-6 md:w-[300px] z-30 flex flex-col rounded-2xl bg-background/95 backdrop-blur-sm shadow-lg border border-border overflow-hidden p-6">
      <h2 className="font-display text-2xl tracking-tight">Nook not found</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        That nook slug doesn&apos;t match any place in our catalog.
      </p>
      <Link
        href="/"
        className="mt-4 inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium bg-primary text-primary-foreground"
      >
        Back to map
      </Link>
    </div>
  )
}
