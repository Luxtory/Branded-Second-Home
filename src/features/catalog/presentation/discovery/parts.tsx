import type { ReactNode } from 'react';
import { Icon, TriadDrawing, type TriadVertex } from '@/design-system/react';
import type { EditionModality } from '../../domain/catalog';
import {
  discoveryMessages as text,
  type Answer,
  type Item,
  type ModalityPair,
} from '../i18n/discovery-pt-br';
import { nb } from './no-break';

type Level = 3 | 4;

function Heading({
  level,
  className,
  children,
}: {
  readonly level: Level;
  readonly className: string;
  readonly children: ReactNode;
}) {
  const Tag = level === 3 ? 'h3' : 'h4';
  return <Tag className={className}>{children}</Tag>;
}

/** Parágrafos curtos da copy, com "Co-Owner" sem quebra no hífen. */
export function Paragraphs({
  lines,
  className = 'lx-body',
}: {
  readonly lines: readonly string[];
  readonly className?: string;
}) {
  return (
    <>
      {lines.map((line) => (
        <p className={className} key={line}>
          {nb(line)}
        </p>
      ))}
    </>
  );
}

/**
 * Owner e Co-Owner lado a lado, com a mesma estrutura (`lx-pair`): mesmo nível de título e o mesmo tipo de conteúdo
 * (REQ-103, BR-376).
 */
export function ModalityPairView({
  pair,
  level,
  deed = false,
  editorial = false,
}: {
  readonly pair: ModalityPair;
  readonly level: Level;
  /** Duas folhas altas do mesmo jogo de pranchas, divididas por um filete vertical. */
  readonly deed?: boolean;
  /** Founder-approved open comparison; opt-in consumer is Home only. */
  readonly editorial?: boolean;
}) {
  const sides = [
    { key: 'owner', title: text.modality.owner, lines: pair.owner },
    { key: 'co-owner', title: text.modality.co_owner, lines: pair.coOwner },
  ];
  return (
    <div
      className={
        editorial ? 'lx-b2c-editorial-comparison' : deed ? 'lx-pair lx-pair--deed' : 'lx-pair'
      }
    >
      {sides.map((side) => (
        <div className={editorial ? 'lx-b2c-editorial-unit' : 'lx-pair__item'} key={side.key}>
          <Heading level={level} className="lx-display-s">
            <span className="lx-nowrap">{side.title}</span>
          </Heading>
          <Paragraphs lines={side.lines} />
        </div>
      ))}
    </div>
  );
}

/**
 * Pergunta do Protagonista como título e a resposta ancorada (b2c.md §5), num `lx-page-section`: a pergunta fica mais
 * perto da sua resposta que da resposta anterior.
 */
export function AnswerView({ answer, level }: { readonly answer: Answer; readonly level: Level }) {
  return (
    <div className="lx-page-section">
      <Heading level={level} className={level === 3 ? 'lx-display-m' : 'lx-display-s'}>
        {answer.question}
      </Heading>
      <Paragraphs lines={answer.answer} />
    </div>
  );
}

/** Blocos curtos com título (`lx-blocks`); `ordered` quando a ordem é o conteúdo (mecanismo). */
export function Blocks({
  items,
  level,
  label,
  ordered = false,
  rows = false,
}: {
  readonly items: readonly Item[];
  readonly level: Level;
  readonly label?: string;
  readonly ordered?: boolean;
  readonly rows?: boolean;
}) {
  const List = ordered ? 'ol' : 'ul';
  return (
    <List className={rows ? 'lx-blocks lx-blocks--rows' : 'lx-blocks'} aria-label={label}>
      {items.map((item) => (
        <li className="lx-blocks__item" key={item.title}>
          <Heading level={level} className="lx-display-s">
            {nb(item.title)}
          </Heading>
          <p className="lx-body">{nb(item.text)}</p>
        </li>
      ))}
    </List>
  );
}

/** Link de navegação com seta (ação principal = botão; secundária = link). */
export function ActionLink({
  href,
  label,
  primary = false,
}: {
  readonly href: string;
  readonly label: string;
  readonly primary?: boolean;
}) {
  return (
    <a
      className={primary ? 'lx-button lx-button--primary' : 'lx-link lx-link--standalone'}
      href={href}
    >
      {label}
      <Icon name="arrow-right" className={primary ? 'lx-button__icon' : 'lx-link__icon'} />
    </a>
  );
}

/** Modalidade da Edition; aberta às duas, Owner e Co-Owner com o mesmo peso (BR-032, REQ-103). */
export function ModalityText({ value }: { readonly value: EditionModality }) {
  const coOwner = <span className="lx-nowrap">{text.modality.co_owner}</span>;
  if (value === 'owner') return text.modality.owner;
  if (value === 'co_owner') return coOwner;
  return (
    <>
      {text.modality.owner}
      {text.modality.join}
      {coOwner}
    </>
  );
}

/** Marker de capítulo (texto real, no máximo um por Scene). */
export function Marker({ parts }: { readonly parts: string | readonly string[] }) {
  const list = typeof parts === 'string' ? [parts] : parts;
  return (
    <p className="lx-marker">
      {list.map((part) => (
        <span key={part}>{part}</span>
      ))}
    </p>
  );
}

/**
 * Cabeçalho de capítulo: o número do capítulo (metadado, fora da leitura), o marker e a tríade em miniatura com o
 * vértice do capítulo em destaque.
 */
export function ChapterHead({
  numeral,
  marker,
  focus,
}: {
  readonly numeral?: string;
  readonly marker: string | readonly string[];
  readonly focus?: TriadVertex;
}) {
  return (
    <div className="lx-chapter-head">
      {numeral === undefined ? null : (
        <span className="lx-numeral" aria-hidden="true">
          {numeral}
        </span>
      )}
      <Marker parts={marker} />
      {focus === undefined ? null : <TriadDrawing size="mini" focus={focus} />}
    </div>
  );
}

/** "Patrimônio. Liberdade. Pertencimento." em três palavras, cada uma sob a sua linha de medida (`lx-values`). */
export function ValuesLine({
  text,
  joined = false,
  className = '',
}: {
  readonly text: string;
  readonly joined?: boolean;
  readonly className?: string;
}) {
  const words = text.split(/(?<=\.)\s+/);
  const variant = joined ? 'lx-values lx-values--joined' : 'lx-values lx-values--apart';
  return (
    <p className={`${variant} ${className}`.trim()}>
      {words.map((word) => (
        <span key={word}>{word}</span>
      ))}
    </p>
  );
}
