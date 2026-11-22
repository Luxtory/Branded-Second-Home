-- migrate:up
-- W18 (TECH-032, TECH-030, TECH-051, TECH-052; PD-009, REQ-082, REQ-104; ADR-0034; spec pricing §5 "Políticas
-- comerciais"): políticas comerciais versionadas, com esquema fechado por mecanismo validado no próprio banco. Nenhuma
-- política é gravada aqui (TECH-001, D7): versões só pelo `publish_policy`, com autorização operacional. Sem versão
-- vigente, o mecanismo dependente recusa com ERR_POLICY_MISSING.
--
-- Esquema v1 (ADR-0034 §1): `config` tem exatamente `cancellation` (1 a 5 faixas `{min_notice_hours, effects}`,
-- estritamente decrescentes, a última com 0), `no_show` e `exception`. Cada `effects` tem exatamente os eixos do
-- mecanismo; `capacity` é sempre "return_to_origin" (BR-163, sem exceção no `01` para os mecanismos do Club); os demais
-- eixos são frações canônicas em [0, 1] (fração > 1 criaria valor: INV-6, PD-010). Na locação, `money + remuneration
-- ≤ 1`: o titular não retém parcela do que foi devolvido ao locatário.

-- Fração canônica em [0, 1]: "0", "1" ou "0." com até 6 casas, sem zero à direita.
CREATE FUNCTION app.commercial_policy_fraction_valid(p_value jsonb) RETURNS boolean
  LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT coalesce(jsonb_typeof(p_value) = 'string' AND (p_value #>> '{}') ~ '^(0|1|0[.][0-9]{0,5}[1-9])$', false)
$$;

-- Eixos exatos por mecanismo (ADR-0034 §1); `NULL` para mecanismo desconhecido.
CREATE FUNCTION app.commercial_policy_axes(p_mechanism text) RETURNS text[]
  LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE p_mechanism
    WHEN 'luxchange_request' THEN ARRAY['capacity', 'credits', 'fee']
    WHEN 'luxchange_direct' THEN ARRAY['capacity', 'credits', 'fee']
    WHEN 'luxplus' THEN ARRAY['capacity', 'money']
    WHEN 'rental_external' THEN ARRAY['capacity', 'money', 'remuneration']
  END
$$;

CREATE FUNCTION app.commercial_policy_sorted_keys(p_object jsonb) RETURNS text[]
  LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[]) FROM jsonb_object_keys(p_object) AS k
$$;

CREATE FUNCTION app.commercial_policy_effects_valid(p_mechanism text, p_effects jsonb) RETURNS boolean
  LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_axes text[] := app.commercial_policy_axes(p_mechanism); v_axis text;
BEGIN
  IF v_axes IS NULL OR jsonb_typeof(p_effects) IS DISTINCT FROM 'object' THEN
    RETURN false;
  END IF;
  IF app.commercial_policy_sorted_keys(p_effects) IS DISTINCT FROM (SELECT array_agg(a ORDER BY a) FROM unnest(v_axes) AS a) THEN
    RETURN false;
  END IF;
  IF p_effects -> 'capacity' IS DISTINCT FROM '"return_to_origin"'::jsonb THEN
    RETURN false;
  END IF;
  FOREACH v_axis IN ARRAY v_axes LOOP
    IF v_axis <> 'capacity' AND NOT app.commercial_policy_fraction_valid(p_effects -> v_axis) THEN
      RETURN false;
    END IF;
  END LOOP;
  IF p_mechanism = 'rental_external'
     AND (p_effects ->> 'money')::numeric + (p_effects ->> 'remuneration')::numeric > 1 THEN
    RETURN false;
  END IF;
  RETURN true;
END $$;

CREATE FUNCTION app.commercial_policy_config_valid(p_mechanism text, p_config jsonb) RETURNS boolean
  LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_tier jsonb; v_hours_json jsonb; v_hours integer; v_previous integer; v_count integer;
BEGIN
  IF jsonb_typeof(p_config) IS DISTINCT FROM 'object'
     OR app.commercial_policy_sorted_keys(p_config) IS DISTINCT FROM ARRAY['cancellation', 'exception', 'no_show']
     OR jsonb_typeof(p_config -> 'cancellation') IS DISTINCT FROM 'array' THEN
    RETURN false;
  END IF;
  v_count := jsonb_array_length(p_config -> 'cancellation');
  IF v_count < 1 OR v_count > 5 THEN
    RETURN false;
  END IF;
  FOR v_tier IN
    SELECT t.value FROM jsonb_array_elements(p_config -> 'cancellation') WITH ORDINALITY AS t(value, n) ORDER BY t.n
  LOOP
    IF jsonb_typeof(v_tier) IS DISTINCT FROM 'object'
       OR app.commercial_policy_sorted_keys(v_tier) IS DISTINCT FROM ARRAY['effects', 'min_notice_hours'] THEN
      RETURN false;
    END IF;
    v_hours_json := v_tier -> 'min_notice_hours';
    IF jsonb_typeof(v_hours_json) IS DISTINCT FROM 'number' OR v_hours_json::text !~ '^(0|[1-9][0-9]{0,3})$' THEN
      RETURN false;
    END IF;
    v_hours := v_hours_json::text::integer;
    IF v_hours > 8760 OR (v_previous IS NOT NULL AND v_hours >= v_previous)
       OR NOT app.commercial_policy_effects_valid(p_mechanism, v_tier -> 'effects') THEN
      RETURN false;
    END IF;
    v_previous := v_hours;
  END LOOP;
  IF v_previous IS DISTINCT FROM 0 THEN
    RETURN false;
  END IF;
  RETURN app.commercial_policy_effects_valid(p_mechanism, p_config -> 'no_show')
     AND app.commercial_policy_effects_valid(p_mechanism, p_config -> 'exception');
END $$;

REVOKE ALL ON FUNCTION app.commercial_policy_fraction_valid(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.commercial_policy_axes(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.commercial_policy_sorted_keys(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.commercial_policy_effects_valid(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.commercial_policy_config_valid(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.commercial_policy_fraction_valid(jsonb) TO luxtory_app;
GRANT EXECUTE ON FUNCTION app.commercial_policy_axes(text) TO luxtory_app;
GRANT EXECUTE ON FUNCTION app.commercial_policy_sorted_keys(jsonb) TO luxtory_app;
GRANT EXECUTE ON FUNCTION app.commercial_policy_effects_valid(text, jsonb) TO luxtory_app;
GRANT EXECUTE ON FUNCTION app.commercial_policy_config_valid(text, jsonb) TO luxtory_app;

-- Versões só por inserção (TECH-030), com a vigência do `app.parameter` (ADR-0030 §3): início nunca retroativo, depois
-- de todos os inícios do mecanismo e nunca antes de um término explícito; sem término, vale até o início da seguinte.
CREATE TABLE app.commercial_policy (
  id uuid PRIMARY KEY,
  mechanism text NOT NULL,
  schema_version smallint NOT NULL,
  config jsonb NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  -- Autoridade e autor vêm da operação (guard do servidor), nunca da entrada; base registrada obrigatória (TECH-051).
  authority text NOT NULL,
  authorization_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  operation_id uuid NOT NULL UNIQUE REFERENCES app.operation(id),
  CONSTRAINT commercial_policy_mechanism_check CHECK (
    mechanism IN ('luxchange_request', 'luxchange_direct', 'luxplus', 'rental_external')),
  CONSTRAINT commercial_policy_schema_version_check CHECK (schema_version = 1),
  -- Limite técnico do documento (T-1807), antes da validação estrutural.
  CONSTRAINT commercial_policy_config_size CHECK (octet_length(config::text) <= 16384),
  -- REQ-104: esquema fechado, BR-163 e INV (ADR-0034 §1–§2).
  CONSTRAINT commercial_policy_config_check CHECK (app.commercial_policy_config_valid(mechanism, config)),
  CONSTRAINT commercial_policy_authority_check CHECK (authority IN ('admin')),
  CONSTRAINT commercial_policy_authorization_ref_check CHECK (length(btrim(authorization_ref)) BETWEEN 1 AND 255),
  CONSTRAINT conflict_commercial_policy_period CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT conflict_commercial_policy_scope_start UNIQUE (mechanism, effective_from)
);

-- Procedência, autoridade e vigência no instante da gravação, sob trava exclusiva do mecanismo (a resolução dos termos
-- toma a mesma trava em modo compartilhado): duas publicações se serializam e a segunda enxerga a primeira.
CREATE FUNCTION app.commercial_policy_insert() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE op app.operation; latest app.commercial_policy; v_at timestamptz;
BEGIN
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  IF op.command <> 'publish_policy' OR op.second_home_id IS NOT NULL
     OR NEW.authority IS DISTINCT FROM op.role::text OR NEW.created_by IS DISTINCT FROM op.actor_user_id THEN
    RAISE EXCEPTION 'a commercial policy version is recorded by its publish_policy operation, with its authority and author'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'commercial_policy_operation_provenance';
  END IF;
  PERFORM app.lock_own_use_admin_authority(op);
  PERFORM pg_advisory_xact_lock(hashtextextended('app.commercial_policy:' || NEW.mechanism, 0));
  v_at := clock_timestamp();
  NEW.created_at := v_at;
  IF NEW.effective_from IS NULL THEN
    NEW.effective_from := v_at;
  ELSIF NEW.effective_from < v_at THEN
    RAISE EXCEPTION 'a commercial policy version never starts in the past'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_commercial_policy_retroactive';
  END IF;
  IF NEW.effective_to IS NOT NULL AND NEW.effective_to <= NEW.effective_from THEN
    RAISE EXCEPTION 'a commercial policy version ends after it starts'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_commercial_policy_period';
  END IF;
  SELECT * INTO latest FROM app.commercial_policy
   WHERE mechanism = NEW.mechanism
   ORDER BY effective_from DESC LIMIT 1;
  IF FOUND AND (NEW.effective_from <= latest.effective_from
                OR (latest.effective_to IS NOT NULL AND NEW.effective_from < latest.effective_to)) THEN
    RAISE EXCEPTION 'a commercial policy version starts after every start of its mechanism and never before an explicit end'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_commercial_policy_overlap';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.commercial_policy_insert() FROM PUBLIC;
CREATE TRIGGER commercial_policy_insert BEFORE INSERT ON app.commercial_policy
  FOR EACH ROW EXECUTE FUNCTION app.commercial_policy_insert();
CREATE TRIGGER commercial_policy_no_update BEFORE UPDATE ON app.commercial_policy
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER commercial_policy_no_delete BEFORE DELETE ON app.commercial_policy
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER commercial_policy_no_truncate BEFORE TRUNCATE ON app.commercial_policy
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- Versão vigente no instante: a de maior início ≤ instante, se o instante for anterior ao seu `effective_to` explícito.
-- Nenhuma linha = política ausente (ERR_POLICY_MISSING); nada é presumido.
CREATE FUNCTION app.commercial_policy_at(p_mechanism text, p_at timestamptz)
  RETURNS SETOF app.commercial_policy
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT v.* FROM (
    SELECT p.* FROM app.commercial_policy p
     WHERE p.mechanism = p_mechanism AND p.effective_from <= p_at
     ORDER BY p.effective_from DESC LIMIT 1
  ) v
  WHERE v.effective_to IS NULL OR p_at < v.effective_to
$$;
REVOKE ALL ON FUNCTION app.commercial_policy_at(text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.commercial_policy_at(text, timestamptz) TO luxtory_app;

-- Só o servidor lê e grava (TECH-052); o Titular verá a política renderizada pelo servidor (W21+).
ALTER TABLE app.commercial_policy ENABLE ROW LEVEL SECURITY;
CREATE POLICY commercial_policy_app_read ON app.commercial_policy FOR SELECT TO luxtory_app USING (true);
CREATE POLICY commercial_policy_app_insert ON app.commercial_policy FOR INSERT TO luxtory_app WITH CHECK (true);
GRANT SELECT ON app.commercial_policy TO luxtory_app;
GRANT INSERT (id, mechanism, schema_version, config, effective_from, effective_to, authority, authorization_ref,
  created_at, created_by, operation_id) ON app.commercial_policy TO luxtory_app;


-- migrate:down
-- Histórico de políticas nunca é descartado por rollback (TECH-052): com qualquer versão gravada, a reversão é recusada.
-- A trava exclusiva espera publicações em curso e barra as novas. Sem linhas (banco vazio do `db:check`), desfaz tudo.
DO $$
BEGIN
  LOCK TABLE app.commercial_policy IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.commercial_policy) THEN
    RAISE EXCEPTION 'W18 rollback would discard the commercial policy history';
  END IF;
END $$;
DROP FUNCTION app.commercial_policy_at(text, timestamptz);
DROP TABLE app.commercial_policy;
DROP FUNCTION app.commercial_policy_insert();
DROP FUNCTION app.commercial_policy_config_valid(text, jsonb);
DROP FUNCTION app.commercial_policy_effects_valid(text, jsonb);
DROP FUNCTION app.commercial_policy_sorted_keys(jsonb);
DROP FUNCTION app.commercial_policy_axes(text);
DROP FUNCTION app.commercial_policy_fraction_valid(jsonb);
