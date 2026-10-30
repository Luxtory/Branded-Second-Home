import type { CommandGuard } from './ports';

/**
 * Guard dos commands de sistema (W10, ADR-0024): nega por padrão; só o job dono executa o command dele, e nenhum
 * usuário executa um command de sistema. Os caminhos HTTP continuam com o guard de identity, que nega o ator `system`.
 */
export const systemCommandGuard: CommandGuard = {
  authorize: (spec, actor) =>
    Promise.resolve(
      actor.kind === 'system' && spec.authority === 'system' && spec.job === actor.job
        ? { allowed: true, authorizationRef: `job:${actor.job}` }
        : { allowed: false },
    ),
};
