'use client';

import { useSyncExternalStore } from 'react';

const noSubscription = () => () => undefined;

function format(iso: string, timeZone?: string): string {
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

/** Instante (UTC no banco) no fuso do dispositivo; a primeira renderização mostra UTC, sem divergência de hidratação. */
export function Instant({ iso }: { readonly iso: string }) {
  const text = useSyncExternalStore(
    noSubscription,
    () => format(iso),
    () => format(iso, 'UTC'),
  );
  return <time dateTime={iso}>{text}</time>;
}
