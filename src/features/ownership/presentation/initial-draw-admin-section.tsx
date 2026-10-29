import type { ExercisedAdminSession } from '@/features/admin';
import { unavailableKeys } from '@/features/platform';
import { AcquisitionNotice, AcquisitionSection } from './acquisition-ui';
import { acquisitionMessages } from './i18n/acquisition-pt-br';
import { initialDrawMessages as text } from './i18n/initial-draw-pt-br';
import { InitialDrawEvidenceView } from './initial-draw-evidence';
import { readInitialDrawAdmin, type InitialDrawEvidence } from './initial-draw-read';

const SECTION = 'initial-draw';

/** Seção "Sorteio inicial" da formalização Co-Owner no Admin (PD-011): leitura auditada própria. */
export async function InitialDrawAdminSection({
  session,
  secondHomeId,
}: {
  readonly session: ExercisedAdminSession;
  readonly secondHomeId: string;
}) {
  let evidence: InitialDrawEvidence | null;
  try {
    evidence = await readInitialDrawAdmin(session, secondHomeId);
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
    return (
      <AcquisitionSection id={SECTION} title={text.adminTitle}>
        <AcquisitionNotice>{acquisitionMessages.readUnavailable}</AcquisitionNotice>
      </AcquisitionSection>
    );
  }
  return (
    <AcquisitionSection id={SECTION} title={text.adminTitle}>
      {evidence === null ? (
        <p className="lx-body">{text.awaitingCommitment}</p>
      ) : (
        <InitialDrawEvidenceView evidence={evidence} idPrefix={SECTION} />
      )}
    </AcquisitionSection>
  );
}
