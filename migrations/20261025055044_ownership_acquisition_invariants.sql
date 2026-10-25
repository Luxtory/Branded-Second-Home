-- migrate:up
-- W8 aggregate serialization without granting UPDATE on the immutable catalog root.
CREATE FUNCTION app.serialize_second_home_fact() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_home uuid;
BEGIN
  IF TG_TABLE_NAME='initial_allocation_grant' THEN
    SELECT second_home_id INTO v_home FROM app.second_home_initial_allocation WHERE id=NEW.initial_allocation_id;
  ELSE v_home := NEW.second_home_id;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('app.second_home:' || v_home::text, 0));
  IF TG_TABLE_NAME='second_home_initial_allocation'
     AND EXISTS (SELECT 1 FROM app.acquisition WHERE second_home_id=v_home) THEN
    RAISE EXCEPTION 'initial allocation is already locked by formalization'
      USING ERRCODE='check_violation', CONSTRAINT='conflict_initial_allocation_locked';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.serialize_second_home_fact() FROM PUBLIC;

CREATE FUNCTION app.validate_acquisition_facts(p_home uuid) RETURNS void
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  a app.acquisition;
  c app.second_home_configuration;
  v_luxtory uuid;
  v_holdings integer;
  v_parties integer;
  v_stakes integer;
  v_spes integer;
  v_grants integer;
BEGIN
  SELECT * INTO a FROM app.acquisition WHERE second_home_id=p_home;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM app.operation WHERE id=a.operation_id
      AND command='formalize_acquisition' AND role='admin' AND actor_user_id IS NOT NULL AND state='committed') THEN
    RAISE EXCEPTION 'ownership facts require the committed formalization command'
      USING ERRCODE='check_violation', CONSTRAINT='conflict_acquisition_operation';
  END IF;
  SELECT count(*), count(DISTINCT party_id) INTO v_holdings, v_parties FROM app.holding WHERE acquisition_id=a.id;
  SELECT count(*) INTO v_stakes FROM app.stake WHERE acquisition_id=a.id;
  SELECT count(*) INTO v_spes FROM app.spe WHERE acquisition_id=a.id;
  SELECT count(*) INTO v_grants FROM app.use_right_ledger WHERE acquisition_id=a.id;
  IF a.modality='owner' THEN
    IF v_holdings<>1 OR v_parties<>1 OR v_stakes<>0 OR v_spes<>0 OR v_grants<>0 THEN
      RAISE EXCEPTION 'Owner requires one integral holding and no artificial stake'
        USING ERRCODE='check_violation', CONSTRAINT='conflict_acquisition_cardinality';
    END IF;
  ELSE
    SELECT * INTO STRICT c FROM app.second_home_configuration WHERE id=a.configuration_id;
    IF v_holdings<>c.id OR v_parties<>c.id OR v_stakes<>c.id OR v_spes<>1 THEN
      RAISE EXCEPTION 'Co-Owner requires N distinct parties, holdings and stakes'
        USING ERRCODE='check_violation', CONSTRAINT='conflict_acquisition_cardinality';
    END IF;
    IF EXISTS (SELECT 1 FROM app.stake WHERE acquisition_id=a.id
        AND (participation_bps<>c.participation_bps OR allocation_position>c.id)) THEN
      RAISE EXCEPTION 'stakes must match their immutable configuration'
        USING ERRCODE='check_violation', CONSTRAINT='conflict_acquisition_equivalence';
    END IF;
    SELECT party_id INTO v_luxtory FROM app.luxtory_legal_identity;
    IF v_luxtory IS NULL THEN
      RAISE EXCEPTION 'institutional identity is not registered'
        USING ERRCODE='check_violation', CONSTRAINT='conflict_acquisition_institution_missing';
    END IF;
    IF EXISTS (SELECT 1 FROM app.holding WHERE acquisition_id=a.id AND party_id=v_luxtory) THEN
      RAISE EXCEPTION 'Luxtory cannot be a shareholder'
        USING ERRCODE='check_violation', CONSTRAINT='conflict_luxtory_shareholder';
    END IF;
    IF v_grants<>2*c.id OR EXISTS (
      SELECT 1 FROM app.use_right_ledger l JOIN app.stake s ON s.id=l.stake_id
      LEFT JOIN app.initial_allocation_grant g ON g.initial_allocation_id=a.initial_allocation_id AND g.position=s.allocation_position
      WHERE l.acquisition_id=a.id AND (
        l.exercise_year<>a.exercise_year
        OR l.source<>CASE WHEN a.initial_allocation_id IS NULL THEN 'configuration' ELSE 'initial_allocation' END
        OR l.initial_allocation_id IS DISTINCT FROM a.initial_allocation_id
        OR l.quantity IS DISTINCT FROM CASE
          WHEN a.initial_allocation_id IS NULL THEN CASE WHEN l.bucket='alta' THEN c.alta ELSE c.media END
          ELSE CASE WHEN l.bucket='alta' THEN g.alta ELSE g.media END END
      )
    ) THEN
      RAISE EXCEPTION 'initial grants require the exact configuration or initial allocation source'
        USING ERRCODE='check_violation', CONSTRAINT='conflict_use_right_grant_source';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM app.holding WHERE acquisition_id=a.id
      AND (role<>a.modality OR valid_until IS NOT NULL OR valid_from<>a.formalized_at)) THEN
    RAISE EXCEPTION 'initial holding must match the formalized modality and time'
      USING ERRCODE='check_violation', CONSTRAINT='conflict_acquisition_equivalence';
  END IF;
END $$;
REVOKE ALL ON FUNCTION app.validate_acquisition_facts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.validate_acquisition_facts(uuid) TO luxtory_app;

CREATE FUNCTION app.acquisition_facts_constraint() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  PERFORM app.validate_acquisition_facts(NEW.second_home_id);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.acquisition_facts_constraint() FROM PUBLIC;

CREATE FUNCTION app.validate_initial_allocation(p_id uuid) RETURNS void
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE a app.second_home_initial_allocation; c app.second_home_configuration; v_count integer;
BEGIN
  SELECT * INTO STRICT a FROM app.second_home_initial_allocation WHERE id=p_id;
  SELECT * INTO STRICT c FROM app.second_home_configuration WHERE id=a.configuration_id;
  IF NOT EXISTS (SELECT 1 FROM app.operation WHERE id=a.operation_id
      AND command='register_second_home_initial_allocation' AND role='admin'
      AND actor_user_id IS NOT NULL AND state='committed') THEN
    RAISE EXCEPTION 'initial allocation requires its committed command'
      USING ERRCODE='check_violation', CONSTRAINT='conflict_initial_allocation_operation';
  END IF;
  SELECT count(*) INTO v_count FROM app.initial_allocation_grant WHERE initial_allocation_id=p_id;
  IF v_count<>c.id OR EXISTS (SELECT 1 FROM app.initial_allocation_grant WHERE initial_allocation_id=p_id AND position>c.id) THEN
    RAISE EXCEPTION 'initial allocation requires all N technical positions'
      USING ERRCODE='check_violation', CONSTRAINT='conflict_initial_allocation_cardinality';
  END IF;
  IF (SELECT count(DISTINCT (alta,media)) FROM app.initial_allocation_grant WHERE initial_allocation_id=p_id)<>1
      OR EXISTS (SELECT 1 FROM app.initial_allocation_grant WHERE initial_allocation_id=p_id AND (alta>c.alta OR media>c.media))
      OR a.luxtory_alta>c.luxtory_alta OR a.luxtory_media>c.luxtory_media THEN
    RAISE EXCEPTION 'initial allocation must be equal per category and respect configuration limits'
      USING ERRCODE='check_violation', CONSTRAINT='conflict_initial_allocation_equivalence';
  END IF;
END $$;
REVOKE ALL ON FUNCTION app.validate_initial_allocation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.validate_initial_allocation(uuid) TO luxtory_app;

CREATE FUNCTION app.initial_allocation_constraint() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME='initial_allocation_grant' THEN
    PERFORM app.validate_initial_allocation(NEW.initial_allocation_id);
  ELSE PERFORM app.validate_initial_allocation(NEW.id);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.initial_allocation_constraint() FROM PUBLIC;

-- The union includes only effective coverage: a successor ends its predecessor at the successor's start.
-- An actual open end is required to contain the open operational period; renewal is never presumed.
CREATE FUNCTION app.has_professional_administration_coverage(p_home uuid, p_from date) RETURNS boolean
  LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT coalesce(range_agg(daterange(a.valid_from,
    CASE WHEN s.valid_from IS NULL THEN a.valid_until
      WHEN a.valid_until IS NULL THEN s.valid_from ELSE least(a.valid_until,s.valid_from) END, '[)'))
    @> daterange(p_from,NULL,'[)'),false)
  FROM app.second_home_administration a
  LEFT JOIN app.second_home_administration s ON s.replaces_id=a.id
  WHERE a.second_home_id=p_home AND a.professional
$$;
REVOKE ALL ON FUNCTION app.has_professional_administration_coverage(uuid,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.has_professional_administration_coverage(uuid,date) TO luxtory_app;

CREATE FUNCTION app.administration_constraint() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE a app.acquisition; v_start app.second_home_operation_start; v_timezone text;
BEGIN
  IF TG_TABLE_NAME='second_home_administration' THEN
    IF NOT EXISTS (SELECT 1 FROM app.operation WHERE id=NEW.operation_id
        AND command='register_second_home_administration' AND role='admin'
        AND actor_user_id IS NOT NULL AND state='committed') THEN
      RAISE EXCEPTION 'administration requires its committed command'
        USING ERRCODE='check_violation', CONSTRAINT='conflict_administration_operation';
    END IF;
    IF NEW.replaces_id IS NOT NULL AND EXISTS (SELECT 1 FROM app.second_home_administration
        WHERE id=NEW.replaces_id AND valid_from>NEW.valid_from) THEN
      RAISE EXCEPTION 'successor cannot precede the coverage it replaces'
        USING ERRCODE='check_violation', CONSTRAINT='conflict_administration_replacement';
    END IF;
    IF NEW.scope='full_luxtory_administration' AND NOT EXISTS (
        SELECT 1 FROM app.luxtory_legal_identity WHERE party_id=NEW.provider_party_id) THEN
      RAISE EXCEPTION 'full Luxtory administration requires the registered institutional provider'
        USING ERRCODE='check_violation', CONSTRAINT='conflict_administration_provider';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM app.operation WHERE id=NEW.operation_id
        AND command='register_second_home_operation_start' AND role='admin'
        AND actor_user_id IS NOT NULL AND state='committed') THEN
      RAISE EXCEPTION 'operation start requires its committed command'
        USING ERRCODE='check_violation', CONSTRAINT='conflict_operation_start_operation';
    END IF;
    SELECT timezone INTO STRICT v_timezone FROM app.second_home WHERE id=NEW.second_home_id;
    IF NEW.effective_start_date>(NEW.operation_start_registered_at AT TIME ZONE v_timezone)::date THEN
      RAISE EXCEPTION 'operation cannot be registered before its civil start date'
        USING ERRCODE='check_violation', CONSTRAINT='conflict_operation_start_future';
    END IF;
  END IF;
  SELECT * INTO v_start FROM app.second_home_operation_start WHERE second_home_id=NEW.second_home_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO STRICT a FROM app.acquisition WHERE id=v_start.acquisition_id;
  IF a.modality='co_owner' AND NOT app.has_professional_administration_coverage(a.second_home_id,a.operation_start_date) THEN
    RAISE EXCEPTION 'operational Co-Owner requires continuous professional administration coverage'
      USING ERRCODE='check_violation', CONSTRAINT='conflict_administration_coverage';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.administration_constraint() FROM PUBLIC;

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['second_home_initial_allocation','initial_allocation_grant','acquisition','spe',
      'stake','holding','use_right_ledger','second_home_administration','second_home_operation_start'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON app.%I FOR EACH ROW EXECUTE FUNCTION app.serialize_second_home_fact()',
      v_table || '_serialize', v_table);
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY['acquisition','spe','stake','holding','use_right_ledger'] LOOP
    EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT ON app.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.acquisition_facts_constraint()',
      v_table || '_facts_constraint', v_table);
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY['second_home_initial_allocation','initial_allocation_grant'] LOOP
    EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT ON app.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.initial_allocation_constraint()',
      v_table || '_facts_constraint', v_table);
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY['second_home_administration','second_home_operation_start'] LOOP
    EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT ON app.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.administration_constraint()',
      v_table || '_facts_constraint', v_table);
  END LOOP;
END $$;


-- migrate:down
DO $$
DECLARE v_table text;
BEGIN
  IF EXISTS (SELECT 1 FROM app.acquisition) OR EXISTS (SELECT 1 FROM app.second_home_initial_allocation)
      OR EXISTS (SELECT 1 FROM app.second_home_administration) THEN
    RAISE EXCEPTION 'W8 rollback cannot remove ownership invariants with formalized facts';
  END IF;
  FOREACH v_table IN ARRAY ARRAY['acquisition','spe','stake','holding','use_right_ledger',
      'second_home_initial_allocation','initial_allocation_grant','second_home_administration','second_home_operation_start'] LOOP
    EXECUTE format('DROP TRIGGER %I ON app.%I', v_table || '_facts_constraint', v_table);
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY['second_home_initial_allocation','initial_allocation_grant','acquisition','spe',
      'stake','holding','use_right_ledger','second_home_administration','second_home_operation_start'] LOOP
    EXECUTE format('DROP TRIGGER %I ON app.%I', v_table || '_serialize', v_table);
  END LOOP;
END $$;
DROP FUNCTION app.acquisition_facts_constraint();
DROP FUNCTION app.validate_acquisition_facts(uuid);
DROP FUNCTION app.initial_allocation_constraint();
DROP FUNCTION app.validate_initial_allocation(uuid);
DROP FUNCTION app.administration_constraint();
DROP FUNCTION app.has_professional_administration_coverage(uuid,date);
DROP FUNCTION app.serialize_second_home_fact();
