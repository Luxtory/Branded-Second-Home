# Spec: communication — camada de comunicação das páginas públicas

> Contrato da camada. Decisão: [ADR-0011](../adr/0011-camada-de-comunicacao-publica.md). Método:
> [Framework Mestre](communication/framework-mestre.md). Preenchimentos: [base Luxtory](communication/luxtory.md) ·
> [B2C](communication/b2c.md) · [Brand Partners](communication/brand-partners.md).

## 1. Goal

Dar às páginas públicas da Luxtory uma única fonte estratégica de comunicação — posicionamento, Protagonista,
desejo, problema, transformação, narrativa, crenças, arquitetura persuasiva, personalidade do Mentor, tom, provas,
CTAs e intenção de UX — para que qualquer pessoa ou IA construa uma página pública **sem reinterpretar a estratégia
do zero** e sem inventar fatos.

```
01 / 02 / 03 (fatos, citados direto)  +  Design System (forma da UI)
        ↓
Framework preenchido: base Luxtory + um preenchimento por Protagonista (com mapa de jornada)
        ↓
brief de página (na spec do módulo da wave que constrói a página)
        ↓
layout (DS) + UX + copy (i18n do slice) + implementação
```

## 2. Non-goals

- Criar, alterar ou interpretar Business Rules, requisitos, funcionalidades, preços, benefícios ou provas. O Framework
  preenchido **interpreta fatos para comunicar**; não os produz.
- Materialização da interface (componentes, tokens, tipografia, espaço, breakpoints, acessibilidade): é do
  [Design System](design-system.md).
- Superfícies logadas (Admin, Área do Titular, Club, Carteira), notificações e e-mails: seguem o DS (expressão
  `product`) e o REQ-098.
- Textos jurídicos (privacidade, consentimento, termos): vêm da Luxtory (P-3 do roadmap).
- Decidir o modelo de conteúdo público de cada Concept: é decisão da W4, no brief real da página.

## 3. Fontes e precedência

| Fonte | Responsabilidade | Não pode |
|---|---|---|
| `01` → `02` → `03` ([canônicos](canonical/)) | o que é verdade no negócio, no produto e na técnica; prevalecem sempre | — |
| [Design System](design-system.md) ([uso](../reference/design-system.md)) | **como** a interface se materializa | decidir mensagem, posicionamento ou prova |
| Framework preenchido ([`communication/`](communication/)) | **o que** comunicar, para quem, em que ordem, com que narrativa, personalidade, tom, provas e CTA; intenção de UX e de layout | criar regra, funcionalidade, benefício, dado, preço ou prova; especificar componente ou token |
| [Framework Mestre](communication/framework-mestre.md) | o método (estrutura, 5Ps, regras de execução) | ser fonte de fatos sobre a Luxtory |
| Brief de página (spec do módulo da wave) | a página: seções, mensagens, provas, intenção de layout, dados, aceite | reposicionar a marca |
| i18n do slice (`src/features/<slice>/presentation/i18n/`) | a copy final pt-BR | — |
| Lab do DS (`src/design-system/lab/`) | demonstração visual | **nunca** é fonte de copy nem de posicionamento |

Design System e Framework preenchido são pares com domínios separados: onde se tocam (hierarquia visual), o Framework
dá a intenção e o DS dá a forma.

**Protocolo de conflito** — entre quaisquer fontes, inclusive um brand guide futuro: **detectar → comparar as
responsabilidades → propor reconciliação → aprovar → atualizar a fonte correspondente.** Nenhum documento sobrescreve
automaticamente uma decisão aprovada, e nenhum conflito é resolvido em silêncio: até a aprovação, ele é registrado como
pendência (`P-*`) e só a parte dependente fica bloqueada.

## 4. Arquivos

| Arquivo | Conteúdo |
|---|---|
| [`communication/framework-mestre.md`](communication/framework-mestre.md) | versão aprovada do Framework Mestre (método), versionada pelo Git. Alterá-la exige revisão de impacto nos preenchimentos |
| [`communication/luxtory.md`](communication/luxtory.md) | o que é transversal à marca: Mentor, personalidade, tom-base, princípios globais, guardrails compartilhados e poucos fatos transversais |
| [`communication/b2c.md`](communication/b2c.md) | Protagonista B2C (Owner e Co-Owner como variações de modalidade) e jornada B2C |
| [`communication/brand-partners.md`](communication/brand-partners.md) | Protagonista Brand Partner e jornada Brand Partners |

Um Protagonista novo (ex.: Investor) ganha um arquivo com o mesmo esqueleto de `b2c.md`, sem tocar nos demais.

## 5. Classificação das informações

| Marca | Significado | Regra |
|---|---|---|
| `[F: BR-050, REQ-024]` | **Fato** — sustentado pelos canônicos (IDs) ou por documento aprovado do repo (caminho e seção) | citar a fonte direto; nunca paráfrase que mude o sentido; o canônico prevalece |
| `D-LX-nn` · `D-B2C-nn` · `D-BP-nn` | **Decisão de comunicação/branding** — julgamento estratégico sustentado pelo contexto | nasce como *proposta* com justificativa; só é usada como decisão depois de *aprovada* (data no registro) |
| `H-B2C-nn` · `H-BP-nn` | **Hipótese** sobre o público — interpretação ainda não validada | orienta a narrativa, **nunca** é afirmada como fato na página; diz como validar |
| `P-LX-nn` · `P-B2C-nn` · `P-BP-nn` | **Pendência** — depende de insumo externo (foto, preço, parceira autorizada, superfície no 02…) | bloqueia só o que depende dela |

- Não inventar fatos ≠ não exercer julgamento: o que os canônicos não decidem (ênfase de posicionamento, antagonista,
  crença final, expressão do desejo) é **proposto** como decisão, com recomendação, e levado à aprovação.
- D e H **nunca** viram Business Rule, requisito ou funcionalidade.
- Cada preenchimento mantém o próprio registro de D/H/P no fim do arquivo.
- Nível de conscientização é descrito em texto, por público e por página (o Mestre não fixa escala).

## 6. Protagonistas e jornadas

- **Uma página, um Protagonista.** A marca é sempre o Mentor, com a mesma personalidade em todas as jornadas; o tom
  varia em intensidade por público e por estágio.
- **Jornadas B2C e Brand Partners são separadas:** navegação, CTAs e links de uma nunca levam à outra (`D-LX-01`).
- **B2C é um único Protagonista:** Owner e Co-Owner são modalidades do mesmo adquirente final (BR-005), com peso
  equivalente (REQ-103).
- Superfície nova (ex.: páginas e CTA de Brand Partners, que o `02` §2 não prevê) entra no `02` antes do código.

## 7. 5Ps e Design System

Relação **semântica, não estrutural**. `PICTURE → PROBLEM → PROMISE → PROOF → PUSH` definem a **função narrativa**;
Opening Frame, Scene, Sequence e Evidence ([DS ref §2](../reference/design-system.md#2-gramática-narrativa)) definem a
**gramática de composição**. Não há correspondência 1:1 obrigatória: uma Scene pode cumprir mais de uma função, e um
estágio pode ser materializado por composições diferentes. Os 5Ps não são componentes nem estrutura de DOM.

Única convenção fixa: **nas Homes que usam o arco completo, PICTURE = Hero (Opening Frame)** e a progressão seguinte
parte de PROBLEM. Páginas de Discovery, explicação ou produto executam só os estágios necessários à sua função, conforme
o mapa de jornada do Protagonista.

## 8. Brief de página

Escrito na spec do módulo da wave que constrói a página (ex.: `docs/specs/catalog.md` na W4), no mesmo PR. Campos:

1. Página, jornada e Protagonista (link para a entrada no mapa de jornada).
2. Função da página e nível de conscientização de entrada e de saída.
3. Estágios dos 5Ps executados — e por que os demais ficam fora.
4. Seções, em ordem: função narrativa · pergunta mental que responde · mensagem-chave (ideia, não copy final) ·
   fatos e decisões usados (IDs) · peso relativo de emoção, explicação e evidência · intenção de layout (hierarquia,
   predominância imagem ou texto, destaque) · gramática do DS.
5. CTA e destino existente; comportamento enquanto o destino não existe.
6. Dados dinâmicos e o que acontece quando faltam (TECH-001: item ausente não aparece).
7. Hipóteses e pendências que a página **não** pode afirmar.
8. Critérios de aceite (inclui o checklist da §10).

## 9. Fluxo de trabalho para uma página pública

1. Ler este contrato.
2. Achar a página e o Protagonista no mapa de jornada do preenchimento. Sem entrada aprovada: parar e registrar
   pendência — não improvisar.
3. Ler o preenchimento do Protagonista, [`luxtory.md`](communication/luxtory.md) e, no Mestre, §6 (5Ps), §8
   (variação de tom) e §9 (regras de execução).
4. Escrever o brief (§8) na spec do módulo.
5. Materializar com o [Design System](../reference/design-system.md) e escrever a copy no i18n do slice.
6. Verificar (§10). Faltou decisão: registrar como proposta ou pendência e perguntar; nunca inventar.

## 10. Checklist de PR — página pública

- [ ] Página e Protagonista estão no mapa de jornada aprovado; links só dentro da própria jornada.
- [ ] Estágios dos 5Ps = os do mapa; em Home com arco completo, o Hero cumpre PICTURE.
- [ ] Todo fato cita fonte (IDs); só decisões **aprovadas**; nenhuma hipótese ou pendência afirmada como fato.
- [ ] Nenhum número, preço, prova social, depoimento, dado, prêmio ou parceira inventados; valores de parâmetro
      (Membership, Fee, multiplicador…) não fixados na copy.
- [ ] Terminologia do `02` §1 e guardrails de [`luxtory.md`](communication/luxtory.md#4-guardrails-compartilhados)
      (varredura de terminologia verde).
- [ ] Owner e Co-Owner com peso equivalente quando aparecem juntos (REQ-103).
- [ ] Tom-base + variação do estágio + modulação do Protagonista; personalidade estável.
- [ ] Design System: só tokens e `lx-*`; gate `expectResponsive`; capturas a 390 e 1440 px no PR.

## 11. Manutenção

- **Mestre:** mudança só com nova versão aprovada, seguida de revisão de impacto nos preenchimentos.
- **Canônicos:** nova versão do `01`/`02`/`03` inclui revisão das citações nos preenchimentos.
- **Preenchimentos:** decisão nova ou alterada passa pelo registro (proposta → aprovada, com data).
- **Brand guide, fotografia, parceiras autorizadas:** entram pelo protocolo de conflito da §3.
- Integridade mecânica: `tests/communication.test.ts` (IDs canônicos citados existem, links internos resolvem, seções
  mínimas presentes, referências D/H/P definidas).

## 12. References

- [ADR-0011](../adr/0011-camada-de-comunicacao-publica.md) · [ADR-0003](../adr/0003-design-system-camada-compartilhada.md)
  · [ADR-0009](../adr/0009-superficies-de-produto-mobile-first.md)
- Canônicos: `01` §1–§5, §37 · `02` §1, §2, §16 · `03` §13
- [`docs/plan/implementation-waves.md`](../plan/implementation-waves.md) → Wave 3B
