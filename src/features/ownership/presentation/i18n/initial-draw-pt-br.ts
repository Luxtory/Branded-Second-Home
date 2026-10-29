/** Textos da evidência do sorteio da ordem inicial (spec ownership §16.5), no Admin e na Área do Titular. */
const utc = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'UTC',
});

/** Instantes em UTC, a mesma referência das rodadas públicas da drand. */
export const formatDrawInstant = (date: Date) => `${utc.format(date)} UTC`;

export const initialDrawMessages = {
  title: 'Sorteio da ordem inicial',
  evidenceTitle: 'Evidência do sorteio',
  adminTitle: 'Sorteio inicial',
  awaitingCommitment:
    'A formalização agendou o sorteio. O compromisso é registrado automaticamente na próxima execução.',
  pending: (round: number, at: string) =>
    `Compromisso registrado. O resultado sai depois da rodada ${round} da drand quicknet, prevista para ${at}.`,
  completed: (at: string) => `Sorteio concluído em ${at}.`,
  methodTitle: 'Método',
  algorithm: 'Algoritmo',
  algorithmValue: 'fy-v1 — Fisher-Yates com HMAC-SHA256 e rejection sampling',
  beacon: 'Fonte pública de aleatoriedade',
  beaconValue: 'drand quicknet',
  chain: 'Identificador da rede (chain hash)',
  round: 'Rodada do beacon',
  roundAt: 'Publicação da rodada',
  commitmentTitle: 'Compromisso',
  commitment: 'SHA-256 da seed',
  recordedAt: 'Registrado em',
  deadline: 'Commit aceito pelo banco até',
  participantsTitle: 'Participantes',
  participantsLead: (count: number) =>
    `As ${count} Ações da Second Home, na ordem fixada antes da aleatoriedade.`,
  participant: (ordinal: number) => `Ação ${ordinal}`,
  identifier: 'Identificador',
  yours: 'Sua Ação',
  representation: 'Representação',
  resultTitle: 'Resultado',
  position: (position: number) => `${position}ª posição`,
  holder: 'Ação',
  inputsTitle: 'Insumos publicados',
  seed: 'Seed',
  randomness: 'Randomness da rodada',
  signature: 'Assinatura da rodada',
  verifyHint:
    'Com esses valores qualquer pessoa reproduz o resultado: confira a rodada em um relay público da drand, verifique que o SHA-256 da seed é o compromisso e recalcule o fy-v1.',
  advantageHint:
    'A posição inicial orienta a ordem de abertura do calendário: é vantagem temporal de acesso, nunca exclusividade sobre datas.',
  listLead: 'Sorteios das Second Homes de que você é titular.',
  statusPending: 'Aguardando a rodada do beacon',
  statusCompleted: 'Concluído',
  status: 'Situação',
  backToArea: 'Área do Titular',
  notFound: 'Sorteio não encontrado',
  metadataTitle: 'Sorteio da ordem inicial — Área do Titular',
} as const;
