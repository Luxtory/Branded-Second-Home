/**
 * Home Concept Credit (`lx-credit`): o slot da Brand Partner. Só renderiza quando os dados trazem o nome — a camada de dados
 * só o entrega com a exposição da marca autorizada e antes da eficácia do encerramento (BR-015, BR-021).
 */
export function HomeConceptCredit({
  lead,
  brandName,
}: {
  /** Texto antes do nome (i18n do slice), ex.: "Home Concept com". */
  readonly lead: string;
  readonly brandName?: string;
}) {
  if (brandName === undefined || brandName === '') return null;
  return (
    <p className="lx-credit">
      <span>{lead}</span>
      <span className="lx-credit__name">{brandName}</span>
    </p>
  );
}
