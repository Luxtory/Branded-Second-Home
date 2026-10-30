-- migrate:up
-- W10 (ADR-004 do 03; INV-2; TECH-021, TECH-023): ocupação por noite e a matriz ocupação/custódia, completas para as
-- waves seguintes. Nenhuma ocupação é gravável pelo papel da aplicação na W10 (sem INSERT/UPDATE): o primeiro canal
-- chega com a reserva da W12, que concede o privilégio junto com o command. Spec: docs/specs/inventory.md; ADR-0024.
CREATE TABLE app.date_occupancy (
  id uuid PRIMARY KEY,
  second_home_id uuid NOT NULL,
  stay_date date NOT NULL,
  -- `booking` nasce na W12, que acrescenta a FK; até lá ninguém grava ocupação.
  booking_id uuid NOT NULL,
  channel text NOT NULL,
  custody_id uuid NOT NULL,
  -- Ação cujo Direito de Uso fundamenta a ocupação (TECH-023: "mesma Ação", "Ação ofertante").
  stake_id uuid,
  opened_by_operation uuid NOT NULL REFERENCES app.operation(id),
  released_by_operation uuid REFERENCES app.operation(id),
  released_at timestamptz,
  release_reason text,
  CONSTRAINT custody_occupancy_night_sealed FOREIGN KEY (second_home_id, stay_date)
    REFERENCES app.second_home_date(second_home_id, stay_date),
  CONSTRAINT custody_occupancy_same_night FOREIGN KEY (custody_id, second_home_id, stay_date)
    REFERENCES app.date_custody(id, second_home_id, stay_date),
  CONSTRAINT custody_occupancy_stake FOREIGN KEY (stake_id, second_home_id) REFERENCES app.stake(id, second_home_id),
  CONSTRAINT date_occupancy_channel_check CHECK (channel IN (
    'own_use', 'luxtory_use', 'luxchange_request', 'luxchange_direct', 'luxplus', 'rental_external'
  )),
  -- O 03 só nomeia `ceded`; cada wave acrescenta os motivos do próprio fluxo.
  CONSTRAINT date_occupancy_release_reason_check CHECK (release_reason IN ('ceded')),
  CONSTRAINT date_occupancy_ceded_own_use CHECK (release_reason <> 'ceded' OR channel = 'own_use'),
  CONSTRAINT date_occupancy_release_triple CHECK (
    (released_at IS NULL) = (release_reason IS NULL) AND (released_at IS NULL) = (released_by_operation IS NULL)
  )
);
-- TECH-021: no máximo uma ocupação ativa por noite (nome do 03; mapeado a ERR_BOOKING_CONFLICT).
CREATE UNIQUE INDEX uq_occupancy_active ON app.date_occupancy(second_home_id, stay_date) WHERE released_at IS NULL;
CREATE INDEX date_occupancy_custody_idx ON app.date_occupancy(custody_id);

-- TECH-023: pares ocupação/custódia válidos; qualquer outro é recusado.
CREATE FUNCTION app.occupancy_pair_valid(o app.date_occupancy, c app.date_custody) RETURNS boolean
  LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $$
BEGIN
  RETURN coalesce(CASE o.channel
    WHEN 'own_use' THEN
      (c.holder_kind = 'owner' AND o.stake_id IS NULL)
      OR (c.holder_kind = 'use_right' AND c.basis = 'reserved_right' AND o.stake_id = c.stake_id)
    WHEN 'luxtory_use' THEN
      c.holder_kind = 'luxtory' AND c.purpose <> 'inventory' AND o.stake_id IS NULL
    WHEN 'luxchange_request' THEN
      c.holder_kind = 'luxtory' AND c.purpose = 'inventory' AND c.inventory_origin = 'luxchange_cession'
      AND c.opened_by_operation = o.opened_by_operation AND o.stake_id IS NULL
    WHEN 'luxchange_direct' THEN
      c.holder_kind = 'luxtory' AND c.purpose = 'inventory' AND o.stake_id IS NULL
    WHEN 'luxplus' THEN
      c.holder_kind = 'luxtory' AND c.purpose = 'inventory' AND o.stake_id IS NULL
    WHEN 'rental_external' THEN
      (c.holder_kind = 'owner' AND o.stake_id IS NULL)
      OR (c.holder_kind = 'use_right' AND c.basis = 'reserved_right' AND o.stake_id = c.stake_id)
      -- delinquency: a Ação, se informada, é a da custódia; o resto pertence à W27.
      OR (c.holder_kind = 'use_right' AND c.basis = 'delinquency' AND (o.stake_id IS NULL OR o.stake_id = c.stake_id))
    ELSE false
  END, false);
END $$;

CREATE FUNCTION app.date_occupancy_open() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_custody app.date_custody;
BEGIN
  IF NEW.released_at IS NOT NULL OR NEW.release_reason IS NOT NULL OR NEW.released_by_operation IS NOT NULL THEN
    RAISE EXCEPTION 'an occupancy opens active'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'date_occupancy_opens_active';
  END IF;
  PERFORM app.assert_inventory_transition_enabled();
  PERFORM app.assert_operation_in_transaction(NEW.opened_by_operation);
  -- TECH-053: o command já travou a noite (classe 5); aqui só a custódia (classe 6), contra o fechamento concorrente.
  SELECT * INTO v_custody FROM app.date_custody WHERE id = NEW.custody_id FOR SHARE;
  IF NOT FOUND OR v_custody.closed_at IS NOT NULL
     OR v_custody.second_home_id <> NEW.second_home_id OR v_custody.stay_date <> NEW.stay_date THEN
    RAISE EXCEPTION 'an occupancy references the active custody of the same night'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_occupancy_active';
  END IF;
  IF NOT app.occupancy_pair_valid(NEW, v_custody) THEN
    RAISE EXCEPTION 'occupancy and custody pair outside the TECH-023 matrix'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_occupancy_matrix';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.date_occupancy_open() FROM PUBLIC;
CREATE TRIGGER date_occupancy_open BEFORE INSERT ON app.date_occupancy
  FOR EACH ROW EXECUTE FUNCTION app.date_occupancy_open();

-- Só a liberação, uma vez; `ceded` só libera own_use Co-Owner sobre reserved_right da mesma Ação (TECH-023).
CREATE FUNCTION app.date_occupancy_release() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  PERFORM app.assert_inventory_transition_enabled();
  IF OLD.released_at IS NOT NULL THEN
    RAISE EXCEPTION 'a released occupancy never changes'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'date_occupancy_released_once';
  END IF;
  IF (NEW.id, NEW.second_home_id, NEW.stay_date, NEW.booking_id, NEW.channel, NEW.custody_id, NEW.stake_id,
      NEW.opened_by_operation)
     IS DISTINCT FROM
     (OLD.id, OLD.second_home_id, OLD.stay_date, OLD.booking_id, OLD.channel, OLD.custody_id, OLD.stake_id,
      OLD.opened_by_operation)
     OR NEW.released_at IS NULL THEN
    RAISE EXCEPTION 'only the release of an active occupancy is recorded'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'date_occupancy_history_immutable';
  END IF;
  PERFORM app.assert_operation_in_transaction(NEW.released_by_operation);
  IF NEW.release_reason = 'ceded' AND NOT EXISTS (
       SELECT 1 FROM app.date_custody c
        WHERE c.id = OLD.custody_id AND c.holder_kind = 'use_right' AND c.basis = 'reserved_right'
          AND c.stake_id = OLD.stake_id) THEN
    RAISE EXCEPTION 'ceded only releases Co-Owner own use over a reserved right of the same stake'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'date_occupancy_ceded_reserved_right';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.date_occupancy_release() FROM PUBLIC;
CREATE TRIGGER date_occupancy_release BEFORE UPDATE ON app.date_occupancy
  FOR EACH ROW EXECUTE FUNCTION app.date_occupancy_release();
CREATE TRIGGER date_occupancy_no_delete BEFORE DELETE ON app.date_occupancy
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER date_occupancy_no_truncate BEFORE TRUNCATE ON app.date_occupancy
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- TECH-021: custódia ocupada só fecha depois da liberação da ocupação (na mesma transação, antes do fechamento). O
-- UPDATE trava a custódia antes deste gatilho; a ocupação concorrente espera pelo FOR SHARE acima, e vice-versa.
CREATE FUNCTION app.date_custody_close_released() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NEW.closed_at IS NOT NULL AND EXISTS (
       SELECT 1 FROM app.date_occupancy WHERE custody_id = OLD.id AND released_at IS NULL) THEN
    RAISE EXCEPTION 'an occupied custody closes only after its occupancy is released'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_occupied';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.date_custody_close_released() FROM PUBLIC;
CREATE TRIGGER date_custody_close_released BEFORE UPDATE ON app.date_custody
  FOR EACH ROW EXECUTE FUNCTION app.date_custody_close_released();

REVOKE ALL ON FUNCTION app.occupancy_pair_valid(app.date_occupancy, app.date_custody) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.occupancy_pair_valid(app.date_occupancy, app.date_custody) TO luxtory_app;

ALTER TABLE app.date_occupancy ENABLE ROW LEVEL SECURITY;
CREATE POLICY date_occupancy_app_read ON app.date_occupancy FOR SELECT TO luxtory_app USING (true);
GRANT SELECT ON app.date_occupancy TO luxtory_app;


-- migrate:down
DO $$
BEGIN
  LOCK TABLE app.date_occupancy IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.date_occupancy) THEN
    RAISE EXCEPTION 'W10 rollback would discard facts in app.date_occupancy';
  END IF;
END $$;
DROP TRIGGER date_custody_close_released ON app.date_custody;
DROP FUNCTION app.date_custody_close_released();
DROP FUNCTION app.occupancy_pair_valid(app.date_occupancy, app.date_custody);
DROP TABLE app.date_occupancy;
DROP FUNCTION app.date_occupancy_release();
DROP FUNCTION app.date_occupancy_open();
