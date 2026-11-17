# SHP — participação durante a afiliação e revisão visual

REQ-105 · 01 v10.7 §35 · catalog §20.8 · D-SHP-18. Regra expressa pelo fundador em 17/11/2026: o parceiro responsável pela afiliação participa do faturamento enquanto o imóvel permanecer afiliado. Substitui a indefinição de duração da revisão anterior; valores dependem do faturamento e das condições contratadas.

Fechamento: “A venda termina. Sua participação continua.” A condição aparece junto: “Enquanto o imóvel estiver afiliado, você participa do faturamento que ele gera.” Benefício “Receita além da venda” e FAQ alinhados. Não há alteração de base econômica, percentual, API ou operação do Club.

## Fotografias

O [diagnóstico anterior à correção](baseline-loading.json) reproduz as três fotos lazy abaixo da dobra sem solicitação após captura fullpage. Após rolagem, todas carregaram com respostas200; arquivos originais válidos. Essa evidência não determina se houve erro do otimizador remoto no print do usuário. O transporte impediu navegação automatizada direta ao Preview.

As três imagens agora são solicitadas desde a abertura, com prioridade baixa. A otimização é preservada; uma falha recupera o original correspondente, mesmo se ocorrer antes da hidratação. Falha também no original não provoca loop. Fundo institucional mantém geometria e legibilidade. Nenhuma fotografia substituída ou CSP relaxada.

## Capturas reais

Build local de produção Next16.4.5 / Node22, Chromium, imagens/fontes carregadas. Capturas não são mockups. Os recortes ocultam somente o cabeçalho durante a captura, via adoptedStyleSheets; o produto mantém seu cabeçalho.

| Conteúdo | Celular390px | Desktop1440px |
|---|---|---|
| Página completa | [Ver](pagina-completa-390.jpg) | [Ver](pagina-completa-1440.jpg) |
| Hero | [Ver](hero-390.jpg) | [Ver](hero-1440.jpg) |
| Oportunidade | [Ver](oportunidade-390.jpg) | [Ver](oportunidade-1440.jpg) |
| Três estágios | [Ver](empreendimentos-390.jpg) | [Ver](empreendimentos-1440.jpg) |
| Imobiliárias e corretores | [Ver](intermediadores-390.jpg) | [Ver](intermediadores-1440.jpg) |
| Formulário incorporadora | [Ver](formulario-incorporadora-390.jpg) | [Ver](formulario-incorporadora-1440.jpg) |
| Formulário imobiliária | [Ver](formulario-imobiliaria-390.jpg) | [Ver](formulario-imobiliaria-1440.jpg) |
| Formulário corretor | [Ver](formulario-corretor-390.jpg) | [Ver](formulario-corretor-1440.jpg) |

## Verificação

- Testes RED observados: dois de copy/duração e três cenários reais de carregamento/recuperação.
- 51 testes direcionados aprovados; lint, tipos e build aprovados.
- 22/22 E2E: duração/copy, Hero e fechamentos no padrão da Home, fotos carregadas sem rolagem, falha antes da hidratação, falha dupla sem loop, navegação, SEO, três perfis até API/adapter determinístico, retry e validação acessível.
- [Métricas](metrics.json): seis larguras320/390/768/1024/1440/1920 sem overflow; até3linhas por bloco nas larguras verificadas≥390 e até4a320; fonte200% sem clipping320/390/768/1440.
- axe0 em390/1440; contraste mínimo sobre fotos7,38:1; console limpo no caminho normal. As falhas de imagem nos testes são simuladas por interceptação.

Revisão independente do incremento: nenhum Critical/Important. Observação Minor sobre cobertura de falha tardia levou ao reforço do teste existente: o erro do otimizador só é liberado após uma mudança de perfil comprovar a hidratação. Os três cenários de imagem passaram novamente; nenhuma alteração adicional no produto. Escopo externo à revisão: promoção de produção (condicionada), software de atribuição financeira (não implementado nesta página) e causa remota histórica do print (não observada). Todos aceitos como limites, sem bloqueio à entrega de Preview.

A publicação em produção continua condicionada ao lançamento do Club, conforme D-SHP-16. Esta entrega segue no mesmo PR94/Preview. CI e revisão independente são registradas no PR; nenhuma entrega real de e-mail ou prontidão operacional é inferida pelos adapters de teste.
