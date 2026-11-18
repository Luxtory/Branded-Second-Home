/** Estado dos formulários dos atos do Admin (compartilhado entre as Server Actions e o componente de cliente). */
export type AdminActField =
  'basis' | 'incident_ref' | 'reason' | 'type' | 'outcome' | 'attest' | 'purpose';

/**
 * A chave nasce com a página do ato (mesma intenção = mesma chave): duplo envio e resultado incerto repetem o resultado
 * gravado; recusa gravada troca a chave; recusa sem operação (limite, indisponível, validação) mantém a chave utilizável
 * (G-E4-1). O valor da base registrada só volta ao próprio campo — nunca a log, aviso ou mensagem de erro.
 */
export interface AdminActState {
  readonly key: string;
  readonly values: Readonly<Record<string, string>>;
  readonly fieldErrors: Readonly<Partial<Record<AdminActField, true>>>;
  readonly rejection: string | null;
}
