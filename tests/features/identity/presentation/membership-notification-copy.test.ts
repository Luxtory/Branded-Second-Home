import { describe, expect, it } from 'vitest';
import { notificationCopy } from '@/features/booking/presentation/own-use-notification-copy';
import { membershipNotificationCopy } from '@/features/identity';

const KIND = 'identity.membership_changed';
const at = '2027-03-01T12:00:00.000Z';
const format = { date: (civil: string) => civil, instant: () => '01/03/2027 às 09:00' };

describe('aviso de mudança do Membership na central do Titular (REQ-097; W15)', () => {
  it('[REQ-097] título por transição; o texto diz que propriedade, Direito de Uso e compromissos não mudam', () => {
    const cases = [
      [null, 'active', 'Membership ativado', 'Vigente'],
      ['suspended', 'active', 'Membership reativado', 'Vigente'],
      ['ended', 'active', 'Membership reativado', 'Vigente'],
      ['active', 'suspended', 'Membership suspenso', 'Suspenso'],
      ['suspended', 'ended', 'Membership encerrado', 'Encerrado'],
    ] as const;
    for (const [from, to, title, state] of cases) {
      const copy = notificationCopy(
        KIND,
        { from_state: from, to_state: to, changed_at: at },
        format,
      );
      expect(copy).toEqual({
        title,
        what: `A situação do Membership passou a ${state} em 01/03/2027 às 09:00. Propriedade, Direito de Uso e compromissos já constituídos não mudam.`,
        extra: [],
      });
    }
  });

  it('[REQ-097] outro tipo ou dados fora do contrato → aviso genérico (null)', () => {
    expect(membershipNotificationCopy('booking.own_use_confirmed', {}, format.instant)).toBeNull();
    for (const data of [{ to_state: 'paused', changed_at: at }, { to_state: 'active' }, {}])
      expect(notificationCopy(KIND, data, format)).toBeNull();
  });
});
