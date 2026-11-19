-- migrate:up
-- W14 (REQ-092; BR-330 a BR-332; TECH-051, TECH-052; ADR-0030 §4; spec booking §W14): declaração do Titular de que
-- convidados poderão usar a própria reserva sob uma versão aceita de `guest_rules` da Second Home. Só a declaração e a
-- versão aceita (P-6): nenhum dado, identificação ou quantidade de convidados — a entidade `guest` do 03 §3.1 espera a
-- P-6. A declaração não consome Direito de Uso, não cria direito, ocupação nem valor econômico e não é canal de
-- reserva; o Titular continua responsável (BR-332). Uma declaração por (reserva, versão): aceitar de novo só quando as
-- regras vigentes mudarem.
CREATE TABLE app.guest_nomination (
  id uuid PRIMARY KEY,
  booking_id uuid NOT NULL,
  second_home_id uuid NOT NULL,
  parameter_id uuid NOT NULL,
  parameter_key text NOT NULL DEFAULT 'guest_rules',
  -- Party que declara (a representada pelo Titular da operação), fixada contra transferência futura da Ação.
  party_id uuid NOT NULL REFERENCES app.party(id),
  nominated_at timestamptz NOT NULL,
  operation_id uuid NOT NULL UNIQUE REFERENCES app.operation(id),
  CONSTRAINT guest_nomination_booking_fk FOREIGN KEY (booking_id, second_home_id)
    REFERENCES app.booking(id, second_home_id),
  CONSTRAINT guest_nomination_rules_fk FOREIGN KEY (parameter_id, parameter_key, second_home_id)
    REFERENCES app.parameter(id, key, second_home_id),
  CONSTRAINT guest_nomination_rules_key CHECK (parameter_key = 'guest_rules'),
  CONSTRAINT conflict_guest_nomination_version UNIQUE (booking_id, parameter_id)
);
CREATE INDEX guest_nomination_booking_idx ON app.guest_nomination (booking_id, nominated_at);

-- Ordem do handler (TECH-053): representação travada (`FOR SHARE` na delegação) → trava da reserva (mesma chave do
-- ciclo da W13) → trava compartilhada do escopo das regras (a publicação toma a exclusiva) → instante → revalidação.
-- Depois da trava compartilhada nenhuma versão nova pode começar antes do instante carimbado aqui.
CREATE FUNCTION app.guest_nomination_insert() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE op app.operation; b app.booking; v_timezone text; v_at timestamptz; v_rules uuid;
BEGIN
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  IF op.command <> 'nominate_guest' OR op.second_home_id IS DISTINCT FROM NEW.second_home_id
     OR NEW.party_id IS DISTINCT FROM op.acting_party_id THEN
    RAISE EXCEPTION 'a guest nomination is recorded by its nominate_guest operation, for the represented party'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'guest_nomination_provenance';
  END IF;
  SELECT * INTO b FROM app.booking WHERE id = NEW.booking_id AND second_home_id = NEW.second_home_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a guest nomination belongs to a booking of the Second Home'
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'guest_nomination_booking_fk';
  END IF;
  PERFORM app.lock_own_use_titular(op, b, clock_timestamp());
  PERFORM pg_advisory_xact_lock(hashtextextended('app.booking:' || b.id::text, 0));
  PERFORM pg_advisory_xact_lock_shared(
    hashtextextended('app.parameter:guest_rules:' || NEW.second_home_id::text, 0));
  v_at := clock_timestamp();
  SELECT * INTO STRICT b FROM app.booking WHERE id = NEW.booking_id;
  SELECT timezone INTO STRICT v_timezone FROM app.second_home WHERE id = b.second_home_id;
  IF b.channel <> 'own_use' OR b.state NOT IN ('confirmed', 'in_use')
     OR v_at >= app.booking_checkout_at(b.checkout_date, v_timezone) THEN
    RAISE EXCEPTION 'guests are nominated only for an own use booking that is confirmed or in use, before check-out'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_guest_nomination_booking';
  END IF;
  SELECT id INTO v_rules FROM app.parameter_at('guest_rules', b.second_home_id, v_at);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'the Second Home has no guest rules in force'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'parameter_missing_guest_rules';
  END IF;
  IF v_rules IS DISTINCT FROM NEW.parameter_id THEN
    RAISE EXCEPTION 'the accepted guest rules are not the version in force'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'guest_rules_changed';
  END IF;
  NEW.nominated_at := v_at;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.guest_nomination_insert() FROM PUBLIC;
CREATE TRIGGER guest_nomination_insert BEFORE INSERT ON app.guest_nomination
  FOR EACH ROW EXECUTE FUNCTION app.guest_nomination_insert();
CREATE TRIGGER guest_nomination_no_update BEFORE UPDATE ON app.guest_nomination
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER guest_nomination_no_delete BEFORE DELETE ON app.guest_nomination
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER guest_nomination_no_truncate BEFORE TRUNCATE ON app.guest_nomination
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

ALTER TABLE app.guest_nomination ENABLE ROW LEVEL SECURITY;
CREATE POLICY guest_nomination_app_read ON app.guest_nomination FOR SELECT TO luxtory_app USING (true);
CREATE POLICY guest_nomination_app_insert ON app.guest_nomination FOR INSERT TO luxtory_app WITH CHECK (true);
GRANT SELECT, INSERT ON app.guest_nomination TO luxtory_app;
-- Titular: as declarações das reservas que já lê (RLS de `booking`: holding vigente representada); sem party nem
-- operação.
GRANT SELECT (id, booking_id, second_home_id, parameter_id, nominated_at) ON app.guest_nomination TO authenticated;
CREATE POLICY guest_nomination_holder_read ON app.guest_nomination FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM app.booking b WHERE b.id = guest_nomination.booking_id)
);


-- migrate:down
-- Declarações nunca são descartadas por rollback: com qualquer declaração gravada, a reversão é recusada. A trava
-- exclusiva espera declarações em curso e barra as novas. Sem linhas (banco vazio do `db:check`), desfaz tudo.
DO $$
BEGIN
  LOCK TABLE app.guest_nomination IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.guest_nomination) THEN
    RAISE EXCEPTION 'W14 rollback would discard guest nominations';
  END IF;
END $$;
DROP TABLE app.guest_nomination;
DROP FUNCTION app.guest_nomination_insert();
