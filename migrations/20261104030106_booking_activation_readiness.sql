-- migrate:up
-- W13 E1 (ADR-0027 §10, D10): prontidão por invariantes para a migration de ativação futura — gatilhos presentes e
-- habilitados, privilégios efetivos, RLS, consultas de violação vazias e nenhuma chave presente. Só verifica; não ativa.
-- Impressões digitais (SHA-256 das funções críticas) ficam para o PR de ativação, geradas pela CI.
CREATE FUNCTION app.assert_own_use_activation_ready() RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE
  v_failures text[] := '{}';
  v_trigger record;
  v_table text;
BEGIN
  FOR v_trigger IN
    SELECT * FROM (VALUES
      ('app.booking', 'booking_open'), ('app.booking', 'booking_state_guard'), ('app.booking', 'booking_no_delete'),
      ('app.booking', 'booking_no_truncate'), ('app.booking', 'booking_complete_constraint'),
      ('app.booking_state_transition', 'booking_state_transition_check'),
      ('app.booking_state_transition', 'booking_state_apply'),
      ('app.booking_state_transition', 'booking_state_transition_constraint'),
      ('app.booking_state_transition', 'booking_state_transition_no_change'),
      ('app.booking_exception', 'booking_exception_open'),
      ('app.booking_exception_resolution', 'booking_exception_resolve'),
      ('app.booking_no_show_candidate', 'booking_no_show_candidate_flag'),
      ('app.booking_authorization_request', 'booking_authorization_request_record'),
      ('app.booking_authorization_use', 'booking_authorization_use_record'),
      ('app.booking_authorization_use', 'booking_authorization_use_constraint'),
      ('app.booking_authorization', 'booking_authorization_no_change'),
      ('app.booking_authorization_revocation', 'booking_authorization_revocation_no_change'),
      ('app.date_custody', 'date_custody_open'), ('app.date_custody', 'date_custody_close'),
      ('app.date_custody', 'date_custody_close_released'), ('app.date_custody', 'date_custody_active_constraint'),
      ('app.date_occupancy', 'date_occupancy_open'), ('app.date_occupancy', 'date_occupancy_release'),
      ('app.date_occupancy', 'date_occupancy_booking_constraint'),
      ('app.use_right_ledger', 'use_right_ledger_movement'), ('app.use_right_ledger', 'use_right_ledger_balance'),
      ('app.use_right_ledger', 'use_right_ledger_booking_constraint'),
      ('app.use_right_balance', 'use_right_balance_guard')
    ) AS x(rel, name)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
                    WHERE t.tgrelid = to_regclass(v_trigger.rel) AND t.tgname = v_trigger.name
                      AND t.tgenabled = 'O') THEN
      v_failures := v_failures || ('trigger:' || v_trigger.rel || '.' || v_trigger.name);
    END IF;
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY['app.booking', 'app.booking_state_transition', 'app.booking_exception',
      'app.booking_exception_resolution', 'app.booking_no_show_candidate', 'app.booking_authorization_request',
      'app.booking_authorization', 'app.booking_authorization_revocation', 'app.booking_authorization_use',
      'app.capability_activation', 'app.date_custody', 'app.date_occupancy', 'app.use_right_ledger',
      'app.use_right_balance'] LOOP
    IF NOT (SELECT c.relrowsecurity FROM pg_catalog.pg_class c WHERE c.oid = v_table::regclass) THEN
      v_failures := v_failures || ('rls:' || v_table);
    END IF;
    -- O papel autorizador não toca tabela; `anon`/`authenticated` nunca escrevem.
    IF has_table_privilege('luxtory_booking_authorizer', v_table, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE') THEN
      v_failures := v_failures || ('authorizer_table:' || v_table);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname IN ('anon', 'authenticated')
                AND has_table_privilege(r.oid, v_table::regclass, 'INSERT, UPDATE, DELETE, TRUNCATE')) THEN
      v_failures := v_failures || ('client_write:' || v_table);
    END IF;
  END LOOP;

  -- Papel da aplicação: sem UPDATE na reserva, sem escrita na autorização, sem EXECUTE nas funções privilegiadas.
  IF has_table_privilege('luxtory_app', 'app.booking', 'UPDATE, DELETE, TRUNCATE')
     OR has_table_privilege('luxtory_app', 'app.booking_authorization', 'INSERT, UPDATE, DELETE, TRUNCATE')
     OR has_table_privilege('luxtory_app', 'app.booking_authorization_revocation', 'INSERT, UPDATE, DELETE, TRUNCATE')
     OR has_table_privilege('luxtory_app', 'app.capability_activation', 'INSERT, UPDATE, DELETE, TRUNCATE')
     OR has_table_privilege('luxtory_app', 'app.use_right_balance', 'INSERT, UPDATE, DELETE, TRUNCATE') THEN
    v_failures := v_failures || 'app_table_privilege'::text;
  END IF;
  IF has_function_privilege('luxtory_app', 'app.authorize_booking_action(uuid, text)', 'EXECUTE')
     OR has_function_privilege('luxtory_app', 'app.revoke_booking_authorization(uuid, text)', 'EXECUTE')
     OR has_function_privilege('luxtory_app', 'app.booking_state_apply()', 'EXECUTE')
     OR has_function_privilege('luxtory_app', 'app.use_right_balance_apply()', 'EXECUTE')
     OR has_function_privilege('luxtory_app', 'app.assert_own_use_activation_ready()', 'EXECUTE') THEN
    v_failures := v_failures || 'app_function_privilege'::text;
  END IF;
  -- Papel autorizador: só as duas funções; atributos mínimos.
  IF NOT has_function_privilege('luxtory_booking_authorizer', 'app.authorize_booking_action(uuid, text)', 'EXECUTE')
     OR NOT has_function_privilege('luxtory_booking_authorizer', 'app.revoke_booking_authorization(uuid, text)', 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'app' AND p.proname NOT IN ('authorize_booking_action', 'revoke_booking_authorization')
                   AND has_function_privilege('luxtory_booking_authorizer', p.oid, 'EXECUTE'))
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r
                     WHERE r.rolname = 'luxtory_booking_authorizer' AND r.rolcanlogin AND NOT r.rolinherit
                       AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
                       AND NOT r.rolbypassrls AND r.rolconnlimit = 1)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid = m.member
                 WHERE r.rolname = 'luxtory_booking_authorizer') THEN
    v_failures := v_failures || 'authorizer_role'::text;
  END IF;
  -- SECURITY DEFINER com `search_path` fixo.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'app' AND p.prosecdef
                AND NOT coalesce(p.proconfig @> ARRAY['search_path=""'], false)) THEN
    v_failures := v_failures || 'security_definer_search_path'::text;
  END IF;

  IF EXISTS (SELECT 1 FROM app.inventory_invariant_breaches()) THEN
    v_failures := v_failures || 'inventory_invariants'::text;
  END IF;
  IF EXISTS (SELECT 1 FROM app.use_right_invariant_breaches()) THEN
    v_failures := v_failures || 'use_right_invariants'::text;
  END IF;
  IF EXISTS (SELECT 1 FROM app.booking_invariant_breaches()) THEN
    v_failures := v_failures || 'booking_invariants'::text;
  END IF;
  -- A migration de ativação parte da tabela vazia.
  IF EXISTS (SELECT 1 FROM app.capability_activation) THEN
    v_failures := v_failures || 'activation_present'::text;
  END IF;

  IF cardinality(v_failures) > 0 THEN
    RAISE EXCEPTION 'own use activation is not ready: %', array_to_string(v_failures, ', ')
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_activation_not_ready';
  END IF;
END $$;
REVOKE ALL ON FUNCTION app.assert_own_use_activation_ready() FROM PUBLIC;


-- migrate:down
DROP FUNCTION app.assert_own_use_activation_ready();
