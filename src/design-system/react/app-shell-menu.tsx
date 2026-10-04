'use client';

import type { ReactNode } from 'react';
import type { Ground } from './logo';
import { MobileNav, type MobileNavLabels } from './mobile-nav';

export type AppShellMenuLabels = MobileNavLabels;

/** Gaveta das superfícies de produto abaixo do `lg` (ADR-0009): a `MobileNav` com o bloco de conta no rodapé. */
export function AppShellMenu({
  ground,
  mainId,
  labels,
  logo,
  nav,
  account,
}: {
  readonly ground: Ground;
  readonly mainId: string;
  readonly labels: AppShellMenuLabels;
  readonly logo: ReactNode;
  readonly nav: ReactNode;
  readonly account: ReactNode;
}) {
  return (
    <MobileNav
      ground={ground}
      mainId={mainId}
      labels={labels}
      buttonClassName="lx-app__menu-button"
      logo={logo}
      nav={nav}
      footer={account}
    />
  );
}
