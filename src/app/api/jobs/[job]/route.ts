export { runJob as GET } from '@/features/platform/presentation/jobs';

// Cada chamada executa o job: nunca servir do cache.
export const dynamic = 'force-dynamic';
// Teto da função (Vercel Hobby com Fluid compute: 300 s). O `open_exercise` para antes, pelo próprio orçamento.
export const maxDuration = 300;
