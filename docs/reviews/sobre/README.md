# Sobre a Luxtory — material para revisão visual

Capturas do build local de produção em Chromium, com fontes e fotografia original carregadas. São material de
revisão do PR, não baselines de regressão visual. O conteúdo das duas páginas é compartilhado; os shells e os
links seguem a jornada de entrada. Contrato e aceite: [catalog §15](../../specs/catalog.md#15-sobre-a-luxtory).

| Jornada | Celular (390 px) | Desktop (1440 px) | Hero no tamanho do print (1266 × 546 px) |
|---|---|---|---|
| B2C — `/sobre` | [Captura](b2c-390.jpg) | [Captura](b2c-1440.jpg) | [Enquadramento](b2c-1266.jpg) |
| B2B — `/brand-partner/sobre` | [Captura](b2b-390.jpg) | [Captura](b2b-1440.jpg) | [Enquadramento](b2b-1266.jpg) |

A validação automatizada também mede 320, 360, 390, 768, 1023, 1024, 1440 e 1920 px, axe em 390/1440,
copy, navegação e foco, identidade/dimensões do JPEG, canonical/social/noindex e isolamento dos portões em HTML/RSC.
Na revisão de concisão (`catalog` §15.5), o corpo tem tipografia e geometria idênticas nas duas jornadas. Blocos
com até quatro linhas e enquadramento de todas as seções são medidos em 320/390/768/1024/1266/1440 px,
incluindo o Hero completo na primeira tela de 1266 × 546 px, como no print recebido. Os parágrafos usam
preferencialmente três linhas; a citação e os fatos do fundador foram preservados na edição autorizada.
O Preview do PR é a superfície para aprovação visual; nenhuma autorização de merge é inferida dos testes.

Revisão final (`catalog` §15.6): as capturas completas foram atualizadas com os parágrafos da história ocupando
toda a coluna disponível. Preenchimento e reflow também medidos até 1920 px, sem overflow; no mobile os blocos
seguem com até quatro linhas. Publicação em produção explicitamente autorizada pelo fundador após os testes.
