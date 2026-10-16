import { expect, test } from '@playwright/test';

const views = [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1266, height: 546 },
  { width: 1440, height: 900 },
] as const;
const routes = ['/sobre', '/brand-partner/sobre'] as const;

test('Sobre: mesma tipografia, geometria e composição em B2C e B2B', async ({ page }) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const viewport of views) {
    await page.setViewportSize(viewport);
    const layouts = [];
    for (const route of routes) {
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready);
      layouts.push(
        await page.locator('.lx-about').evaluate((root) => {
          const top = root.getBoundingClientRect().top;
          return [...root.querySelectorAll('h1,h2,h3,p,figcaption,img')].map((node) => {
            const style = getComputedStyle(node);
            const box = node.getBoundingClientRect();
            return {
              text: node.textContent,
              size: style.fontSize,
              line: style.lineHeight,
              font: style.fontFamily,
              color: style.color,
              italic: style.fontStyle,
              x: box.x,
              y: box.y - top,
              width: box.width,
              height: box.height,
            };
          });
        }),
      );
    }
    expect(layouts[1], `${viewport.width}px: corpo institucional idêntico`).toEqual(layouts[0]);
  }
});

test('Sobre: blocos com até quatro linhas e conteúdo enquadrado nas seções e no Hero', async ({
  page,
}) => {
  test.slow();
  for (const viewport of views) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready);
      const blocks = await page
        .locator('.lx-about :is(h1,h2,h3,p,figcaption)')
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const style = getComputedStyle(node);
            return {
              text: node.textContent,
              lines: Math.round(
                node.getBoundingClientRect().height / Number.parseFloat(style.lineHeight),
              ),
            };
          }),
        );
      expect(
        blocks.filter((block) => block.lines > 4),
        `${route} ${viewport.width}px: máximo 4 linhas`,
      ).toEqual([]);
      const hero = await page.locator('#sobre').boundingBox();
      expect(hero).not.toBeNull();
      expect(
        hero!.y + hero!.height,
        `${route} ${viewport.width}×${viewport.height}: Hero completo na primeira tela`,
      ).toBeLessThanOrEqual(viewport.height + 1);
      const escaped = await page.locator('.lx-about > section').evaluateAll((sections) =>
        sections.flatMap((section) => {
          const box = section.getBoundingClientRect();
          return [...section.querySelectorAll('h1,h2,h3,p,a,img,figcaption')]
            .filter((node) => {
              const child = node.getBoundingClientRect();
              return (
                child.left < box.left - 1 ||
                child.right > box.right + 1 ||
                child.top < box.top - 1 ||
                child.bottom > box.bottom + 1
              );
            })
            .map((node) => ({ section: section.id, text: node.textContent }));
        }),
      );
      expect(escaped, `${route}: conteúdo dentro da seção`).toEqual([]);
    }
  }
});
