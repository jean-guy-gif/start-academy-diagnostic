import { DesignView } from "./design-view";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SupportDesignPage({ params }: Props) {
  const { id } = await params;
  return <DesignView sessionId={id} />;
}
