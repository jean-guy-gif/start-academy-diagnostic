import { ProposalView } from "./proposal-view";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProposalPage({ params }: Props) {
  const { id } = await params;
  return <ProposalView diagnosticId={id} />;
}
