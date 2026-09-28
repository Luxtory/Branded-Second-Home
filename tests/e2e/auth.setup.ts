import { expect, test as setup } from '@playwright/test';
import { signIn, STAFF_EMAIL, VISITOR_EMAIL } from './support/auth';

// Os usuários compartilhados pelos E2E cadastram o TOTP uma única vez, antes dos testes paralelos: dois primeiros
// acessos simultâneos do mesmo usuário disputariam o fator não verificado (cada novo QR Code descarta o anterior) e o
// código de um deles seria recusado. O primeiro cadastro em si é provado com um usuário próprio (admin-access.spec.ts).
for (const email of [STAFF_EMAIL, VISITOR_EMAIL]) {
  setup(`${email} com o TOTP cadastrado`, async ({ page }) => {
    await signIn(page, email);
    await expect(page).toHaveURL(/\/admin$/);
  });
}
