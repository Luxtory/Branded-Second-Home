-- migrate:up
-- W10 (ADR-004 do 03; REQ-040, INV-3; TECH-021, TECH-022): custódia por noite selada, DDL do 03 §3.2 com as FKs que
-- amarram Second Home, Ação, noite, cadeia e operação. Spec: docs/specs/inventory.md; ADR-0024.
-- Três camadas: (1) estrutural, completa aqui; (2) operação concreta — todo registro aponta para a operação da própria
-- transação, e na W10 o papel da aplicação só abre a raiz (sem UPDATE: nenhuma transição é executável); (3) prova
-- econômica (Créditos, capacidade Luxtory, settlements) nas waves que criam esses fatos.

-- A Ação de uma custódia pertence à mesma Second Home.
ALTER TABLE app.stake ADD CONSTRAINT stake_id_second_home_key UNIQUE (id, second_home_id);

CREATE TABLE app.date_custody (
  id uuid PRIMARY KEY,
  second_home_id uuid NOT NULL,
  stay_date date NOT NULL,
  holder_kind text NOT NULL,
  stake_id uuid,
  basis text,
  purpose text,
  inventory_origin text,
  authorization_ref text,
  parent_custody_id uuid,
  opened_by_operation uuid NOT NULL REFERENCES app.operation(id),
  closed_by_operation uuid REFERENCES app.operation(id),
  closed_at timestamptz,
  CONSTRAINT custody_night_sealed FOREIGN KEY (second_home_id, stay_date)
    REFERENCES app.second_home_date(second_home_id, stay_date),
  CONSTRAINT custody_stake_same_second_home FOREIGN KEY (stake_id, second_home_id)
    REFERENCES app.stake(id, second_home_id),
  CONSTRAINT custody_parent_same_night FOREIGN KEY (parent_custody_id, second_home_id, stay_date)
    REFERENCES app.date_custody(id, second_home_id, stay_date),
  -- Cadeia linear: cada custódia fechada tem exatamente uma sucessora (sem bifurcação).
  CONSTRAINT custody_single_successor UNIQUE (parent_custody_id),
  CONSTRAINT date_custody_id_night_key UNIQUE (id, second_home_id, stay_date),
  CONSTRAINT custody_holder_kind_check CHECK (holder_kind IN ('owner', 'spe_pool', 'use_right', 'luxtory')),
  CONSTRAINT custody_basis_check CHECK (basis IN ('reserved_right', 'forfeited_right', 'delinquency')),
  CONSTRAINT custody_purpose_check
    CHECK (purpose IN ('maintenance', 'marketing', 'promotion', 'production', 'inventory')),
  -- INV-3: somente as três origens da BR-161; nenhuma quarta.
  CONSTRAINT custody_inventory_origin_check
    CHECK (inventory_origin IN ('annual_allocation', 'luxchange_cession', 'recovered_future_capacity')),
  CONSTRAINT custody_use_right_stake CHECK ((holder_kind = 'use_right') = (stake_id IS NOT NULL)),
  CONSTRAINT custody_use_right_basis CHECK ((holder_kind = 'use_right') = (basis IS NOT NULL)),
  CONSTRAINT custody_luxtory_purpose CHECK ((holder_kind = 'luxtory') = (purpose IS NOT NULL)),
  CONSTRAINT custody_inventory_origin_required
    CHECK ((holder_kind = 'luxtory' AND purpose = 'inventory') = (inventory_origin IS NOT NULL)),
  -- REQ-040: entrada no Inventário Luxtory sem autorização identificável é recusada.
  CONSTRAINT custody_inventory_authorization CHECK (inventory_origin IS NULL OR authorization_ref IS NOT NULL),
  CONSTRAINT custody_authorization_ref_format
    CHECK (authorization_ref IS NULL OR length(btrim(authorization_ref)) BETWEEN 1 AND 255),
  CONSTRAINT custody_closing_pair CHECK ((closed_at IS NULL) = (closed_by_operation IS NULL)),
  CONSTRAINT custody_parent_not_self CHECK (parent_custody_id IS NULL OR parent_custody_id <> id)
);
-- TECH-021: no máximo uma custódia ativa por noite (nome do 03; mapeado a ERR_CAPACITY_UNAVAILABLE).
CREATE UNIQUE INDEX uq_custody_active ON app.date_custody(second_home_id, stay_date) WHERE closed_at IS NULL;
CREATE INDEX date_custody_night_idx ON app.date_custody(second_home_id, stay_date);

-- Todo fato de inventário pertence à operação da transação corrente: o store insere a operação `pending` e só a marca
-- `committed` no fim da mesma transação; operação de outra transação ou já encerrada não é aceita. Consistência contra
-- erros de código — não prova de que o guard rodou: essa fronteira é do servidor da aplicação (ADR-0024 §3).
CREATE FUNCTION app.assert_operation_in_transaction(p_operation uuid) RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app.operation WHERE id = p_operation AND state = 'pending') THEN
    RAISE EXCEPTION 'inventory facts belong to the operation of the current transaction'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'inventory_operation_provenance';
  END IF;
END $$;

-- W10: nenhuma transição (e, na migration seguinte, nenhuma ocupação) é executável por papel que não seja o dono do
-- schema — nem pela aplicação com privilégio concedido. Habilitar exige migration que substitua esta função pela regra
-- de autorização da wave dona, decidida com o fundador (ADR-0024 §3): ponto obrigatório de reavaliação no banco.
CREATE FUNCTION app.assert_inventory_transition_enabled() RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles r
        WHERE r.rolname = current_user
          AND (r.rolsuper OR r.oid = (SELECT c.relowner FROM pg_catalog.pg_class c
                                       WHERE c.oid = 'app.date_custody'::regclass))) THEN
    RAISE EXCEPTION 'inventory transitions and occupancies are not enabled in W10'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'inventory_transition_not_enabled';
  END IF;
END $$;

-- TECH-022: a tabela fechada de transições. `luxtory/inventory → pai` (BR-163) repete a custódia anterior ao
-- inventário. `use_right/delinquency` e `luxtory/{não inventory}` não têm saída na TECH-022 (pendências P-12/P-13).
CREATE FUNCTION app.custody_transition_valid(p app.date_custody, n app.date_custody, g app.date_custody)
  RETURNS boolean
  LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $$
BEGIN
  IF p.holder_kind = 'luxtory' AND p.purpose = 'inventory' THEN
    RETURN g.id IS NOT NULL
      AND (n.holder_kind, n.stake_id, n.basis, n.purpose, n.inventory_origin)
          IS NOT DISTINCT FROM (g.holder_kind, g.stake_id, g.basis, g.purpose, g.inventory_origin);
  END IF;
  RETURN coalesce(CASE
    WHEN p.holder_kind = 'spe_pool' THEN
      -- reserva Co-Owner, inadimplência autorizada ou seleção Luxtory (inventory ⇔ annual_allocation)
      (n.holder_kind = 'use_right' AND n.basis IN ('reserved_right', 'delinquency'))
      OR (n.holder_kind = 'luxtory' AND (n.purpose <> 'inventory' OR n.inventory_origin = 'annual_allocation'))
    WHEN p.holder_kind = 'use_right' AND p.basis = 'reserved_right' THEN
      -- cancelamento tempestivo, futuro de cancelamento tardio/no-show (mesma Ação) ou depósito/Request aceita
      n.holder_kind = 'spe_pool'
      OR (n.holder_kind = 'use_right' AND n.basis = 'forfeited_right' AND n.stake_id = p.stake_id)
      OR (n.holder_kind = 'luxtory' AND n.purpose = 'inventory' AND n.inventory_origin = 'luxchange_cession')
    WHEN p.holder_kind = 'owner' THEN
      n.holder_kind = 'luxtory' AND n.purpose = 'inventory' AND n.inventory_origin = 'luxchange_cession'
    WHEN p.holder_kind = 'use_right' AND p.basis = 'forfeited_right' THEN
      -- BR-283
      n.holder_kind = 'luxtory' AND n.purpose = 'inventory' AND n.inventory_origin = 'recovered_future_capacity'
    ELSE false
  END, false);
END $$;

CREATE FUNCTION app.date_custody_open() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_parent app.date_custody; v_grand app.date_custody; v_modality text;
BEGIN
  IF NEW.closed_at IS NOT NULL OR NEW.closed_by_operation IS NOT NULL THEN
    RAISE EXCEPTION 'a custody opens active'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_opens_active';
  END IF;
  PERFORM app.assert_operation_in_transaction(NEW.opened_by_operation);
  IF NEW.parent_custody_id IS NULL THEN
    -- TECH-021: raiz autorizada pelos fatos (formalização + noite selada), nunca por decisão: a primeira custódia da
    -- noite, owner no Owner e spe_pool no Co-Owner, aberta pelo command de sistema que sela.
    IF EXISTS (SELECT 1 FROM app.date_custody
                WHERE second_home_id = NEW.second_home_id AND stay_date = NEW.stay_date) THEN
      RAISE EXCEPTION 'only the first custody of a sealed night is a root'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_root_first';
    END IF;
    SELECT modality INTO v_modality FROM app.acquisition WHERE second_home_id = NEW.second_home_id;
    IF NOT FOUND OR NEW.holder_kind <> (CASE v_modality WHEN 'owner' THEN 'owner' ELSE 'spe_pool' END) THEN
      RAISE EXCEPTION 'the root custody follows the acquisition modality'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_root_modality';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM app.operation
                    WHERE id = NEW.opened_by_operation AND command = 'open_exercise' AND role = 'system') THEN
      RAISE EXCEPTION 'only open_exercise opens a root custody'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'inventory_operation_provenance';
    END IF;
    RETURN NEW;
  END IF;
  PERFORM app.assert_inventory_transition_enabled();
  -- Transição atômica: a mãe (mesma noite, pela FK composta) foi fechada pela operação que abre a filha.
  SELECT * INTO v_parent FROM app.date_custody WHERE id = NEW.parent_custody_id;
  IF NOT FOUND OR v_parent.closed_by_operation IS DISTINCT FROM NEW.opened_by_operation THEN
    RAISE EXCEPTION 'a successor custody is opened by the operation that closed its parent'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_transition_atomic';
  END IF;
  IF v_parent.parent_custody_id IS NOT NULL THEN
    SELECT * INTO v_grand FROM app.date_custody WHERE id = v_parent.parent_custody_id;
  END IF;
  IF NOT app.custody_transition_valid(v_parent, NEW, v_grand) THEN
    RAISE EXCEPTION 'custody transition outside the closed TECH-022 table'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_transition_closed_table';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.date_custody_open() FROM PUBLIC;
CREATE TRIGGER date_custody_open BEFORE INSERT ON app.date_custody
  FOR EACH ROW EXECUTE FUNCTION app.date_custody_open();

-- Histórico não é reescrito: só o fechamento de uma custódia ativa, uma vez, pela operação da transação.
CREATE FUNCTION app.date_custody_close() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  PERFORM app.assert_inventory_transition_enabled();
  IF OLD.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'a closed custody never changes'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_closed_once';
  END IF;
  IF (NEW.id, NEW.second_home_id, NEW.stay_date, NEW.holder_kind, NEW.stake_id, NEW.basis, NEW.purpose,
      NEW.inventory_origin, NEW.authorization_ref, NEW.parent_custody_id, NEW.opened_by_operation)
     IS DISTINCT FROM
     (OLD.id, OLD.second_home_id, OLD.stay_date, OLD.holder_kind, OLD.stake_id, OLD.basis, OLD.purpose,
      OLD.inventory_origin, OLD.authorization_ref, OLD.parent_custody_id, OLD.opened_by_operation)
     OR NEW.closed_at IS NULL THEN
    RAISE EXCEPTION 'only the closing of an active custody is recorded'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_history_immutable';
  END IF;
  PERFORM app.assert_operation_in_transaction(NEW.closed_by_operation);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.date_custody_close() FROM PUBLIC;
CREATE TRIGGER date_custody_close BEFORE UPDATE ON app.date_custody
  FOR EACH ROW EXECUTE FUNCTION app.date_custody_close();
CREATE TRIGGER date_custody_no_delete BEFORE DELETE ON app.date_custody
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER date_custody_no_truncate BEFORE TRUNCATE ON app.date_custody
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- TECH-021: toda noite selada termina a transação com exatamente uma custódia ativa (o índice parcial garante no
-- máximo uma; isto garante ao menos uma, no COMMIT).
CREATE FUNCTION app.custody_sealed_night_constraint() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app.date_custody
                  WHERE second_home_id = NEW.second_home_id AND stay_date = NEW.stay_date AND closed_at IS NULL) THEN
    RAISE EXCEPTION 'every sealed night ends the transaction with exactly one active custody'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_sealed_night_active';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.custody_sealed_night_constraint() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER second_home_date_custody_constraint AFTER INSERT ON app.second_home_date
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.custody_sealed_night_constraint();
CREATE CONSTRAINT TRIGGER date_custody_active_constraint AFTER INSERT OR UPDATE ON app.date_custody
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.custody_sealed_night_constraint();

REVOKE ALL ON FUNCTION app.assert_operation_in_transaction(uuid), app.assert_inventory_transition_enabled(),
  app.custody_transition_valid(app.date_custody, app.date_custody, app.date_custody) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.assert_operation_in_transaction(uuid), app.assert_inventory_transition_enabled(),
  app.custody_transition_valid(app.date_custody, app.date_custody, app.date_custody) TO luxtory_app;

-- W10: a aplicação só abre a raiz. Sem UPDATE, nenhuma transição é executável pelo papel da aplicação; a wave que
-- trouxer o command de uma transição concede o privilégio junto com ele.
ALTER TABLE app.date_custody ENABLE ROW LEVEL SECURITY;
CREATE POLICY date_custody_app_read ON app.date_custody FOR SELECT TO luxtory_app USING (true);
CREATE POLICY date_custody_app_insert ON app.date_custody FOR INSERT TO luxtory_app WITH CHECK (true);
GRANT SELECT, INSERT ON app.date_custody TO luxtory_app;


-- migrate:down
DO $$
BEGIN
  LOCK TABLE app.date_custody IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.date_custody) THEN
    RAISE EXCEPTION 'W10 rollback would discard facts in app.date_custody';
  END IF;
END $$;
DROP TRIGGER second_home_date_custody_constraint ON app.second_home_date;
-- A assinatura usa o tipo-linha da tabela: a função sai antes dela.
DROP FUNCTION app.custody_transition_valid(app.date_custody, app.date_custody, app.date_custody);
DROP TABLE app.date_custody;
DROP FUNCTION app.custody_sealed_night_constraint();
DROP FUNCTION app.date_custody_close();
DROP FUNCTION app.date_custody_open();
DROP FUNCTION app.assert_inventory_transition_enabled();
DROP FUNCTION app.assert_operation_in_transaction(uuid);
ALTER TABLE app.stake DROP CONSTRAINT stake_id_second_home_key;
