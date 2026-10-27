import {
  ConfigurationMissingError,
  EnvironmentRestrictionError,
  type EnvSource,
} from '@/features/platform';
/** Only explicit server configuration opens this opt-in policy; Preview is always closed (ADR-0021). */
export function assertAcquisitionWritesAvailable(source: EnvSource = process.env): void {
  if (source.VERCEL_ENV === 'preview')
    throw new EnvironmentRestrictionError('acquisition', 'preview');
  if (source.ACQUISITION_WRITES !== 'open')
    throw new ConfigurationMissingError(['ACQUISITION_WRITES']);
}
