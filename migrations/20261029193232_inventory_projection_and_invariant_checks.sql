-- migrate:up
-- W10 (ADR-004 do 03): Inventário Central é a projeção de noite selada + custódia ativa + ocupação ativa, sem segunda
-- fonte mutável; Inventário Luxtory = custódia ativa luxtory/inventory. As consultas de invariantes rodam após todo
-- teste db (ADR-0005) e servem depois à reconciliação da W30. Spec: docs/specs/inventory.md; ADR-0024.
CREATE VIEW app.central_inventory WITH (security_invoker = true) AS
SELECT d.second_home_id, d.stay_date, d.exercise_year, d.season, d.is_leap_day, d.checkin_at,
       c.id AS custody_id, c.holder_kind, c.stake_id, c.basis, c.purpose, c.inventory_origin,
       o.id AS occupancy_id, o.channel, o.booking_id
  FROM app.second_home_date d
  JOIN app.date_custody c
    ON c.second_home_id = d.second_home_id AND c.stay_date = d.stay_date AND c.closed_at IS NULL
  LEFT JOIN app.date_occupancy o
    ON o.second_home_id = d.second_home_id AND o.stay_date = d.stay_date AND o.released_at IS NULL;

CREATE VIEW app.luxtory_inventory WITH (security_invoker = true) AS
SELECT * FROM app.central_inventory WHERE holder_kind = 'luxtory' AND purpose = 'inventory';

-- Violação encontrada → uma linha por noite e regra. Vazio = TECH-021, INV-1, INV-2, INV-3 e TECH-022 íntegros.
CREATE FUNCTION app.inventory_invariant_breaches()
  RETURNS TABLE (invariant text, second_home_id uuid, stay_date date)
  LANGUAGE sql STABLE SET search_path = ''
AS $$
  -- TECH-021: noite selada com exatamente uma custódia ativa.
  SELECT 'TECH-021', d.second_home_id, d.stay_date
    FROM app.second_home_date d
   WHERE (SELECT count(*) FROM app.date_custody c
           WHERE c.second_home_id = d.second_home_id AND c.stay_date = d.stay_date AND c.closed_at IS NULL) <> 1
  UNION ALL
  -- INV-1 (dona: W12; aqui só a barreira): no máximo uma ocupação ativa por noite.
  SELECT 'INV-1', o.second_home_id, o.stay_date
    FROM app.date_occupancy o WHERE o.released_at IS NULL
   GROUP BY o.second_home_id, o.stay_date HAVING count(*) > 1
  UNION ALL
  -- INV-2: ocupação ativa sobre a custódia ativa da mesma noite, num par da matriz da TECH-023.
  SELECT 'INV-2', o.second_home_id, o.stay_date
    FROM app.date_occupancy o JOIN app.date_custody c ON c.id = o.custody_id
   WHERE o.released_at IS NULL AND (c.closed_at IS NOT NULL OR NOT app.occupancy_pair_valid(o, c))
  UNION ALL
  -- INV-3: custódia ativa no Inventário Luxtory com exatamente uma das três origens e autorização identificável.
  SELECT 'INV-3', c.second_home_id, c.stay_date
    FROM app.date_custody c
   WHERE c.closed_at IS NULL AND c.holder_kind = 'luxtory' AND c.purpose = 'inventory'
     AND (c.inventory_origin IS NULL OR c.authorization_ref IS NULL
          OR c.inventory_origin NOT IN ('annual_allocation', 'luxchange_cession', 'recovered_future_capacity'))
  UNION ALL
  -- TECH-022: sucessora aberta pela operação que fechou a mãe, dentro da tabela fechada.
  SELECT 'TECH-022', n.second_home_id, n.stay_date
    FROM app.date_custody n
    JOIN app.date_custody p ON p.id = n.parent_custody_id
    LEFT JOIN app.date_custody g ON g.id = p.parent_custody_id
   WHERE p.closed_by_operation IS DISTINCT FROM n.opened_by_operation OR NOT app.custody_transition_valid(p, n, g)
  UNION ALL
  -- TECH-022: uma única raiz por noite.
  SELECT 'TECH-022', c.second_home_id, c.stay_date
    FROM app.date_custody c WHERE c.parent_custody_id IS NULL
   GROUP BY c.second_home_id, c.stay_date HAVING count(*) > 1
$$;

REVOKE ALL ON FUNCTION app.inventory_invariant_breaches() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.inventory_invariant_breaches() TO luxtory_app;
GRANT SELECT ON app.central_inventory, app.luxtory_inventory TO luxtory_app;


-- migrate:down
DROP FUNCTION app.inventory_invariant_breaches();
DROP VIEW app.luxtory_inventory;
DROP VIEW app.central_inventory;
