/**
 * Fusos IANA conhecidos do runtime (TECH-040): a Second Home exige um deles e nenhum é presumido (TECH-001). A lista vem
 * do próprio runtime, nunca de uma lista escrita à mão.
 */
let cached: readonly string[] | null = null;

export function ianaTimeZones(): readonly string[] {
  cached ??= [...Intl.supportedValuesOf('timeZone')].sort();
  return cached;
}

export function isIanaTimeZone(value: string): boolean {
  return ianaTimeZones().includes(value);
}
