import { SupportView } from "./support-view";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SupportPage({ params }: Props) {
  const { id } = await params;
  return <SupportView sessionId={id} />;
}
