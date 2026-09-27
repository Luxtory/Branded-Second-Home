/**
 * Aplicativos autenticadores sugeridos no cadastro do segundo fator (TOTP padrão). Só páginas oficiais dos
 * fornecedores ou das lojas de aplicativos — nunca um site que receba a chave. Nomes são marcas, não texto traduzível.
 */
export const AUTHENTICATOR_APPS = [
  {
    name: 'Google Authenticator (Android)',
    href: 'https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2',
  },
  {
    name: 'Google Authenticator (iPhone)',
    href: 'https://apps.apple.com/br/app/google-authenticator/id388497605',
  },
  {
    name: 'Microsoft Authenticator',
    href: 'https://www.microsoft.com/pt-br/security/mobile-authenticator-app',
  },
  { name: '1Password', href: 'https://support.1password.com/one-time-passwords/' },
  { name: 'Bitwarden Authenticator', href: 'https://bitwarden.com/products/authenticator/' },
] as const;
