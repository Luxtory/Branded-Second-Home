import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// W13 E5 (spec booking §10.16; plano W13 critérios 1 e 4): contrato estático do workflow do autorizador e equivalência
// da variante publicada no repositório sandbox. As provas de plataforma (critérios 2, 3 e a varredura do 5) vêm dos runs
// do sandbox; estas asserções impedem que o arquivo versionado se afaste do que foi provado.
const WORKFLOW = '.github/workflows/booking-authorizer.yml';
const SANDBOX = 'tests/fixtures/booking-authorizer-sandbox.yml';
const SANDBOX_STEP = /^Sandbox: /;
const PINNED_ACTION = /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/;

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
}
interface Job {
  name: string;
  if: string;
  'runs-on': string;
  environment: string;
  'timeout-minutes': number;
  permissions?: unknown;
  services?: Record<string, { image: string; ports: string[] }>;
  steps: Step[];
}
interface Workflow {
  name: string;
  on: Record<string, { inputs: Record<string, Record<string, unknown>> }>;
  permissions: Record<string, string>;
  concurrency?: unknown;
  env?: unknown;
  jobs: Record<string, Job>;
}

const load = (path: string) => parse(readFileSync(path, 'utf8')) as Workflow;
const workflow = load(WORKFLOW);
const job = workflow.jobs.authorize!;
const ciActions = new Set(
  [...readFileSync('.github/workflows/ci.yml', 'utf8').matchAll(/uses: (\S+@[0-9a-f]{40})/g)].map(
    (m) => m[1],
  ),
);

describe('W13 E5 — workflow do autorizador (plano W13 critérios 1 e 4)', () => {
  it('[TECH-051][ADR-0027 §4] só disparo manual, leitura do conteúdo, um job no Environment e só na main', () => {
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(Object.keys(workflow.jobs)).toEqual(['authorize']);
    expect(job.if).toBe(
      "github.ref == 'refs/heads/main' && github.event_name == 'workflow_dispatch'",
    );
    expect(job.environment).toBe('booking-authorizer');
    expect(job.permissions).toBeUndefined();
    expect(job['timeout-minutes']).toBeGreaterThan(0);
  });

  it('[TECH-051][A4] entradas: ação fechada e id opaco — nenhuma reserva, data ou evidência', () => {
    expect(workflow.on.workflow_dispatch!.inputs).toEqual({
      action: expect.objectContaining({
        type: 'choice',
        options: ['authorize', 'revoke'],
        required: true,
      }),
      id: expect.objectContaining({ type: 'string', required: true }),
    });
  });

  it('[TECH-051] actions fixadas pelos mesmos SHAs da ci.yml; checkout sem credencial; sem cache', () => {
    const uses = job.steps.flatMap((step) => (step.uses ? [step.uses] : []));
    expect(uses).toHaveLength(2);
    for (const action of uses) {
      expect(action).toMatch(PINNED_ACTION);
      expect(ciActions.has(action)).toBe(true);
    }
    expect(job.steps[0]!.with).toEqual({ 'persist-credentials': false });
    expect(job.steps[1]!.with).toEqual({ 'node-version': 22 });
  });

  it('[TECH-051][A4][T-1321] entrada nunca interpolada: o id não vai a run nem a env (impresso no log público)', () => {
    const runs = job.steps.flatMap((step) => (step.run ? [step.run] : []));
    expect(runs).toEqual([
      'npm ci --omit=dev --ignore-scripts',
      'node scripts/booking-authorizer.mjs',
    ]);
    for (const run of runs) expect(run).not.toContain('${{');
    // O único valor do `env:` do passo é o secret (mascarado pelo runner); o programa lê o evento.
    expect(job.steps.at(-1)!.env).toEqual({
      BOOKING_AUTHORIZER_DATABASE_URL: '${{ secrets.BOOKING_AUTHORIZER_DATABASE_URL }}',
    });
    const text = readFileSync(WORKFLOW, 'utf8');
    expect(text.match(/\$\{\{[^}]*\}\}/g)).toEqual([
      '${{ secrets.BOOKING_AUTHORIZER_DATABASE_URL }}',
    ]);
    // Nenhum acesso às entradas ou ao payload do evento (o `if` usa só `github.event_name`).
    expect(text).not.toMatch(/inputs\.|github\.event\./);
    expect(workflow.env).toBeUndefined();
    expect(job.steps.slice(0, -1).every((step) => step.env === undefined)).toBe(true);
  });

  it('[TECH-051] a variante do sandbox, sem o overlay, é idêntica ao workflow real', () => {
    const sandbox = load(SANDBOX);
    const sandboxJob = sandbox.jobs.authorize!;
    const overlay = sandboxJob.steps.filter((step) => SANDBOX_STEP.test(step.name ?? ''));
    expect(overlay).toHaveLength(1);
    expect(sandboxJob.services?.postgres?.image).toMatch(/^postgres:17\.\d+@sha256:[0-9a-f]{64}$/);
    expect(sandboxJob.services?.postgres?.ports).toEqual(['127.0.0.1:5432:5432']);
    // O overlay roda antes da instalação de produção: o passo do autorizador encontra só as dependências de produção.
    const names = sandboxJob.steps.map((step) => step.name);
    expect(names.indexOf(overlay[0]!.name)).toBeLessThan(
      names.indexOf('Install (production dependencies, no lifecycle scripts)'),
    );

    const authorize: Job = {
      ...sandboxJob,
      steps: sandboxJob.steps.filter((step) => !overlay.includes(step)),
    };
    delete authorize.services;
    const withoutOverlay = { ...sandbox, jobs: { authorize } };
    expect(withoutOverlay).toEqual(workflow);
  });
});
