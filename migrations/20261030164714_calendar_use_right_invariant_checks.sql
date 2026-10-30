-- migrate:up
-- W11 (TECH-026, TECH-027, TECH-110; INV-4, INV-5; spec calendar §6): consultas de invariantes do Direito de Uso, após
-- todo teste db (como as do inventário, W10) e depois na reconciliação da W30. Vazio = íntegro.
CREATE FUNCTION app.use_right_invariant_breaches()
  RETURNS TABLE (invariant text, second_home_id uuid, detail text)
  LANGUAGE sql STABLE SET search_path = ''
AS $$
  -- TECH-026: a projeção é exatamente o ledger (concessão; consumo − restauração; expiração).
  WITH ledger AS (
    SELECT l.second_home_id, l.stake_id, l.exercise_year, l.bucket,
           sum(l.quantity) FILTER (WHERE l.movement = 'grant')::integer AS granted,
           (coalesce(sum(l.quantity) FILTER (WHERE l.movement = 'consume'), 0)
            - coalesce(sum(l.quantity) FILTER (WHERE l.movement = 'restore'), 0))::integer AS consumed,
           coalesce(sum(l.quantity) FILTER (WHERE l.movement = 'expire'), 0)::integer AS expired
      FROM app.use_right_ledger l
     GROUP BY l.second_home_id, l.stake_id, l.exercise_year, l.bucket
  ),
  grants AS (
    SELECT l.second_home_id, l.exercise_year, l.bucket, count(*) AS stakes,
           min(l.quantity) AS low, max(l.quantity) AS high
      FROM app.use_right_ledger l
     WHERE l.movement = 'grant' AND l.bucket IN ('alta', 'media')
     GROUP BY l.second_home_id, l.exercise_year, l.bucket
  )
  SELECT 'TECH-026', coalesce(b.second_home_id, g.second_home_id),
         concat_ws(':', coalesce(b.stake_id, g.stake_id), coalesce(b.exercise_year, g.exercise_year),
                   coalesce(b.bucket, g.bucket))
    FROM app.use_right_balance b
    FULL JOIN ledger g ON g.stake_id = b.stake_id AND g.exercise_year = b.exercise_year AND g.bucket = b.bucket
   WHERE (b.granted, b.consumed, b.expired) IS DISTINCT FROM (g.granted, g.consumed, g.expired)
  UNION ALL
  -- INV-4: todas as N Ações com o mesmo Direito de Uso (BR-071, BR-107); no exercício completo, exatamente o limite da
  -- configuração e N × limite + capacidade Luxtory = 103 Alta/Super Alta e 262 Média/Baixa (folga zero). O exercício
  -- parcial segue a alocação aprovada na W8 (D3).
  SELECT 'INV-4', a.second_home_id, concat_ws(':', g.exercise_year, g.bucket)
    FROM app.acquisition a
    JOIN app.second_home_configuration c ON c.id = a.configuration_id
    JOIN grants g ON g.second_home_id = a.second_home_id
   WHERE g.stakes <> c.id OR g.low <> g.high
      OR ((g.exercise_year > a.exercise_year
           OR (extract(month FROM a.operation_start_date) = 1 AND extract(day FROM a.operation_start_date) = 1))
          AND (g.low <> CASE g.bucket WHEN 'alta' THEN c.alta ELSE c.media END
               OR c.id * CASE g.bucket WHEN 'alta' THEN c.alta ELSE c.media END
                  + CASE g.bucket WHEN 'alta' THEN c.luxtory_alta ELSE c.luxtory_media END
                  <> CASE g.bucket WHEN 'alta' THEN 103 ELSE 262 END))
  UNION ALL
  -- TECH-026: exercício Co-Owner selado posterior ao primeiro carrega as 2N concessões.
  SELECT 'TECH-026', a.second_home_id, s.exercise_year::text
    FROM app.acquisition a
    JOIN app.second_home_configuration c ON c.id = a.configuration_id
    JOIN (SELECT DISTINCT d.second_home_id, d.exercise_year FROM app.second_home_date d) s
      ON s.second_home_id = a.second_home_id
   WHERE a.modality = 'co_owner' AND s.exercise_year > a.exercise_year
     AND (SELECT count(*) FROM app.use_right_ledger l
           WHERE l.second_home_id = a.second_home_id AND l.exercise_year = s.exercise_year
             AND l.movement = 'grant' AND l.bucket IN ('alta', 'media')) <> 2 * c.id
  UNION ALL
  -- INV-5 e REQ-030: consumo e restauração no bucket e no exercício da própria noite.
  SELECT 'INV-5', l.second_home_id, l.id::text
    FROM app.use_right_ledger l
    JOIN app.second_home_date d ON d.second_home_id = l.second_home_id AND d.stay_date = l.stay_date
   WHERE l.movement IN ('consume', 'restore')
     AND (l.exercise_year <> d.exercise_year OR l.bucket <> CASE WHEN d.is_leap_day THEN 'leap' ELSE d.season END)
  UNION ALL
  -- INV-5 e PD-004: expiração registrada no fim efetivo canônico, nunca no instante do job.
  SELECT 'INV-5', l.second_home_id, l.id::text
    FROM app.use_right_ledger l JOIN app.second_home h ON h.id = l.second_home_id
   WHERE l.movement = 'expire'
     AND l.effective_at IS DISTINCT FROM app.use_right_effective_end(l.bucket, l.exercise_year, h.timezone)
  UNION ALL
  -- TECH-027: o 29/02 só para a Ação contemplada pela lista bissexta, sempre 1.
  SELECT 'TECH-027', l.second_home_id, l.id::text
    FROM app.use_right_ledger l
   WHERE l.movement = 'grant' AND l.bucket = 'leap'
     AND (l.quantity <> 1 OR l.stake_id IS DISTINCT FROM app.leap_day_beneficiary(l.second_home_id, l.exercise_year))
  UNION ALL
  -- TECH-026: correção nunca existe antes da W13 (nem altera concessão depois).
  SELECT 'TECH-026', l.second_home_id, l.id::text
    FROM app.use_right_ledger l WHERE l.movement = 'correction'
$$;

REVOKE ALL ON FUNCTION app.use_right_invariant_breaches() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.use_right_invariant_breaches() TO luxtory_app;


-- migrate:down
DROP FUNCTION app.use_right_invariant_breaches();
