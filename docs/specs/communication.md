# Spec: communication — camada de comunicação das páginas públicas

> Contrato da camada. Decisões: [ADR-0011](../adr/0011-camada-de-comunicacao-publica.md) ·
> [ADR-0012](../adr/0012-framework-b2c-fonte-canonica-da-comunicacao-b2c.md) ·
> [ADR-0013](../adr/0013-framework-brand-partners-fonte-canonica.md).
> **B2C:** fonte canônica [Framework B2C](communication/framework-b2c.md) (congelado) · aplicação
> [`b2c.md`](communication/b2c.md). **Brand Partners:** fonte canônica
> [Framework Brand Partners](communication/framework-brand-partners.md) (congelado) · aplicação
> [`brand-partners.md`](communication/brand-partners.md). **Todas as jornadas:** [base Luxtory](communication/luxtory.md)
> (guardrails, fatos e nomenclatura).

## 1. Goal

Dar às páginas públicas da Luxtory uma única fonte estratégica de comunicação — posicionamento, Protagonista,
desejo, problema, transformação, narrativa, crenças, arquitetura persuasiva, personalidade do Mentor, tom, provas,
CTAs e intenção de UX — para que qualquer pessoa ou IA construa uma página pública **sem reinterpretar a estratégia
do zero** e sem inventar fatos.

```
01 / 02 / 03 (fatos, citados direto)  +  Design System (forma da UI)
        ↓
Framework da jornada (fonte canônica, congelado) → aplicação (limites canônicos, objeções, mapa de páginas)
  B2C: framework-b2c.md → b2c.md · Brand Partners: framework-brand-partners.md → brand-partners.md
  + base Luxtory (luxtory.md): guardrails, fatos e nomenclatura de todas as jornadas
        ↓
brief de página (na spec do módulo da wave que constrói a página)
        ↓
layout (DS) + UX + copy (i18n do slice) + implementação
```

## 2. Non-goals

- Criar, alterar ou interpretar Business Rules, requisitos, funcionalidades, preços, benefícios ou provas. A camada
  **interpreta fatos para comunicar**; não os produz.
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
| Framework da jornada — [B2C](communication/framework-b2c.md) · [Brand Partners](communication/framework-brand-partners.md) | **fonte canônica principal da comunicação da jornada**: posicionamento, Protagonista, narrativa, JTBD, MCR, conscientização, 5Ps, regra afetiva, personalidade, tom, brief, testes e regras de execução; prevalece sobre qualquer outro documento de comunicação da jornada | ser editado (só nova versão da Luxtory); criar ou alterar fato do `01`/`02`/`03` |
| Aplicação — [`b2c.md`](communication/b2c.md) · [`brand-partners.md`](communication/brand-partners.md) | limites canônicos (L1…), respostas às objeções com IDs, mapa de páginas, registro do que o Framework não decide | repetir ou parafrasear o Framework; contrariá-lo |
| [`luxtory.md`](communication/luxtory.md) | guardrails, fatos e nomenclatura de todas as jornadas | redefinir Mentor, personalidade ou tom (são dos Frameworks) |
| Brief de página (spec do módulo da wave) | a página: seções, mensagens, provas, intenção de layout, dados, aceite | reposicionar a marca |
| i18n do slice (`src/features/<slice>/presentation/i18n/`) | a copy final pt-BR | — |
| Lab do DS (`src/design-system/lab/`) | demonstração visual | **nunca** é fonte de copy nem de posicionamento |

Design System e Framework são pares com domínios separados: onde se tocam (hierarquia visual), o Framework dá a
intenção e o DS dá a forma.

**Protocolo de conflito** — entre quaisquer fontes, inclusive um brand guide futuro: **detectar → comparar as
responsabilidades → propor reconciliação → aprovar → atualizar a fonte correspondente.** Nenhum documento sobrescreve
automaticamente uma decisão aprovada, e nenhum conflito é resolvido em silêncio: até a aprovação, ele é registrado como
pendência (`P-*`) e só a parte dependente fica bloqueada.

## 4. Arquivos

| Arquivo | Conteúdo |
|---|---|
| [`communication/framework-b2c.md`](communication/framework-b2c.md) | Framework Mestre de Estratégia de Comunicação B2C — Luxtory Branded Second Home, recebido em 2026-09-30, cópia byte a byte (sha256 `7b0ec6c1b8eb828f509b46e77c1c8f2205825190412c9f4aa5176e7a4dab5577`, fixado em teste). Congelado: nunca é editado |
| [`communication/b2c.md`](communication/b2c.md) | aplicação do Framework B2C: limites canônicos, objeções com IDs, mapa de páginas e registro (Owner e Co-Owner como modalidades do mesmo Protagonista) |
| [`communication/framework-brand-partners.md`](communication/framework-brand-partners.md) | Framework Mestre de Estratégia de Comunicação Brand Partners — Luxtory Branded Second Home, recebido em 2026-10-01, cópia byte a byte (sha256 `b97c8ae37dc911d7fa17d947f7fa5f622c17bd30e913bd672f46bd68ac2364a7`, fixado em teste). Congelado: nunca é editado |
| [`communication/brand-partners.md`](communication/brand-partners.md) | aplicação do Framework Brand Partners: limites canônicos, objeções com IDs, mapa de páginas e registro |
| [`communication/luxtory.md`](communication/luxtory.md) | guardrails, fatos e nomenclatura de todas as jornadas |
| [`communication/framework-mestre.md`](communication/framework-mestre.md) | método genérico da W3B, substituído pelos Frameworks das jornadas (ADR-0013); não vale para nenhuma jornada |

Um Protagonista novo (ex.: Investor) só ganha comunicação quando a Luxtory entregar o Framework dele, com o mesmo
arranjo (Framework congelado + aplicação), sem tocar nos demais. Até lá, nada é presumido.

## 5. Classificação das informações

| Marca | Significado | Regra |
|---|---|---|
| `[F: BR-050, REQ-024]` | **Fato** — sustentado pelos canônicos (IDs) ou por documento aprovado do repo (caminho e seção) | citar a fonte direto; nunca paráfrase que mude o sentido; o canônico prevalece |
| `D-LX-nn` · `D-B2C-nn` · `D-BP-nn` | **Decisão de comunicação/branding** — julgamento estratégico sustentado pelo contexto | nasce como *proposta* com justificativa; só é usada como decisão depois de *aprovada* (data no registro) |
| `H-B2C-nn` · `H-BP-nn` | **Hipótese** sobre o público — interpretação ainda não validada | orienta a narrativa, **nunca** é afirmada como fato na página; diz como validar |
| `P-LX-nn` · `P-B2C-nn` · `P-BP-nn` | **Pendência** — depende de insumo externo (foto, preço, parceira autorizada, superfície no 02…) | bloqueia só o que depende dela |
| `[FW-B2C: §8 P4]` · `[FW-BP: §8 P4]` | **Diretriz do Framework da jornada** — referência a uma seção do Framework (tokens `§<n>`, `§<n.m>` e `P1`–`P5`) | referenciar, nunca parafrasear; não é fato de negócio (fatos seguem `[F: …]`) |

- Não inventar fatos ≠ não exercer julgamento: o que os canônicos e os Frameworks não decidem é **proposto** como
  decisão, com recomendação, e levado à aprovação.
- D e H **nunca** viram Business Rule, requisito ou funcionalidade.
- Cada aplicação mantém o próprio registro de D/H/P no fim do arquivo.
- Nível de conscientização: escala de Schwartz e Disposição para mudança identificadas separadamente, nas duas
  jornadas `[FW-B2C: §3.1, §7, §7.1]` `[FW-BP: §3.1, §7, §7.1]`.
- Linha de registro substituída fica com status `substituída em <data> → <destino>` e não é citada fora dos registros.

## 6. Protagonistas e jornadas

- **Uma página, um Protagonista.** A marca é sempre o Mentor. Personalidade e tom vêm do Framework da jornada:
  B2C `[FW-B2C: §10, §11]`; Brand Partners `[FW-BP: §10, §11]`.
- **Jornadas B2C e Brand Partners são separadas:** navegação, CTAs e links de uma nunca levam à outra (`D-LX-01`).
- **B2C é um único Protagonista:** Owner e Co-Owner são modalidades do mesmo adquirente final (BR-005), com peso
  equivalente (REQ-103).
- Superfície nova (ex.: páginas e CTA de Brand Partners, que o `02` §2 não prevê) entra no `02` antes do código
  (`P-BP-01`).

## 7. 5Ps e Design System

Relação **semântica, não estrutural**. `PICTURE → PROBLEM → PROMISE → PROOF → PUSH` definem a **função narrativa**;
Opening Frame, Scene, Sequence e Evidence ([DS ref §2](../reference/design-system.md#2-gramática-narrativa)) definem a
**gramática de composição**. Não há correspondência 1:1 obrigatória: uma Scene pode cumprir mais de uma função, e um
estágio pode ser materializado por composições diferentes. Os 5Ps não são componentes nem estrutura de DOM.

Única convenção fixa: **nas Homes que usam o arco completo, PICTURE = Hero (Opening Frame)** e a progressão seguinte
parte de PROBLEM. Nas Homes institucionais das duas jornadas, a página começa em Unaware `[FW-B2C: §8 P1, §13]`
`[FW-BP: §8 P1, §12]`. Páginas de Discovery, explicação ou produto executam só os estágios necessários à sua função,
conforme o mapa de jornada do Protagonista.

## 8. Brief de página

Escrito na spec do módulo da wave que constrói a página (ex.: `docs/specs/catalog.md` na W4), no mesmo PR, com os
campos do Brief Narrativo do Framework da jornada (§12: `[FW-B2C: §12]` · `[FW-BP: §12]`) mais os itens 1, 4, 5, 6, 7 e
8 abaixo:

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
2. Achar a página e o Protagonista no mapa de jornada da aplicação (B2C: [`b2c.md`](communication/b2c.md) §8; Brand
   Partners: [`brand-partners.md`](communication/brand-partners.md) §7). Sem entrada aprovada: parar e registrar
   pendência — não improvisar.
3. Ler o Framework da jornada inteiro, a aplicação e os guardrails de [`luxtory.md`](communication/luxtory.md) §4.
4. Escrever o brief (§8) na spec do módulo.
5. Materializar com o [Design System](../reference/design-system.md) e escrever a copy no i18n do slice.
6. Verificar (§10). Faltou decisão: registrar como proposta ou pendência e perguntar; nunca inventar.

## 10. Checklist de PR — página pública

- [ ] Página e Protagonista estão no mapa de jornada aprovado; links só dentro da própria jornada.
- [ ] Estágios dos 5Ps = os do mapa; em Home com arco completo, o Hero cumpre PICTURE.
- [ ] Todo fato cita fonte (IDs); só decisões **aprovadas**; nenhuma hipótese ou pendência afirmada como fato.
- [ ] Nenhum número, preço, prova social, depoimento, dado, prêmio ou parceira inventados; valores de parâmetro
      (Membership, Fee, multiplicador…) e de remuneração da Brand Partner não fixados na copy.
- [ ] Terminologia do `02` §1 e guardrails de [`luxtory.md`](communication/luxtory.md#4-guardrails-compartilhados)
      (varredura de terminologia verde).
- [ ] Owner e Co-Owner com peso equivalente quando aparecem juntos (REQ-103).
- [ ] Os 6 Testes de Validação (§13) e as regras de execução (§14) do Framework da jornada atendidos — no B2C, também
      as regras de mensagem `[FW-B2C: §16]`; limites da aplicação (§2 de [`b2c.md`](communication/b2c.md) ou de
      [`brand-partners.md`](communication/brand-partners.md)) respeitados.
- [ ] Tom derivado conforme o §11 do Framework; sistema afetivo pelo §9; no máximo dois traços OCEAN, nunca
      Volatilidade e Retraimento juntos (§10.1, §10.2; no B2C, D-B2C-12).
- [ ] Design System: só tokens e `lx-*`; gate `expectResponsive`; capturas a 390 e 1440 px no PR.

## 11. Manutenção

- **Frameworks:** nova versão da Luxtory troca o arquivo inteiro, atualiza o sha256 em `tests/communication.test.ts`
  e revisa a aplicação da jornada (referências ao Framework, limites e registro), no mesmo PR.
- **Canônicos:** nova versão do `01`/`02`/`03` inclui revisão das citações nas aplicações e em `luxtory.md`.
- **Aplicações e base:** decisão nova ou alterada passa pelo registro (proposta → aprovada, com data).
- **Brand guide, fotografia, parceiras autorizadas:** entram pelo protocolo de conflito da §3.
- Integridade mecânica: `tests/communication.test.ts` (IDs canônicos citados existem, links internos resolvem, seções
  mínimas presentes, referências D/H/P definidas, sha256 de cada Framework, referências aos Frameworks resolvem e cada
  aplicação cita só o seu, nenhuma linha substituída citada fora dos registros).

## 12. References

- [ADR-0011](../adr/0011-camada-de-comunicacao-publica.md) ·
  [ADR-0012](../adr/0012-framework-b2c-fonte-canonica-da-comunicacao-b2c.md) ·
  [ADR-0013](../adr/0013-framework-brand-partners-fonte-canonica.md) ·
  [ADR-0003](../adr/0003-design-system-camada-compartilhada.md) · [ADR-0009](../adr/0009-superficies-de-produto-mobile-first.md)
- Canônicos: `01` §1–§5, §37 · `02` §1, §2, §16 · `03` §13
- [`docs/plan/implementation-waves.md`](../plan/implementation-waves.md) → Waves 3B, 3C e 3D
