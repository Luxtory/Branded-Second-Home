import { notFound } from 'next/navigation';
import type { PrivacyNotice } from '../domain/privacy-notice';
import { privacyNotice, privacyPageMessages as text } from './i18n/privacy-notice-pt-br';
import { isPrivacyNoticePageOpen } from './interest-gate';

function Approved({ notice }: { readonly notice: Extract<PrivacyNotice, { status: 'approved' }> }) {
  return (
    <>
      <p className="lx-small">
        {text.version} {notice.version} · {text.approvedOn} {notice.approvedOn}
      </p>
      {notice.sections.map((section) => (
        <section
          className="lx-stack"
          key={section.topic}
          aria-labelledby={`aviso-${section.topic}`}
        >
          <h2 id={`aviso-${section.topic}`} className="lx-display-s">
            {section.title}
          </h2>
          {section.paragraphs.map((paragraph) => (
            <p className="lx-body" key={paragraph}>
              {paragraph}
            </p>
          ))}
          {section.links.map((link) => (
            <p className="lx-body" key={link.href}>
              <a className="lx-link" href={link.href}>
                {link.label}
              </a>
            </p>
          ))}
        </section>
      ))}
    </>
  );
}

/**
 * `/privacidade` (spec ownership §14.11): o Aviso de Privacidade da jornada da solicitação de conversa, só com o texto
 * entregue pela Luxtory. Em Production, sem Aviso `approved` → 404; fora dela, o estado pendente aparece para validação
 * técnica.
 */
export function PrivacyNoticePage({ notice = privacyNotice }: { readonly notice?: PrivacyNotice }) {
  if (!isPrivacyNoticePageOpen(process.env, notice)) notFound();
  return (
    <section className="lx-section" data-surface="white" aria-labelledby="aviso-de-privacidade">
      <div className="lx-container lx-stack">
        <h1 id="aviso-de-privacidade" className="lx-headline">
          {text.title}
        </h1>
        {notice.status === 'approved' ? (
          <Approved notice={notice} />
        ) : (
          <div className="lx-message lx-message--warning" role="status">
            <p className="lx-message__title">{text.pending}</p>
          </div>
        )}
      </div>
    </section>
  );
}
