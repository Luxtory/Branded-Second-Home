# Second Home Partners — ajustes do Preview

Refinamentos pedidos pelo fundador em17/11/2026, na mesma página e no PR94. REQ-105 · `catalog` §20.7 · D-SHP-17.

- Hero com as duas frases em blocos sucessivos e a segunda em itálico, dentro de um único H1. Duas linhas no desktop; reflow natural no celular.
- Oportunidade em split de texto e imagem: narrativa “Imagine seu cliente”, locação nos períodos sem uso e intercâmbio para outros destinos. A casa à beira-mar vem do acervo já autorizado; a imagem não comprova afiliação à rede. As três fotografias por estágio permanecem intactas.
- Fechamentos centralizados com o papel e o tratamento tipográfico da Home: Newsreader italic, escala de fechamento do Core. O teste compara tamanho, estilo e entrelinha com a Home real em seis larguras.
- Carteira já comercializada e futuras vendas podem ser apresentadas à avaliação. Afiliação depende da avaliação da Luxtory e da adesão de cada proprietário.
- Receita depois da venda é uma oportunidade dependente de faturamento e contrato. “Vitalícia” não foi adotada sem definição expressa de duração/continuidade. Não se promete aceleração de vendas.

## Capturas reais

Build local de produção, Chromium e fontes/imagens carregadas. Os recortes de seção ocultam somente o cabeçalho sobreposto durante a captura; o produto mantém o cabeçalho original. Não são mockups.

| Conteúdo | Celular390px | Desktop1440px |
|---|---|---|
| Página inteira | [Ver](pagina-completa-390.jpg) | [Ver](pagina-completa-1440.jpg) |
| Hero | [Ver](hero-390.jpg) | [Ver](hero-1440.jpg) |
| Oportunidade com imagem | [Ver](oportunidade-390.jpg) | [Ver](oportunidade-1440.jpg) |
| Imobiliárias e corretores | [Ver](intermediadores-390.jpg) | [Ver](intermediadores-1440.jpg) |
| Três estágios | [Ver](empreendimentos-390.jpg) | [Ver](empreendimentos-1440.jpg) |
| Formulário incorporadora | [Ver](formulario-incorporadora-390.jpg) | [Ver](formulario-incorporadora-1440.jpg) |
| Formulário imobiliária | [Ver](formulario-imobiliaria-390.jpg) | [Ver](formulario-imobiliaria-1440.jpg) |
| Formulário corretor | [Ver](formulario-corretor-390.jpg) | [Ver](formulario-corretor-1440.jpg) |

## Verificação

- 38testes direcionados de copy, comunicação, ontologia e assets aprovados; lint, tipos e build aprovados.
- 19/19 E2E da página aprovados: Hero, split, imagem carregada, fechamentos iguais à Home, navegação, SEO, três perfis até a API/adapter determinístico, falha/retry e estados acessíveis.
- axe0 em390/1440; seis larguras320,390,768,1024,1440,1920 sem overflow; parágrafos/fechamentos de até3linhas nas larguras verificadas≥390 e até4a320.
- Fonte200% em320,390,768,1440 sem clipping/overflow; contraste mínimo nas fotos7,32:1; console limpo. Detalhes em [metrics.json](metrics.json).
- Revisão independente do incremento: nenhum Critical/Important. Observação de copy sobre a certeza da receita corrigida para “Oportunidades de receita depois da venda”, com guarda de copy RED→GREEN e repetição do E2E/capturas.

Formulário, API, economia operacional e condição de lançamento permanecem. O envio usa adapter de teste; não comprova entrega real de e-mail ou operação do Club. CI e Preview atualizados são registrados no PR. Capturas anteriores ao refinamento estão no diretório [profiles](../profiles/).
