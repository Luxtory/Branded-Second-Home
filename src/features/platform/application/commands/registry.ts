/** Módulos do TECH-011: cada command pertence a um módulo dono do estado que ele altera. */
export const MODULES = [
  'identity',
  'catalog',
  'ownership',
  'calendar',
  'inventory',
  'booking',
  'luxchange',
  'credits',
  'pricing',
  'billing',
  'admin',
  'platform',
] as const;
export type Module = (typeof MODULES)[number];

/**
 * Coluna "Autoridade" do TECH-051. Detentor, solicitante e ofertante são Titulares em relação ao objeto. `grantee`:
 * operação não crítica que uma party só executa por `authorization_grant` (TECH-051, REQ-014). `invitee` (W7): o próprio
 * usuário convidado, sobre a delegação pendente dele (spec identity §13.4).
 */
export type Authority =
  | 'titular'
  | 'holder'
  | 'requester'
  | 'offerer'
  | 'admin'
  | 'admin_or_super_admin'
  | 'super_admin'
  | 'grantee'
  | 'invitee';

/** Coluna "Membership" do TECH-051: `not_applicable` = "—". */
export type MembershipRule = 'eligible' | 'not_required' | 'not_applicable';

export interface CommandSpec {
  readonly name: string;
  readonly module: Module;
  readonly authority: Authority;
  readonly membership: MembershipRule;
  /** Econômico ou de estado crítico: consta da tabela fechada do TECH-051. */
  readonly critical: boolean;
}

const critical = (
  name: string,
  module: Module,
  authority: Authority,
  membership: MembershipRule,
): CommandSpec => ({ name, module, authority, membership, critical: true });

const admin = (name: string, module: Module): CommandSpec =>
  critical(name, module, 'admin', 'not_applicable');

/**
 * Tabela fechada do TECH-051. Os handlers chegam com a wave de cada módulo (plano de waves). As duas linhas de PRL
 * não têm nome no `03`: `publish_initial_prl` (publicar PRL inicial) e `change_published_prl` (alterar PRL publicado).
 */
export const CRITICAL_COMMANDS: readonly CommandSpec[] = [
  critical('create_own_use_booking', 'booking', 'titular', 'not_required'),
  critical('cancel_own_use_booking', 'booking', 'titular', 'not_required'),
  critical('nominate_guest', 'booking', 'titular', 'not_required'),
  critical('deposit_capacity', 'luxchange', 'titular', 'eligible'),
  critical('send_request', 'luxchange', 'titular', 'eligible'),
  critical('create_direct', 'luxchange', 'titular', 'eligible'),
  critical('buy_luxplus', 'booking', 'titular', 'eligible'),
  critical('authorize_rental', 'booking', 'titular', 'eligible'),
  critical('accept_request', 'luxchange', 'holder', 'eligible'),
  critical('reject_request', 'luxchange', 'holder', 'not_required'),
  critical('withdraw_request', 'luxchange', 'requester', 'not_required'),
  critical('withdraw_rental_offer', 'booking', 'offerer', 'not_required'),
  admin('formalize_acquisition', 'ownership'),
  admin('select_luxtory_capacity', 'calendar'),
  admin('declare_no_show', 'booking'),
  admin('recover_future_capacity', 'inventory'),
  admin('confirm_rental', 'booking'),
  admin('transfer_holding', 'ownership'),
  admin('register_debt', 'billing'),
  admin('apply_delinquency_restriction', 'billing'),
  admin('authorize_delinquency_commercialization', 'billing'),
  admin('open_exception', 'booking'),
  admin('resolve_exception', 'booking'),
  admin('correct_use_right', 'calendar'),
  admin('reverse_credit', 'credits'),
  admin('publish_policy', 'pricing'),
  admin('set_parameter', 'admin'),
  critical('publish_initial_prl', 'pricing', 'admin_or_super_admin', 'not_applicable'),
  critical('change_published_prl', 'pricing', 'super_admin', 'not_applicable'),
];

/**
 * Operações não críticas do REQ-095: o TECH-051 as submete ao mesmo guard, base registrada e auditoria, sem efeito
 * econômico novo. Registro separado — `CRITICAL_COMMANDS` continua exatamente a tabela fechada do TECH-051.
 */
const nonCritical = (name: string, module: Module): CommandSpec => ({
  name,
  module,
  authority: 'admin',
  membership: 'not_applicable',
  critical: false,
});

export const NON_CRITICAL_OPERATIONS: readonly CommandSpec[] = [
  // W8 (ownership §15): structuring and a one-way operation-start record, without new economic effects.
  nonCritical('register_second_home_initial_allocation', 'ownership'),
  nonCritical('register_second_home_administration', 'ownership'),
  nonCritical('register_second_home_operation_start', 'ownership'),
  nonCritical('grant_authorization', 'identity'),
  // Pessoas e empresas e representações (W7, spec identity §13): party, convite e revogação pelo Admin; ativação pelo
  // próprio convidado.
  nonCritical('register_party', 'identity'),
  nonCritical('create_party_delegation', 'identity'),
  nonCritical('revoke_party_delegation', 'identity'),
  {
    name: 'activate_party_delegation',
    module: 'identity',
    authority: 'invitee',
    membership: 'not_applicable',
    critical: false,
  },
  // Catálogo (W3, W4.2; REQ-095; docs/specs/catalog.md §5, §17): o Admin opera Home Concepts, Home Editions e Second
  // Homes.
  nonCritical('register_brand_partner', 'catalog'),
  nonCritical('authorize_brand_exposure', 'catalog'),
  nonCritical('terminate_brand_partner', 'catalog'),
  nonCritical('create_home_concept_version', 'catalog'),
  nonCritical('approve_home_concept_version', 'catalog'),
  nonCritical('register_investor_authorization', 'catalog'),
  nonCritical('revoke_investor_authorization', 'catalog'),
  nonCritical('create_home_edition', 'catalog'),
  nonCritical('update_home_edition_draft', 'catalog'),
  nonCritical('finalize_home_edition', 'catalog'),
  nonCritical('publish_home_edition', 'catalog'),
  nonCritical('withdraw_home_edition', 'catalog'),
  nonCritical('correct_home_edition_editorial', 'catalog'),
  nonCritical('upload_home_edition_media', 'catalog'),
  nonCritical('approve_home_edition_media', 'catalog'),
  nonCritical('withdraw_home_edition_media', 'catalog'),
  nonCritical('register_second_home', 'catalog'),
  // Coleção (Wave 4.1, spec catalog §13.12; média projetada na W4.2): vocabulários, capa, curadoria e média projetada.
  nonCritical('create_catalog_term', 'catalog'),
  nonCritical('update_catalog_term', 'catalog'),
  nonCritical('upload_home_concept_cover', 'catalog'),
  nonCritical('approve_home_concept_media', 'catalog'),
  nonCritical('withdraw_home_concept_media', 'catalog'),
  nonCritical('set_home_concept_curation', 'catalog'),
  nonCritical('register_home_edition_projected_investment', 'catalog'),
  nonCritical('end_home_edition_projected_investment', 'catalog'),
];

export class CommandRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandRegistryError';
  }
}

/** Registro fechado: o executor só roda handlers de commands registrados. */
export class CommandRegistry {
  private readonly specs = new Map<string, CommandSpec>();

  constructor(specs: readonly CommandSpec[]) {
    for (const spec of specs) {
      if (!/^[a-z][a-z0-9_]*$/.test(spec.name)) {
        throw new CommandRegistryError(`Invalid command name: ${spec.name}`);
      }
      if (this.specs.has(spec.name)) {
        throw new CommandRegistryError(`Duplicate command: ${spec.name}`);
      }
      this.specs.set(spec.name, spec);
    }
  }

  get(name: string): CommandSpec | undefined {
    return this.specs.get(name);
  }

  list(): readonly CommandSpec[] {
    return [...this.specs.values()];
  }

  /** Operações que um `authorization_grant` pode listar (autoridade `grantee`). */
  grantable(): readonly CommandSpec[] {
    return this.list().filter((spec) => spec.authority === 'grantee');
  }
}

/** Registro do executor: a tabela fechada do TECH-051 composta com as operações não críticas. */
export const commandRegistry = new CommandRegistry([
  ...CRITICAL_COMMANDS,
  ...NON_CRITICAL_OPERATIONS,
]);
