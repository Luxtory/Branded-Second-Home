import {
  isInterestWriteOpen,
  isPublicSiteOpen,
  loadEnv,
  type EnvSource,
} from '@/features/platform';
import { isPrivacyNoticeApproved, type PrivacyNotice } from '../domain/privacy-notice';
import { privacyNotice as versionedNotice } from './i18n/privacy-notice-pt-br';
import { hasInterestConfiguration } from './interest-config';

/**
 * Portões da coleta em defesa em profundidade (spec ownership §14.9): nenhum sozinho abre.
 *
 * 1. site público aberto e `INTEREST_WRITES=open` (`isInterestWriteOpen`, W5);
 * 2. em Production, Aviso de Privacidade marcado `approved` e estruturalmente completo;
 * 3. para a seção do formulário, também a configuração completa (`hasInterestConfiguration`).
 */
export function isInterestCollectionOpen(
  source: EnvSource = process.env,
  notice: PrivacyNotice = versionedNotice,
): boolean {
  if (!isInterestWriteOpen(source)) return false;
  return loadEnv(source).VERCEL_ENV !== 'production' || isPrivacyNoticeApproved(notice);
}

/** Seção "Solicitar uma conversa": coleta aberta e configuração completa — o destino existe (`D-B2C-10`). */
export function isInterestFormAvailable(
  source: EnvSource = process.env,
  notice: PrivacyNotice = versionedNotice,
): boolean {
  return isInterestCollectionOpen(source, notice) && hasInterestConfiguration(source);
}

/** `/privacidade`: site público aberto e, em Production, Aviso aprovado; fora dela, a pendência aparece. */
export function isPrivacyNoticePageOpen(
  source: EnvSource = process.env,
  notice: PrivacyNotice = versionedNotice,
): boolean {
  if (!isPublicSiteOpen(source)) return false;
  return loadEnv(source).VERCEL_ENV !== 'production' || isPrivacyNoticeApproved(notice);
}
