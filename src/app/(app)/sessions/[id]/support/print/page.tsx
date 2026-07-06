import { PrintView } from "./print-view";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SupportPrintPage({ params }: Props) {
  const { id } = await params;
  return <PrintView sessionId={id} />;
}
