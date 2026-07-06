import { DesignPrintView } from "./design-print-view";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SupportDesignPrintPage({ params }: Props) {
  const { id } = await params;
  return <DesignPrintView sessionId={id} />;
}
