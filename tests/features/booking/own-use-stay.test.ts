import { describe, expect, it } from 'vitest';
import {
  addCivilDays,
  InvalidCivilDateError,
  longestStayThrough,
  MAX_STAY_NIGHTS,
  stayNights,
} from '@/features/booking/domain/own-use-stay';

describe('noites e permanência do uso próprio (PD-002, BR-110 a BR-112)', () => {
  it('[PD-002] de 10 a 12/03 são as noites de 10 e 11/03; o check-out não consome', () => {
    expect(stayNights('2027-03-10', '2027-03-12')).toEqual(['2027-03-10', '2027-03-11']);
  });

  it('[TECH-110] 1 noite; 0 noites ou check-out anterior → nenhuma noite', () => {
    expect(stayNights('2027-03-10', '2027-03-11')).toEqual(['2027-03-10']);
    expect(stayNights('2027-03-10', '2027-03-10')).toEqual([]);
    expect(stayNights('2027-03-10', '2027-03-09')).toEqual([]);
  });

  it('[EC-1][EC-4] cruzando mês, exercício e 29/02: noite a noite, no calendário civil', () => {
    expect(stayNights('2027-12-30', '2028-01-02')).toEqual([
      '2027-12-30',
      '2027-12-31',
      '2028-01-01',
    ]);
    expect(stayNights('2028-02-28', '2028-03-01')).toEqual(['2028-02-28', '2028-02-29']);
    expect(stayNights('2027-02-28', '2027-03-01')).toEqual(['2027-02-28']);
    expect(addCivilDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addCivilDays('2100-02-28', 1)).toBe('2100-03-01');
    expect(addCivilDays('0099-12-31', 1)).toBe('0100-01-01');
  });

  it('data inválida é recusada, nunca reinterpretada', () => {
    expect(() => stayNights('2027-02-29', '2027-03-01')).toThrow(InvalidCivilDateError);
    expect(() => stayNights('27-03-10', '2027-03-12')).toThrow(InvalidCivilDateError);
  });

  it('[BR-112][TECH-045] adjacentes formam uma permanência: preencher o intervalo entre duas soma as três', () => {
    const before = stayNights('2027-05-01', '2027-05-06');
    const after = stayNights('2027-05-08', '2027-05-15');
    expect(longestStayThrough([...before, ...after], stayNights('2027-05-06', '2027-05-08'))).toBe(
      14,
    );
    expect(
      longestStayThrough(
        [...before, ...after, '2027-05-15'],
        stayNights('2027-05-06', '2027-05-08'),
      ),
    ).toBe(15);
  });

  it('[BR-112] uma noite livre separa as permanências; só conta a que contém a reserva nova', () => {
    const far = stayNights('2027-06-01', '2027-06-15');
    expect(far).toHaveLength(MAX_STAY_NIGHTS);
    expect(longestStayThrough(far, ['2027-06-16'])).toBe(1);
    expect(longestStayThrough([], [])).toBe(0);
  });

  it('[REQ-031][EC-4] o 29/02 conta para a permanência e a adjacência', () => {
    const run = stayNights('2028-02-16', '2028-02-29');
    expect(longestStayThrough(run, ['2028-02-29'])).toBe(14);
    expect(longestStayThrough([...run, '2028-03-01'], ['2028-02-29'])).toBe(15);
  });
});
