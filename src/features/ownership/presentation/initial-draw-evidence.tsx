import type { ReactNode } from 'react';
import { Evidence, RecordList } from '@/design-system/react';
import {
  formatDrawInstant as instant,
  initialDrawMessages as text,
} from './i18n/initial-draw-pt-br';
import type { DrawParticipantView, InitialDrawEvidence } from './initial-draw-read';

function Part({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    // Page Section do DS (ADR-0009): título a distância fixa do conteúdo e blocos bem separados.
    <section className="lx-page-section" aria-labelledby={id}>
      <h3 className="lx-title" id={id}>
        {title}
      </h3>
      {children}
    </section>
  );
}

const code = (value: string) => <code>{value}</code>;

const ownership = (item: DrawParticipantView) =>
  item.mine ? [{ label: text.representation, value: text.yours }] : [];

/**
 * Evidência do sorteio (PD-011): método, compromisso, participantes e, depois da revelação, resultado e insumos.
 * Ações por identificador não pessoal; a do Titular aparece destacada (D1). Usada no Admin e na Área do Titular.
 */
export function InitialDrawEvidenceView({
  evidence,
  idPrefix,
}: {
  readonly evidence: InitialDrawEvidence;
  readonly idPrefix: string;
}) {
  const { reveal } = evidence;
  return (
    <>
      <div
        className={`lx-message lx-message--${reveal === null ? 'info' : 'success'}`}
        role="status"
      >
        <p className="lx-message__title">
          {reveal === null
            ? text.pending(evidence.targetRound, instant(evidence.targetRoundAt))
            : text.completed(instant(reveal.revealedAt))}
        </p>
      </div>
      <Part id={`${idPrefix}-method`} title={text.methodTitle}>
        <Evidence
          inline
          items={[
            { label: text.algorithm, value: text.algorithmValue },
            { label: text.beacon, value: text.beaconValue },
            { label: text.chain, value: code(evidence.chainHash) },
            { label: text.round, value: String(evidence.targetRound) },
            { label: text.roundAt, value: instant(evidence.targetRoundAt) },
          ]}
        />
      </Part>
      <Part id={`${idPrefix}-commitment`} title={text.commitmentTitle}>
        <Evidence
          inline
          items={[
            { label: text.commitment, value: code(evidence.commitment) },
            { label: text.recordedAt, value: instant(evidence.recordedAt) },
            { label: text.deadline, value: instant(evidence.commitDeadline) },
          ]}
        />
      </Part>
      <Part id={`${idPrefix}-participants`} title={text.participantsTitle}>
        <p className="lx-hint">{text.participantsLead(evidence.participantCount)}</p>
        <RecordList
          label={text.participantsTitle}
          items={evidence.participants.map((item) => ({
            id: item.stakeId,
            title: text.participant(item.ordinal),
            attributes: [{ label: text.identifier, value: code(item.stakeId) }, ...ownership(item)],
          }))}
        />
      </Part>
      {reveal === null ? null : (
        <>
          <Part id={`${idPrefix}-result`} title={text.resultTitle}>
            <RecordList
              label={text.resultTitle}
              items={reveal.positions.map((item) => ({
                id: item.stakeId,
                title: text.position(item.position),
                attributes: [
                  { label: text.holder, value: text.participant(item.ordinal) },
                  ...ownership(item),
                ],
              }))}
            />
            <p className="lx-hint">{text.advantageHint}</p>
          </Part>
          <Part id={`${idPrefix}-inputs`} title={text.inputsTitle}>
            <Evidence
              inline
              items={[
                { label: text.seed, value: code(reveal.seed) },
                { label: text.randomness, value: code(reveal.randomness) },
                { label: text.signature, value: code(reveal.signature) },
              ]}
            />
            <p className="lx-hint">{text.verifyHint}</p>
          </Part>
        </>
      )}
    </>
  );
}
