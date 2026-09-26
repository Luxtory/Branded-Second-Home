import { describe, expect, it } from 'vitest';
import {
  gateRequirements,
  playwrightPassedTitles,
  tagsIn,
  vitestPassedTitles,
} from '../../scripts/trace.mjs';

describe('trace', () => {
  it('conta só testes aprovados do Vitest, com o título completo', () => {
    const report = {
      testResults: [
        {
          assertionResults: [
            { ancestorTitles: ['módulo'], title: '[REQ-010] ok', status: 'passed' },
            { ancestorTitles: [], title: '[REQ-011] falhou', status: 'failed' },
            { ancestorTitles: [], title: '[REQ-012] pulado', status: 'skipped' },
          ],
        },
      ],
    };

    expect(vitestPassedTitles(report)).toEqual(['módulo [REQ-010] ok']);
  });

  it('conta só specs do Playwright em que todos os testes passaram', () => {
    const report = {
      suites: [
        {
          title: 'lab.spec.ts',
          specs: [
            { title: '[ADR-0003] ok', tests: [{ status: 'expected' }] },
            { title: '[REQ-020] falhou', tests: [{ status: 'unexpected' }] },
          ],
          suites: [
            { title: 'grupo', specs: [{ title: '[EC-3] ok', tests: [{ status: 'expected' }] }] },
          ],
        },
      ],
    };

    expect(playwrightPassedTitles(report)).toEqual([
      'lab.spec.ts [ADR-0003] ok',
      'lab.spec.ts grupo [EC-3] ok',
    ]);
  });

  it('extrai tags canônicas e convenções EC/CONC, inclusive adjacentes', () => {
    const tags = tagsIn([
      '[PD-003][EC-3] carnaval',
      '[INV-1][CONC-1] corrida',
      '[ADR-0003] lab',
      'REQ-099 sem colchetes',
    ]);

    expect([...tags].sort()).toEqual(['ADR-0003', 'CONC-1', 'EC-3', 'INV-1', 'PD-003']);
  });

  it('deriva o gate dos canônicos, sem números fixos', () => {
    const productSpec =
      'REQ-010 REQ-011 PD-001 INV-1 INV-2\n## 15. Edge cases\n\n1. a;\n2. b;\n\n## 16. Outro\n3. não conta';
    const technicalSpec = 'Concorrência:\n\na×b · c×d · e×f.\n';

    expect(gateRequirements(productSpec, technicalSpec)).toEqual({
      REQ: ['REQ-010', 'REQ-011'],
      PD: ['PD-001'],
      INV: ['INV-1', 'INV-2'],
      EC: ['EC-1', 'EC-2'],
      CONC: ['CONC-1', 'CONC-2', 'CONC-3'],
    });
  });
});
