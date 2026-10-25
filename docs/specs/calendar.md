# Calendário — classificação civil (W8)

## 1. Fontes e escopo

Fontes: 01 BR-074, BR-080–083, BR-090–095, BR-107–109; 02 PD-003/EC-3 e REQ-033; 03 TECH-020/026/040/041/110.
Esta spec referencia essas regras e define somente sua aplicação técnica na formalização, sem substituir o texto canônico.

W8 entrega PD-003 e a classificação civil necessária à formalização. Não entrega janelas, rotação, sorteio, selagem, custódia, reservas, balance ou calendário operacional anual.

## 2. Representação e fronteiras

- Datas civis ISO YYYY-MM-DD e timezone IANA da Second Home; instantes reais UTC.
- A base operation_start_date é civil. Seu ano é o primeiro exercício. A partialidade é derivada de mês/dia, não da data de aquisição.
- temporal-polyfill 1.0.5 (HERDADA, ADR-0004) fica encapsulado no adapter; tipos próprios de data/season atravessam a porta pública.
- Enumeração de noites é determinística e efêmera; não existe calendário persistido paralelo.
- Na base atual, nenhuma fonte modelada compromete noites antes da formalização. W8 não inventa bloqueios externos ou antecipa W10.

## 3. Classificação e validação

Aplicar diretamente PD-003/TECH-041: computus gregoriano; Carnaval a partir da sexta anterior à terça Páscoa-47; começo em 01/02 no caso de sexta em janeiro; selecionar dez datas adicionais válidas, ignorando 29/02 e meses já Alta.

Janeiro/julho/dezembro são alta; demais noites media, ressalvada a janela adicional. 29/02 é media extraordinária e não integra as contagens ordinárias.
Noite futura tem check-in canônico às 14h local estritamente posterior ao relógio revalidado. A capacidade civil do primeiro exercício começa na base civil e termina em 31/12, excluindo 29/02 e noites transcorridas.
O handler chama a validação com relógio fresco após locks. Contagens não são reservas e não autorizam uso operacional.

## 4. Aceite e testes

- PD-003/EC-3: casos independentes de Carnaval, sexta 31/01 em 1913, início 01/02, salto de 29/02, ausência de duplicação em meses Alta.
- TECH-110: varrer 1900..2100; 2000 bissexto e 2100 não bissexto; 103 alta/262 media ordinários, mais leap quando aplicável.
- TECH-040: múltiplos fusos, virada de exercício, datas inválidas e fronteira exata de 14h; domínio não depende do timezone do processo.
- Primeiro exercício parcial: somente noites futuras desde operation_start_date. Quantidades são fornecidas e validadas em ownership, nunca proporcionadas pelo calendário.
