import { describe, expect, it } from 'vitest';
import {
  isPrivacyNoticeApproved,
  PRIVACY_NOTICE_TOPICS,
  privacyNoticeIssues,
  type PrivacyNotice,
} from '@/features/ownership/domain/privacy-notice';
import { privacyNotice } from '@/features/ownership/presentation/i18n/privacy-notice-pt-br';

// Aviso de Privacidade da jornada (spec ownership §14.11). Estes testes verificam ESTRUTURA — tópicos, títulos, parágrafos, links e
// ausência de marcadores de rascunho. Eles NÃO afirmam suficiência nem conformidade jurídica: estrutura completa não é
// validação jurídica, e o software nunca "valida" o Aviso. O estado `approved` só existe depois do checkpoint
// jurídico/fundador, por commit.

/** Fixture estrutural de teste — texto fictício, nunca conteúdo de Aviso. */
function structurallyComplete(): PrivacyNotice {
  return {
    status: 'approved',
    version: 'fixture-1',
    approvedOn: '2026-10-19',
    sections: PRIVACY_NOTICE_TOPICS.map((topic) => ({
      topic,
      title: `Título de teste ${topic}`,
      paragraphs: [`Parágrafo de teste ${topic}.`],
      links:
        topic === 'channel' ? [{ label: 'Canal de teste', href: 'mailto:canal@example.com' }] : [],
    })),
  };
}

describe('Aviso de Privacidade — estrutura mínima (não é validação jurídica)', () => {
  it('o Aviso versionado no repositório está pendente ou estruturalmente completo', () => {
    if (privacyNotice.status === 'pending') {
      expect(isPrivacyNoticeApproved(privacyNotice)).toBe(false);
      return;
    }
    expect(privacyNoticeIssues(privacyNotice)).toEqual([]);
  });

  it('pendente nunca conta como aprovado', () => {
    expect(isPrivacyNoticeApproved({ status: 'pending' })).toBe(false);
    expect(privacyNoticeIssues({ status: 'pending' })).toEqual(['pending']);
  });

  it('os 11 tópicos exigidos pela P-3, uma vez cada', () => {
    expect(PRIVACY_NOTICE_TOPICS).toEqual([
      'controller',
      'purposes',
      'legal_bases',
      'categories',
      'retention',
      'access',
      'operators',
      'sharing',
      'international_transfers',
      'rights',
      'channel',
    ]);
    expect(privacyNoticeIssues(structurallyComplete())).toEqual([]);
    expect(isPrivacyNoticeApproved(structurallyComplete())).toBe(true);
  });

  it('tópico ausente, repetido, título ou parágrafo vazio → estrutura incompleta', () => {
    const base = structurallyComplete();
    if (base.status !== 'approved') throw new Error('fixture');
    const [first, ...rest] = base.sections;
    if (first === undefined) throw new Error('fixture');

    expect(privacyNoticeIssues({ ...base, sections: rest })).toContain('missing:controller');
    expect(privacyNoticeIssues({ ...base, sections: [first, ...base.sections] })).toContain(
      'duplicated:controller',
    );
    expect(
      privacyNoticeIssues({ ...base, sections: [{ ...first, title: ' ' }, ...rest] }),
    ).toContain('empty:controller');
    expect(
      privacyNoticeIssues({ ...base, sections: [{ ...first, paragraphs: [] }, ...rest] }),
    ).toContain('empty:controller');
  });

  it('canal sem link de contato (mailto: ou https:) ou link inválido → estrutura incompleta', () => {
    const base = structurallyComplete();
    if (base.status !== 'approved') throw new Error('fixture');
    const withChannel = (links: readonly { label: string; href: string }[]) => ({
      ...base,
      sections: base.sections.map((section) =>
        section.topic === 'channel' ? { ...section, links } : section,
      ),
    });

    expect(privacyNoticeIssues(withChannel([]))).toContain('link:channel');
    expect(
      privacyNoticeIssues(withChannel([{ label: 'x', href: 'http://inseguro.example' }])),
    ).toContain('link:channel');
    expect(
      privacyNoticeIssues(withChannel([{ label: 'x', href: 'https://example.com/canal' }])),
    ).toEqual([]);
  });

  it('marcadores de rascunho, versão ou data ausentes → estrutura incompleta', () => {
    const base = structurallyComplete();
    if (base.status !== 'approved') throw new Error('fixture');
    const withParagraph = (paragraph: string) => ({
      ...base,
      sections: base.sections.map((section) =>
        section.topic === 'retention' ? { ...section, paragraphs: [paragraph] } : section,
      ),
    });

    for (const draft of [
      'TODO definir prazo',
      'Prazo: [preencher]',
      'Lorem ipsum',
      '{{prazo}}',
      'TBD',
    ]) {
      expect(privacyNoticeIssues(withParagraph(draft)), draft).toContain('placeholder:retention');
    }
    expect(privacyNoticeIssues(withParagraph('Durante todo o período de retenção.'))).toEqual([]);
    expect(privacyNoticeIssues({ ...base, version: '' })).toContain('version');
    expect(privacyNoticeIssues({ ...base, approvedOn: '19/10/2026' })).toContain('approved_on');
  });
});
