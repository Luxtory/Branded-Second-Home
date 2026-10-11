import { Fragment, type ReactNode } from 'react';
import { nb } from '../discovery/no-break';

// `**termo**` = destaque tipográfico previsto na copy congelada (i18n/brand-partners-pt-br.ts).
const EMPHASIS = /\*\*(.+?)\*\*/;

/** Texto da copy com os termos destacados em `<strong>` e os compostos (Home Concept, Co-Owner…) sem quebra. */
export function Rich({ value }: { readonly value: string }): ReactNode {
  const parts = value.split(EMPHASIS);
  if (parts.length === 1) return nb(value);
  return parts.map((part, index) => (
    <Fragment key={index}>{index % 2 === 1 ? <strong>{nb(part)}</strong> : nb(part)}</Fragment>
  ));
}

/** Parágrafos da copy, um `<p>` por item. */
export function Paragraphs({
  lines,
  className = 'lx-body',
}: {
  readonly lines: readonly string[];
  readonly className?: string;
}) {
  return lines.map((line) => (
    <p className={className} key={line}>
      <Rich value={line} />
    </p>
  ));
}

/** Pergunta | resposta (Answer Rows do Core): a pergunta do leitor no eixo inicial, a resposta no restante. */
export function AnswerRows({
  answers,
}: {
  readonly answers: readonly { readonly question: string; readonly answer: readonly string[] }[];
}) {
  return (
    <div className="lx-answers">
      {answers.map(({ question, answer }) => (
        <div className="lx-answers__row" key={question}>
          <h3 className="lx-answers__label lx-subheadline">{nb(question)}</h3>
          <div className="lx-answers__content">
            <Paragraphs lines={answer} />
          </div>
        </div>
      ))}
    </div>
  );
}
