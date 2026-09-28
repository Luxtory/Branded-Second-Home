// Wrappers React finos sobre as classes `lx-*` (ADR-0003, ADR-0009): só o que tem comportamento ou estrutura
// repetida. Sem domínio e sem strings de produto — os textos chegam por props.
export { AppShell, type AppNavItem, type AppShellLabels } from './app-shell';
export { FocusedLayout } from './focused-layout';
export { Icon, type IconName } from './icons';
export { Logo, logoUrl, type Ground } from './logo';
export { PageHeader, type PageContext } from './page-header';
export { RecordList, type RecordAttribute, type RecordListItem } from './record-list';
