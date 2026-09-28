'use client';

import { useSyncExternalStore } from 'react';

const noSubscription = () => () => undefined;

function format(iso: string, timeZone?: string): string {
  // `dateStyle`/`timeStyle` não combinam com `timeZoneName`: campos explícitos.
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(new Date(iso));
}

/**
 * Instante registrado (UTC no banco), mostrado no fuso do dispositivo de quem lê, com o nome do fuso. O servidor não
 * conhece esse fuso: a primeira renderização mostra UTC e o navegador troca pelo local, sem divergência de hidratação.
 */
export function Instant({ iso }: { readonly iso: string }) {
  const text = useSyncExternalStore(
    noSubscription,
    () => format(iso),
    () => format(iso, 'UTC'),
  );
  return <time dateTime={iso}>{text}</time>;
}

/** Fuso IANA do dispositivo (vazio no servidor). */
export function useDeviceTimeZone(): string {
  return useSyncExternalStore(
    noSubscription,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => '',
  );
}
