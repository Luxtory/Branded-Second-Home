/** Rodada do beacon depois da verificação oficial (TECH-093): só valores conferidos chegam ao sorteio. */
export interface VerifiedRound {
  readonly round: number;
  readonly randomness: Uint8Array;
  readonly signature: Uint8Array;
}

/** Port `RandomnessBeacon` (spec ownership §16.2): falha deixa o sorteio pendente, nunca parcial. */
export interface RandomnessBeacon {
  verifiedRound(round: number): Promise<VerifiedRound>;
}

/** Rodada não obtida no orçamento: ainda não publicada, rede, `5xx`, prazo ou resposta malformada. */
export class InitialDrawBeaconUnavailableError extends Error {
  constructor(readonly round: number) {
    super(`Quicknet round ${round} is not available`);
    this.name = 'InitialDrawBeaconUnavailableError';
  }
}

/** Todo relay que respondeu entregou rodada que não passou na verificação. */
export class InitialDrawBeaconInvalidError extends Error {
  constructor(readonly round: number) {
    super(`Quicknet round ${round} failed verification`);
    this.name = 'InitialDrawBeaconInvalidError';
  }
}
