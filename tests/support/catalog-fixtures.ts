import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import sharp from 'sharp';
import { expect, vi } from 'vitest';
import { createCatalogHandlers } from '@/features/catalog/application/handlers';
import type { CatalogTermKind, HomeEditionMediaKind } from '@/features/catalog/domain/collection';
import { postgresCatalogStore } from '@/features/catalog/infrastructure/postgres-catalog-store';
import { sharpCoverProcessor } from '@/features/catalog/infrastructure/sharp-cover-processor';
import { memoryMediaStorage } from './media-storage';
import {
  commandRegistry,
  createPostgresCommandStore,
  type Actor,
  type CommandHandler,
  type CommandOutcome,
  type Database,
  type DatabaseTransaction,
  type ErrorCode,
  type JsonValue,
} from '@/features/platform';
import { createCommandExecutor } from '@/features/platform/application/commands/executor';
import { allowAll } from './platform-fixtures';

/** Staff Admin exercendo o papel Admin (o guard real é testado nas rotas; aqui o foco é o command). */
export const CATALOG_STAFF: Actor = {
  kind: 'user',
  userId: '00000000-0000-4000-8000-0000000000d1',
  actingPartyId: null,
  role: 'admin',
};

export const CONTENT = {
  essential_elements: ['Pátio central com espelho d’água', 'Fachada em pedra local'],
  preservation_premises: ['Materiais de origem regional', 'Proporção do pátio preservada'],
  specification:
    'Especificação para Home Editions fiéis e replicáveis e para a apresentação do Home Concept.',
} as const;

/** Definição material e textos de uma Home Edition (BR-031), sem localização, modalidade nem condições. */
export const HOME_EDITION_CONTENT = {
  name: 'Casa do Pátio — Edição Mar',
  description: 'Uma casa térrea organizada em torno do pátio central.',
  typology: 'Casa térrea com pátio central',
  spatial_configuration: 'Estar, jantar e cozinha integrados ao pátio; suítes em ala reservada.',
  projected_area_m2: 420,
  suites: 4,
  guests_max: 10,
  rooms: ['Estar', 'Jantar', 'Cozinha gourmet'],
  amenities: ['Piscina', 'Spa'],
  characteristics: ['Pátio com espelho d’água'],
} as const;

export interface TestImageOptions {
  readonly width?: number;
  readonly height?: number;
  readonly format?: 'jpeg' | 'png' | 'webp' | 'gif';
  /** Orientação EXIF (6 = girar 90°): a imagem fica "deitada" nos pixels, em pé para quem respeita o EXIF. */
  readonly orientation?: number;
  /** Grava EXIF (autor, direitos, local) para provar que o reencode remove os metadados. */
  readonly exif?: boolean;
}

const DEFAULT_IMAGE = { width: 1600, height: 1200 } as const;

/** Imagem de teste gerada pelo `sharp` (nenhum binário no repositório), em base64. */
export async function testImage(options: TestImageOptions = {}): Promise<string> {
  const { width = DEFAULT_IMAGE.width, height = DEFAULT_IMAGE.height, format = 'jpeg' } = options;
  let image = sharp({
    create: { width, height, channels: 3, background: { r: 15, g: 78, b: 103 } },
  });
  if (options.exif === true) {
    image = image.withExif({
      IFD0: { Artist: 'Fotógrafa da casa', Copyright: 'Luxtory', ImageDescription: 'Trancoso, BA' },
    });
  }
  if (options.orientation !== undefined)
    image = image.withMetadata({ orientation: options.orientation });
  const encoded =
    format === 'png'
      ? image.png()
      : format === 'webp'
        ? image.webp()
        : format === 'gif'
          ? image.gif()
          : image.jpeg();
  return (await encoded.toBuffer()).toString('base64');
}

let defaultImage: Promise<string> | null = null;
const coverImage = () => (defaultImage ??= testImage());

/** Relógio controlável (TECH-110): o instante do command é o do `Clock`, nunca o do banco. */
export function controlledClock(start: Date) {
  let current = start;
  return {
    now: () => current,
    set(date: Date) {
      current = date;
    },
    advance(ms: number) {
      current = new Date(current.getTime() + ms);
    },
  };
}

/** Executor real (PostgreSQL, idempotência, auditoria) com o registro de produção e os handlers do catálogo. */
export function catalogHarness(
  db: Database,
  clock: { now(): Date },
  lockTimeoutMs = 5_000,
  media = memoryMediaStorage(),
) {
  const executor = createCommandExecutor({
    store: createPostgresCommandStore(db),
    guard: allowAll,
    clock,
    limits: { maxAttempts: 3, lockTimeoutMs },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    registry: commandRegistry,
  });
  const handlers = createCatalogHandlers<DatabaseTransaction>({
    store: postgresCatalogStore,
    images: sharpCoverProcessor,
    media,
    newId: randomUUID,
  });

  const run = <I, R extends JsonValue>(
    handler: CommandHandler<I, R, DatabaseTransaction>,
    input: unknown,
    key: string = randomUUID(),
  ): Promise<CommandOutcome<R>> =>
    executor.execute(handler, {
      actor: CATALOG_STAFF,
      idempotencyKey: key,
      correlationId: randomUUID(),
      input,
    });

  async function ok<I, R extends JsonValue>(
    handler: CommandHandler<I, R, DatabaseTransaction>,
    input: unknown,
  ): Promise<R> {
    const outcome = await run(handler, input);
    if (outcome.status !== 'committed') {
      throw new Error(`${handler.command} was rejected with ${outcome.code}`);
    }
    return outcome.result;
  }

  const build = {
    brandPartner: (name = `Maison ${randomUUID().slice(0, 8)}`) =>
      ok(handlers.registerBrandPartner, { brand_name: name }),
    homeConcept: (brandPartnerId: string) =>
      ok(handlers.createHomeConceptVersion, {
        brand_partner_id: brandPartnerId,
        title: 'Casa do Pátio',
        ...CONTENT,
      }),
    version: (homeConceptId: string) =>
      ok(handlers.createHomeConceptVersion, { home_concept_id: homeConceptId, ...CONTENT }),
    approve: (versionId: string) =>
      ok(handlers.approveHomeConceptVersion, {
        home_concept_version_id: versionId,
        approval_refs: ['Plano estratégico aprovado — ata 2026-09'],
      }),
    homeEdition: (homeConceptId: string, content: Record<string, unknown> = {}) =>
      ok(handlers.createHomeEdition, {
        home_concept_id: homeConceptId,
        ...HOME_EDITION_CONTENT,
        ...content,
      }),
    finalize: (homeEditionId: string) =>
      ok(handlers.finalizeHomeEdition, { home_edition_id: homeEditionId }),
    publish: (homeEditionId: string) =>
      ok(handlers.publishHomeEdition, { home_edition_id: homeEditionId }),
    homeEditionMedia: async (
      homeEditionId: string,
      kind: HomeEditionMediaKind = 'image',
      image?: string,
    ) =>
      ok(handlers.uploadHomeEditionMedia, {
        home_edition_id: homeEditionId,
        kind,
        image: image ?? (await coverImage()),
        alt: 'Pátio central ao entardecer',
        crop_x: 50,
        crop_y: 50,
      }),
    approveHomeEditionMedia: (mediaId: string) =>
      ok(handlers.approveHomeEditionMedia, { home_edition_media_id: mediaId }),
    authorization: (homeConceptId: string, validFrom: Date, validUntil?: Date) =>
      ok(handlers.registerInvestorAuthorization, {
        home_concept_id: homeConceptId,
        instrument_ref: `Instrumento ${randomUUID().slice(0, 8)}`,
        valid_from: validFrom.toISOString(),
        ...(validUntil === undefined ? {} : { valid_until: validUntil.toISOString() }),
      }),
    secondHome: (homeEditionId: string, investorAuthorizationId?: string) =>
      ok(handlers.registerSecondHome, {
        home_edition_id: homeEditionId,
        label: 'Unidade 01',
        timezone: 'America/Sao_Paulo',
        ...(investorAuthorizationId === undefined
          ? {}
          : { investor_authorization_id: investorAuthorizationId }),
      }),
    term: (kind: CatalogTermKind, label: string) => ok(handlers.createCatalogTerm, { kind, label }),
    cover: async (homeConceptId: string, image?: string) =>
      ok(handlers.uploadHomeConceptCover, {
        home_concept_id: homeConceptId,
        image: image ?? (await coverImage()),
        alt: 'Fachada em pedra ao entardecer',
        crop_x: 50,
        crop_y: 35,
      }),
    approveCover: (mediaId: string) =>
      ok(handlers.approveHomeConceptMedia, { home_concept_media_id: mediaId }),
    projectedInvestment: (homeEditionId: string, amountMinor: number, validFrom?: Date) =>
      ok(handlers.registerHomeEditionProjectedInvestment, {
        home_edition_id: homeEditionId,
        amount_minor: amountMinor,
        currency: 'BRL',
        ...(validFrom === undefined ? {} : { valid_from: validFrom.toISOString() }),
      }),
    /** Brand Partner → Home Concept (versão 1 aprovada) → Home Edition em preparação. */
    async approvedHomeEdition(content: Record<string, unknown> = {}) {
      const partner = await build.brandPartner();
      const version = await build.homeConcept(partner.id);
      const approved = await build.approve(version.id);
      const homeEdition = await build.homeEdition(version.home_concept_id, content);
      return { partner, version: approved, homeConceptId: version.home_concept_id, homeEdition };
    },
    /** Como `approvedHomeEdition`, com a definição material finalizada (pode originar Second Home). */
    async finalizedHomeEdition(content: Record<string, unknown> = {}) {
      const built = await build.approvedHomeEdition(content);
      const homeEdition = await build.finalize(built.homeEdition.id);
      return { ...built, homeEdition };
    },
  };

  return { executor, handlers, run, ok, build, media };
}

export function expectRejected(outcome: CommandOutcome<unknown>, code: ErrorCode): void {
  expect(outcome).toMatchObject({ status: 'rejected', code });
}

/** `operation` gravada pelo dono (fora do executor), para inserir linhas direto e provar os gatilhos do banco. */
export async function ownerOperation(
  admin: pg.Pool,
  command = 'register_second_home',
): Promise<string> {
  const id = randomUUID();
  await admin.query(
    `INSERT INTO app.operation (id, command, actor_user_id, acting_party_id, role, second_home_id, idempotency_key,
                                correlation_id, authorization_ref, state, created_at, updated_at)
     VALUES ($1, $2, NULL, NULL, 'system', NULL, $3, $3, 'runbook:test', 'committed', now(), now())`,
    [id, command, `test:${id}`],
  );
  return id;
}

export async function count(admin: pg.Pool, table: string): Promise<number> {
  const { rows } = await admin.query<{ n: number }>(`SELECT count(*)::int AS n FROM app.${table}`);
  return rows[0]?.n ?? 0;
}
