import { DiscoveryPage } from '@/components/map/DiscoveryPage'

export default async function NookPage(props: PageProps<'/nook/[id]'>) {
  const { id } = await props.params
  return <DiscoveryPage selectedNookSlug={id} />
}
