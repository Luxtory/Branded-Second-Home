-- migrate:up
-- W13 E1 (ADR-0027 §10, D10): prontidão por invariantes para a migration de ativação futura — gatilhos presentes e
-- habilitados, privilégios efetivos, RLS, consultas de violação vazias e nenhuma chave presente. Só verifica; não ativa.
-- Impressões digitais (SHA-256 das funções críticas) ficam para o PR de ativação, geradas pela CI.
CREATE FUNCTION app.assert_own_use_activation_ready() RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_failures text[] := '{}';
  v_trigger record;
  v_relation record;
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

  -- Privilégios por contrato (ADR-0027 §4, TECH-052). `has_table_privilege` só enxerga grants de tabela;
  -- `has_any_column_privilege` também enxerga os de coluna (SELECT, INSERT, UPDATE, REFERENCES).
  FOREACH v_table IN ARRAY ARRAY['app.booking', 'app.booking_state_transition', 'app.booking_exception',
      'app.booking_exception_resolution', 'app.booking_no_show_candidate', 'app.booking_authorization_request',
      'app.booking_authorization', 'app.booking_authorization_revocation', 'app.booking_authorization_use',
      'app.capability_activation', 'app.date_custody', 'app.date_occupancy', 'app.use_right_ledger',
      'app.use_right_balance'] LOOP
    IF NOT (SELECT c.relrowsecurity FROM pg_catalog.pg_class c WHERE c.oid = v_table::regclass) THEN
      v_failures := v_failures || ('rls:' || v_table);
    END IF;
    -- `anon`/`authenticated` nunca escrevem nem criam gatilho ou referência (as leituras do Titular são SELECT de coluna).
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname IN ('anon', 'authenticated')
                AND (has_table_privilege(r.oid, v_table::regclass, 'DELETE, TRUNCATE, TRIGGER')
                     OR has_any_column_privilege(r.oid, v_table::regclass, 'INSERT, UPDATE, REFERENCES'))) THEN
      v_failures := v_failures || ('client_write:' || v_table);
    END IF;
    -- O papel da aplicação nunca apaga, trunca, referencia nem cria gatilho nas tabelas da reserva (os UPDATE de coluna
    -- da custódia e da liberação são do contrato).
    IF has_table_privilege('luxtory_app', v_table, 'DELETE, TRUNCATE, TRIGGER')
       OR has_any_column_privilege('luxtory_app', v_table, 'REFERENCES') THEN
      v_failures := v_failures || ('app_table_privilege:' || v_table);
    END IF;
  END LOOP;

  -- Papel da aplicação: sem UPDATE na reserva (nem de coluna), sem escrita na autorização, na revogação, na ativação e no
  -- saldo, sem DDL em `app`, sem EXECUTE nas funções privilegiadas.
  IF has_any_column_privilege('luxtory_app', 'app.booking', 'UPDATE')
     OR has_any_column_privilege('luxtory_app', 'app.booking_authorization', 'INSERT, UPDATE')
     OR has_any_column_privilege('luxtory_app', 'app.booking_authorization_revocation', 'INSERT, UPDATE')
     OR has_any_column_privilege('luxtory_app', 'app.capability_activation', 'INSERT, UPDATE')
     OR has_any_column_privilege('luxtory_app', 'app.use_right_balance', 'INSERT, UPDATE') THEN
    v_failures := v_failures || 'app_table_privilege'::text;
  END IF;
  IF has_schema_privilege('luxtory_app', 'app', 'CREATE') THEN
    v_failures := v_failures || 'app_schema'::text;
  END IF;
  IF has_function_privilege('luxtory_app', 'app.authorize_booking_action(uuid, text)', 'EXECUTE')
     OR has_function_privilege('luxtory_app', 'app.revoke_booking_authorization(uuid, text)', 'EXECUTE')
     OR has_function_privilege('luxtory_app', 'app.booking_state_apply()', 'EXECUTE')
     OR has_function_privilege('luxtory_app', 'app.use_right_balance_apply()', 'EXECUTE')
     OR has_function_privilege('luxtory_app', 'app.assert_own_use_activation_ready()', 'EXECUTE') THEN
    v_failures := v_failures || 'app_function_privilege'::text;
  END IF;

  -- Papel autorizador: nenhum privilégio em nenhuma relação de `app` (tabela, coluna ou sequência), sem CREATE no schema
  -- ou no banco.
  FOR v_relation IN
    SELECT c.oid::regclass::text AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'app'
       AND CASE WHEN c.relkind = 'S'
                THEN has_sequence_privilege('luxtory_booking_authorizer', c.oid, 'USAGE, SELECT, UPDATE')
                WHEN c.relkind IN ('r', 'p', 'v', 'm', 'f')
                THEN has_table_privilege('luxtory_booking_authorizer', c.oid,
                       'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                  OR has_any_column_privilege('luxtory_booking_authorizer', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')
                ELSE false END
  LOOP
    v_failures := v_failures || ('authorizer_table:' || v_relation.name);
  END LOOP;
  IF has_schema_privilege('luxtory_booking_authorizer', 'app', 'CREATE')
     OR has_database_privilege('luxtory_booking_authorizer', current_database(), 'CREATE') THEN
    v_failures := v_failures || 'authorizer_schema'::text;
  END IF;
  -- Só as duas funções exatas (por assinatura, não por nome) com acesso a dados; atributos mínimos. Funções de gatilho (o
  -- PostgreSQL recusa a chamada direta) e funções IMMUTABLE sem SECURITY DEFINER executáveis por PUBLIC desde as waves
  -- anteriores não dão acesso a dados e não contam.
  IF NOT has_function_privilege('luxtory_booking_authorizer', 'app.authorize_booking_action(uuid, text)', 'EXECUTE')
     OR NOT has_function_privilege('luxtory_booking_authorizer', 'app.revoke_booking_authorization(uuid, text)', 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'app'
                   AND p.oid NOT IN ('app.authorize_booking_action(uuid, text)'::pg_catalog.regprocedure,
                                     'app.revoke_booking_authorization(uuid, text)'::pg_catalog.regprocedure)
                   AND has_function_privilege('luxtory_booking_authorizer', p.oid, 'EXECUTE')
                   AND (p.prosecdef OR (p.prorettype <> 'pg_catalog.trigger'::pg_catalog.regtype AND p.provolatile <> 'i')))
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r
                     WHERE r.rolname = 'luxtory_booking_authorizer' AND r.rolcanlogin AND NOT r.rolinherit
                       AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
                       AND NOT r.rolbypassrls AND r.rolconnlimit = 1)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid = m.member
                 WHERE r.rolname = 'luxtory_booking_authorizer') THEN
    v_failures := v_failures || 'authorizer_role'::text;
  END IF;
  -- SECURITY DEFINER sempre com `search_path = pg_catalog, pg_temp` (T-1312: com `''`, tipos sombreados em `pg_temp`
  -- venceriam os de `pg_catalog` e o CHECK de um domínio rodaria como o dono). Exceção finita e auditada: as cinco
  -- legadas abaixo (W2–W7), com `''`, só com o corpo revisado (md5 do `prosrc`) — por inspeção, nenhuma declara ou
  -- converte tipo sombreável, e os testes as executam com tipos sombreados pelos papéis que as executam (`luxtory_app`
  -- nas `auth_account_*`, `anon` nas `*_is_public`). Função nova, ou legada com corpo alterado, com `''` falha.
  IF EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'app' AND p.prosecdef
          AND p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, pg_temp']
          AND NOT EXISTS (
            SELECT 1 FROM (VALUES
                ('app.auth_account_by_email(text)', 'e16988c03f7cc7fa69b8920d036b887b'),
                ('app.auth_account_labels(uuid[])', 'f073f71337a8a60c5a867af22f450636'),
                ('app.brand_partner_is_public(uuid)', '0c74e3da1d167a0f4a3fa119fb6c2ab6'),
                ('app.catalog_term_is_public(uuid)', '817fc4d02d1ea5598db61c13ff8f93ac'),
                ('app.home_concept_is_public(uuid)', 'eb15107b413108918fa7f47021b40593')
              ) AS legacy(fn, body)
             WHERE p.oid = pg_catalog.to_regprocedure(legacy.fn) AND pg_catalog.md5(p.prosrc) = legacy.body
               AND p.proconfig = ARRAY['search_path=""'])) THEN
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
