# Second Home Partners — revisão de 2026-11-17

Implementação da copy aprovada para incorporadoras, imobiliárias e corretores na mesma página. REQ-105 · TECH-057 ·
`catalog` §20.6 · `D-SHP-14`–`D-SHP-16`. Capturas reais do build de produção local em Chromium, com fontes e imagens
carregadas. Não são mockups nem comprovação de operação do Club. A produção continua na versão publicada de 14/11;
a nova copy está preparada para lançamento quando o Club estiver pronto, conforme instrução do fundador.

## Verificação visual

- Seis larguras: 320, 390, 768, 1024, 1440 e 1920 px, sem overflow horizontal.
- Parágrafos de conteúdo/privacidade com até três linhas de390 a1920, e até quatro a320. Títulos e rótulos preservam reflow natural.
- Reflow com fonte200% em320,390,768,1440: sem overflow ou clipping. Sem reduzir tipografia ou truncar conteúdo.
- Três imagens originais preservadas por estágio, carregadas e com enquadramento individual. Contraste mínimo medido sobre as fotos: **7,32:1**.
- Duas colunas para imobiliárias/corretores no desktop e blocos empilhados no celular; um CTA para o formulário comum.
- Processo em duas colunas nas larguras intermediárias e quatro no desktop amplo. Todos os blocos mantêm o contexto da copy aprovada.
- Console sem erros. Dados e medições por parágrafo em [metrics.json](metrics.json).

| Captura | Celular | Desktop |
|---|---|---|
| Página inteira | [390px](pagina-completa-390.jpg) | [1440px](pagina-completa-1440.jpg) |
| Hero comum | [390px](hero-390.jpg) | [1440px](hero-1440.jpg) |
| Nova seção dos intermediadores | [390px](intermediadores-390.jpg) | [1440px](intermediadores-1440.jpg) |
| Imagens por estágio | [390px](empreendimentos-390.jpg) | [1440px](empreendimentos-1440.jpg) |
| Formulário incorporadora | [390px](formulario-incorporadora-390.jpg) | [1440px](formulario-incorporadora-1440.jpg) |
| Formulário imobiliária | [390px](formulario-imobiliaria-390.jpg) | [1440px](formulario-imobiliaria-1440.jpg) |
| Formulário corretor | [390px](formulario-corretor-390.jpg) | [1440px](formulario-corretor-1440.jpg) |

## Verificação funcional

`npm run verify`: lint, tipos, **1.665 testes /170 arquivos**, cobertura de linhas98,87%,56 testes DS,60 migrations up/down/up e build aprovados. Contato: schema e contrato HTTP para os três perfis, rejeição de campos incompatíveis, empresa opcional do corretor e e-mail determinístico. Endpoint e controles TECH-057 preservados, sem persistência.

Revisão independente do diff inteiro: nenhum achado Critical/Important. Refinamento não bloqueante pendente: verificar o anúncio de erros dos grupos de opções em leitores de tela reais e avaliar associação direta adicional por `aria-describedby` nos radios. Já existem descrição no fieldset, resumo com alerta e foco no primeiro campo; não foi adicionado atributo inválido para o papel radio.

As verificações de envio usam adapter determinístico: não comprovam entrega real de e-mail. Esta revisão não comprova prontidão do Club nem autoriza automaticamente publicação. E2E da revisão:18/18 da página SHP aprovados, incluindo os três perfis até a API real com adapter determinístico, retry com a mesma chave, troca de perfil sem dados residuais, teclado/toque, axe0 em390/1440, seis larguras e reflow200%. Regressões Brand Partners34/34 e Sobre13/13 aprovadas. Discovery22/22 mais3fixtures aprovados com Node22.23.3 (25/25). A primeira chamada sem as dependências de seed foi corrigida no comando, sem mudança de produto. Resultado da CI registrado no PR.
