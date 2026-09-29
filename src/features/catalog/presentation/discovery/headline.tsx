import type { Headline } from '../i18n/discovery-pt-br';

/** Headline com no máximo uma virada em itálico (`<em>`), vinda do i18n. */
export function HeadlineText({ headline }: { readonly headline: Headline }) {
  return (
    <>
      {headline.lead}
      {headline.turn === undefined ? null : <em>{headline.turn}</em>}
      {headline.tail}
    </>
  );
}
