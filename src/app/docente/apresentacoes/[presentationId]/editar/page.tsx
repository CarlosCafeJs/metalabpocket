import PresentationEditor from '@/app/docente/apresentacoes/PresentationEditor';

export default async function EditPresentationPage({ params }: { params: Promise<{ presentationId: string }> }) {
  const { presentationId } = await params;
  return <PresentationEditor id={presentationId} />;
}
