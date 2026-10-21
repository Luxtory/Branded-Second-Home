/**
 * Rotas do Admin de interesses (spec ownership §14.10). A localização pretendida nunca vai à URL: URLs entram nos logs
 * da plataforma; o grupo é identificado pelo id da Home Edition.
 */
export const interestPaths = {
  overview: '/admin/interesses',
  homeEdition: (homeEditionId: string) => `/admin/interesses/home-editions/${homeEditionId}`,
  interest: (interestId: string) => `/admin/interesses/${interestId}`,
  contact: (interestId: string) => `/admin/interesses/${interestId}/contato`,
} as const;

// Formato 8-4-4-4-12 hexadecimal: id fora do formato responde "não encontrado" sem tocar o banco.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Id de registro aceito na URL do Admin, em minúsculas; fora do formato → `null`. */
export function recordId(value: string): string | null {
  return UUID.test(value) ? value.toLowerCase() : null;
}
