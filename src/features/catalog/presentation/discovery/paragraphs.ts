/**
 * Texto registrado → parágrafos (docs/specs/catalog.md §13.7): separados por linha em branco; quebra simples vira
 * espaço. Nenhum HTML é interpretado — o React escapa o texto.
 */
export function toParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter((paragraph) => paragraph.length > 0);
}
