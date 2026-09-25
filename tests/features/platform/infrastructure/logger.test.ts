import { describe, expect, it } from 'vitest';
import { createLogger, type Clock } from '@/features/platform';

const FIXED_INSTANT = new Date('2026-09-25T12:00:00.000Z');
const fixedClock: Clock = { now: () => FIXED_INSTANT };

function capture() {
  const lines: { line: string; level: string }[] = [];
  const logger = createLogger(
    { service: 'test' },
    (line, level) => lines.push({ line, level }),
    fixedClock,
  );
  const parsed = () => lines.map(({ line }) => JSON.parse(line) as Record<string, unknown>);
  return { logger, lines, parsed };
}

describe('logger JSON', () => {
  it('escreve uma linha JSON por evento, com instante do relógio injetado e campos herdados', () => {
    const { logger, lines, parsed } = capture();
    logger.child({ correlation_id: 'abc12345' }).info('request done', { status: 200 });

    expect(lines).toHaveLength(1);
    expect(parsed()[0]).toEqual({
      time: '2026-09-25T12:00:00.000Z',
      level: 'info',
      msg: 'request done',
      service: 'test',
      correlation_id: 'abc12345',
      status: 200,
    });
  });

  it('[TECH-100] nunca registra PII ou segredo, mesmo aninhado', () => {
    const { logger, parsed } = capture();
    logger.warn('dados', {
      cpf: '12345678900',
      party: { email: 'titular@example.com', nome: 'Fulano', stake: 3 },
      headers: { authorization: 'Bearer abc' },
    });

    const entry = JSON.stringify(parsed()[0]);
    expect(entry).not.toMatch(/12345678900|titular@example\.com|Fulano|Bearer abc/);
    expect(parsed()[0]).toMatchObject({ party: { stake: 3 } });
  });

  it('serializa erros com nome, mensagem e stack e usa o nível correto', () => {
    const { logger, lines, parsed } = capture();
    logger.error('falhou', { error: new TypeError('tipo inválido') });

    expect(lines[0]?.level).toBe('error');
    expect(parsed()[0]).toMatchObject({ error: { name: 'TypeError', message: 'tipo inválido' } });
    expect((parsed()[0]?.error as { stack?: string }).stack).toContain('TypeError');
  });
});
