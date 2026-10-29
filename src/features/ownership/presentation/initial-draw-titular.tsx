import { notFound } from 'next/navigation';
import { PageHeader, RecordList } from '@/design-system/react';
import { AuthUnavailable, TitularShell, requireTitularSession } from '@/features/identity';
import { unavailableKeys } from '@/features/platform';
import { initialDrawMessages as text } from './i18n/initial-draw-pt-br';
import { InitialDrawEvidenceView } from './initial-draw-evidence';
import { readTitularInitialDraw, readTitularInitialDraws } from './initial-draw-read';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AREA = '/titular';
export const titularDrawPath = (drawId: string) => `/titular/sorteios/${drawId}`;

async function orUnavailable<T>(read: () => Promise<T>): Promise<T | 'unavailable'> {
  try {
    return await read();
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
    return 'unavailable';
  }
}

/** Seção da Área do Titular: sorteios das Second Homes de que o usuário é titular (RLS); vazia não aparece. */
export async function TitularInitialDrawList({ userId }: { readonly userId: string }) {
  const draws = await orUnavailable(() => readTitularInitialDraws({ userId }));
  if (draws === 'unavailable' || draws.length === 0) return null;
  return (
    <section className="lx-page-section" aria-labelledby="titular-initial-draws">
      <h2 className="lx-display-s" id="titular-initial-draws">
        {text.title}
      </h2>
      <p className="lx-hint">{text.listLead}</p>
      <RecordList
        label={text.title}
        items={draws.map((draw) => ({
          id: draw.drawId,
          href: titularDrawPath(draw.drawId),
          title: draw.secondHomeLabel,
          attributes: [
            {
              label: text.status,
              value: draw.revealed ? text.statusCompleted : text.statusPending,
            },
          ],
        }))}
      />
    </section>
  );
}

/** `/titular/sorteios/[drawId]`: evidência do sorteio visível pela RLS; qualquer outro id → 404, sem oráculo. */
export async function TitularInitialDrawPage({ drawId }: { readonly drawId: string }) {
  const session = await requireTitularSession();
  if (session === 'unavailable') return <AuthUnavailable />;
  const evidence = UUID.test(drawId)
    ? await orUnavailable(() => readTitularInitialDraw(session, drawId))
    : null;
  if (evidence === 'unavailable') return <AuthUnavailable />;
  if (evidence === null) notFound();
  return (
    <TitularShell>
      <PageHeader
        title={text.title}
        lead={evidence.secondHomeLabel}
        context={{ href: AREA, label: text.backToArea }}
      />
      <section className="lx-page-section" aria-labelledby="titular-draw-evidence">
        <h2 className="lx-display-s" id="titular-draw-evidence">
          {text.evidenceTitle}
        </h2>
        <InitialDrawEvidenceView evidence={evidence} idPrefix="titular-draw" />
      </section>
    </TitularShell>
  );
}
