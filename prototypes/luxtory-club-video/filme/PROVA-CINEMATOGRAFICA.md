# Prova cinematográfica: plano sem ferramentas pagas (v7.0)

> **Restrição da Luxtory (18/11/2026):** nenhuma ferramenta paga além do Claude Code e do ChatGPT (com o Codex), já
> assinados, mais planos gratuitos. Nada é contratado. Os planos v6.3 a v6.5, que dependiam de APIs pagas do Google,
> ficam só no histórico do Git.
>
> Complementa `DIRECAO-DE-ARTE.md` (bíblias, 17 planos e prompts), que continua válido. Fontes consultadas em
> 18/11/2026; limites de planos gratuitos mudam e devem ser reconferidos no dia.

## 1. Ferramentas e o que cada uma faz

| Função | Ferramenta | O que está verificado | Limites e riscos |
|---|---|---|---|
| Imagens-chave, edições e primeiros quadros | **ChatGPT, geração de imagens** (no plano já pago) | incluída no plano, com limites de uso; a saída pertence ao usuário pelos [Termos de Uso](https://openai.com/policies/row-terms-of-use/); as imagens trazem C2PA e SynthID ([proveniência](https://help.openai.com/en/articles/8912793-c2pa-and-synthid-in-openai-generated-images)) | limites variam com a demanda; resolução por volta de 1,5 MP (formatos paisagem 3:2, retrato 2:3 ou quadrado), o que exige recorte para 16:9 ou 9:16 e um leve aumento até 1080p |
| Vídeo gerado (movimento de pessoas) | **ChatGPT: não há mais.** O Sora foi descontinuado em 26/04/2026 ([OpenAI](https://openai.com/index/sora-is-here/)) | — | — |
| Vídeo gerado, alternativa gratuita | **Google Vids**, conta Google pessoal: "Animate" transforma uma imagem enviada em clipe de 8 s | gratuito para contas pessoais, com limite mensal (a página de ajuda cita 60 s de clipes de IA por mês) ([ajuda](https://support.google.com/docs/answer/16143507?hl=en), [disponibilidade](https://support.google.com/docs/answer/15609411?hl=en)) | **uso comercial fora do Vids não confirmado:** um guia comunitário do Google cita "uso apenas dentro do Vids". Serve para a prova interna; no filme, só depois de confirmação oficial |
| Câmera sobre fotografia (2,5D) | **Claude Code + ffmpeg**, já no repositório | push-in, pan e tilt determinísticos, sem artefato de geração; paralaxe com mapa de profundidade de um modelo aberto rodando localmente em CPU (a testar) | dá vida a arquitetura e a momentos contemplativos; não cria gesto humano |
| Pessoas reais em movimento | **Pexels, Pixabay e Mixkit** (gratuitos) | uso comercial permitido, sem atribuição ([Pexels](https://www.pexels.com/license/), [Pixabay](https://pixabay.com/service/license-summary/)) | **não garantem autorização das pessoas:** preferir rostos não identificáveis ou obter autorização; nunca sugerir endosso; casa do anúncio ≠ casa do filme, então só planos sem arquitetura identificável |
| Trilha e efeitos | **Pixabay Music e efeitos** | uso em vídeo comercial como parte da obra ([FAQ Pixabay](https://pixabay.com/service/faq/)) | guardar o certificado de licença; possível reivindicação de Content ID no YouTube. A YouTube Audio Library não serve: a licença fora do YouTube não é clara |
| Narração | **voz humana gravada pela equipe** (celular em ambiente silencioso), tratada no Audacity (gratuito) e mixada pelo Claude Code | sem custo | qualidade depende da voz e da sala; locução profissional paga fica fora |
| Montagem, cor, legendas, interfaces e QA | **Claude Code** (pipeline atual: `capture.mjs`, `montar.mjs`, `check.mjs`); **Codex** opcional para código em paralelo; DaVinci Resolve (gratuito) opcional para cor manual | sem custo | — |
| Troca de arquivos | **pasta no Google Drive** da Luxtory; o Claude baixa pelo conector do Drive | sem custo | os arquivos ficam fora do Git (`out/entrada/`) |

**O que o plano gratuito não tem:** um gerador de vídeo com consistência de casa e de personagem e com licença
comercial clara. A linguagem do filme se ajusta a isso (§2), sem mudar a direção de arte.

## 2. Linguagem visual ajustada: fotografia em movimento

A direção continua: luxo contemporâneo, arquitetura extraordinária, privacidade, pertencimento, experiências humanas,
sofisticação sem ostentação. O que muda é a fonte de cada plano:

- **Arquitetura e atmosfera:** fotografia gerada no ChatGPT a partir da imagem-chave mestra, animada com câmera 2,5D.
  É a mesma linguagem de filmes de arquitetura de alto padrão e garante a mesma casa em todos os planos.
- **Gesto humano espontâneo:** footage real gratuito, enquadrado sem arquitetura identificável (rosto de lado ou de
  costas, mãos, mesa, água, fogo, paisagem). Também o Vids, se o uso comercial for confirmado.
- **Personagens em quadro com a casa:** foto do ChatGPT com Helena e o parceiro na casa, em plano contemplativo com
  câmera 2,5D lenta.

| Plano | Fonte principal (gratuita) | Alternativa |
|---|---|---|
| S01, S06, S07, S08, S11, S12, S14 (arquitetura e lugar) | foto ChatGPT + 2,5D | — |
| S03 (interior da Satori) | foto ChatGPT + 2,5D | — |
| S04, S05 (Helena no terraço, contemplativa) | foto ChatGPT com Helena + 2,5D lenta | footage real de costas ou de perfil |
| S02 (casal ou família no terraço) | prova: Vids "Animate" do quadro composto; filme: footage real sem arquitetura identificável | foto ChatGPT + 2,5D |
| S10 (chegada à Azzura) | foto ChatGPT com Helena no interior + 2,5D | footage real de chegada, sem interior identificável |
| S13 (três gerações) e S17 (risos) | footage real com autorização das pessoas (crianças só com autorização dos responsáveis) | filmagem própria com voluntários autorizados |
| S15 (taças, mãos, fogo) | footage real de detalhe, sem rosto | foto ChatGPT + 2,5D |
| S16 (manhã fria, Helena) | foto ChatGPT + 2,5D | footage real sem rosto |
| S09 (o outro Titular, sem rosto) | footage real (apartamento na cidade, por cima do ombro) | foto ChatGPT + 2,5D |

**Crianças:** a família intergeracional continua no filme. Saem de footage real com autorização ou de filmagem
própria autorizada, nunca contornando restrições de ferramentas.

## 3. Prova das três tomadas (custo adicional zero)

Consome só os limites do plano do ChatGPT e o limite gratuito do Vids.

**Estágio A · referências (você no ChatGPT; o Claude avalia)**
- **Gerar 2 a 3 candidatas por chave,** com os prompts de `DIRECAO-DE-ARTE.md` §1 a §3:
  - K-AZ em paisagem (3:2);
  - K-SA;
  - folhas de Helena e do parceiro;
  - K-OL.
- **Editar a imagem aprovada no próprio ChatGPT,** nunca recriar a arquitetura com um prompt novo:
  - **K-AZ vertical:** enviar a K-AZ aprovada e pedir para "estender este mesmo quadro para retrato, sem mudar a casa;
    só céu acima e deque abaixo";
  - **K-OL-n:** enviar a K-OL aprovada e pedir "mesma foto, mesma casa e enquadramento; só a hora muda para o azul do
    anoitecer de inverno, com o fogareiro baixo aceso no pátio";
  - **primeiro quadro do S02:** enviar K-SA, Helena e o parceiro e pedir a composição dos dois no terraço;
  - **primeiro quadro do S15:** editar a K-OL-n para o detalhe das taças e mãos.
- **Exportar em PNG,** na maior resolução oferecida, e colocar na pasta do Drive `Luxtory/prova/A/`, separada por
  imóvel.
- **O Claude avalia:** arquitetura, materiais, luz, enquadramento, rostos e continuidade (§5). Só a imagem aprovada
  segue.

**Estágio B · movimento**
- **S06 · Azzura:** o Claude gera a câmera 2,5D sobre a K-AZ (16:9) e a K-AZ vertical (9:16). O movimento simula a
  grua descendo devagar, com push-in de até 3%, a 24 fps nativos e 8 s.
- **S15 · Olivar:** o Claude gera um push-in 2,5D muito lento sobre o primeiro quadro, e você indica 1 ou 2 clipes de
  detalhe de taças e fogo do Pexels ou do Pixabay como comparação. Escolhe-se o melhor.
- **S02 · Satori:**
  - você anima o primeiro quadro no Vids ("Animate", 8 s, com o prompt de movimento de `DIRECAO-DE-ARTE.md` §1),
    usando 8 s do limite mensal;
  - o Claude faz a versão 2,5D do mesmo quadro como comparação;
  - o clipe do Vids é só de prova enquanto o uso comercial não for confirmado.

**Estágio C · refinamento:** só quando houver defeito específico. Por exemplo, nova edição da imagem no ChatGPT ou
outro clipe de footage. Nunca para aumentar a quantidade.

## 4. Requisitos técnicos

- **Cadência:** master a 24 fps, mantido.
  - O 2,5D é renderizado nativamente a 24 fps.
  - Footage gratuito só em 24 fps nativo, ou 48/120 fps em câmera lenta exata. Clipes a 23,976 fps são ajustados por
    tempo (+0,1%, sem criar quadros). Clipes a 25, 30 ou 60 fps ficam fora.
  - A cadência do Vids é medida com `ffprobe`.
- **Resolução:** as imagens do ChatGPT (≈ 1536 × 1024) recortadas para 16:9 pedem um aumento de cerca de 1,25× até
  1080p.
  - Teste do estágio A: a 100% em 1080p, nenhuma maciez visível.
  - Se houver, aplicar um upscaler aberto local em CPU (lento, mas sem custo) e repetir a verificação.
  - O push-in máximo fica em 3% para não amaciar mais.
- **Proveniência:** preservar os metadados C2PA dos arquivos sempre que o fluxo permitir.
- **Licenças:** guardar o certificado de cada faixa da Pixabay e o link de cada clipe de footage, com a data do
  download.

## 5. Critérios de aprovação (mantidos)

**Reprovação imediata,** sem média de notas:
- casa diferente da imagem-chave;
- vidro, madeira, pedra ou volumes deformados;
- proporções erradas;
- mudança de rosto ou de identidade;
- anatomia incorreta;
- movimento artificial;
- aspecto de CGI;
- maciez de aumento visível;
- composição sem espaço para a interface.

**Sem defeito grave:** nota mínima 4 (de 1 a 5) em arquitetura, pessoas, cinematografia e integração (16:9 e
vertical, continuidade, 1080p real).

**Contingência geral:** se a combinação de foto + 2,5D + footage gratuito não atingir o padrão premium, a alternativa
sem custo de dinheiro é a filmagem própria pontual (celular ou câmera, voluntários com autorização), não a contratação
de ferramentas.

## 6. Quem faz o quê

| Você (Luxtory) | Claude Code |
|---|---|
| gerar e editar as imagens no ChatGPT com os prompts prontos | prompts, avaliação e seleção pelos critérios |
| animar o S02 no Vids (uma geração) | câmera 2,5D, montagem, cor, legendas, interfaces a 24 fps e QA dos arquivos codificados |
| baixar footage e trilha gratuitos indicados, guardando os links e as licenças | busca e pré-seleção de footage e trilha nas bibliotecas gratuitas, com a cadência certa |
| gravar a narração (voz da equipe) quando o corte estiver aprovado | tratamento da voz, mixagem por inteligibilidade, loudness e masters |
| colocar os arquivos na pasta do Drive | baixar pelo conector e manter tudo fora do Git |

## 7. Pendências que não custam dinheiro

- **Uso comercial dos clipes do Vids:** confirmar com o Google (ajuda oficial ou suporte) antes de usar no filme.
- **Autorização de imagem:** para footage com pessoas identificáveis, conseguir a autorização ou escolher clipes sem
  rosto.
- **Revisão jurídica:** narração, supers, descrição e uso de IA.
- **Primeiro passo:** gerar as imagens do estágio A no ChatGPT e colocá-las na pasta do Drive.
