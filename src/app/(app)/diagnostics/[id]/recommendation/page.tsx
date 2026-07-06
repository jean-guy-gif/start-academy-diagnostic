import { RecommendationView } from "./recommendation-view";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RecommendationPage({ params }: Props) {
  const { id } = await params;
  return <RecommendationView diagnosticId={id} />;
}
