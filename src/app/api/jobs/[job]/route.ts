export { runJob as GET } from '@/features/platform/presentation/jobs';

// Cada chamada executa o job: nunca servir do cache.
export const dynamic = 'force-dynamic';
