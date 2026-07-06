import { CollectView } from "./collect-view";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CollectPage({ params }: Props) {
  const { id } = await params;
  return <CollectView sessionId={id} />;
}
