-- migrate:up
-- W8: immutable facts extending the existing catalog aggregate; no UPDATE permission on catalog.second_home.
-- Allocations describe explicit quantities, never dates, reservations, custody or inventory.
CREATE TABLE app.second_home_initial_allocation (
  id uuid PRIMARY KEY,
  second_home_id uuid NOT NULL REFERENCES app.second_home(id),
  version integer NOT NULL CHECK (version > 0),
  configuration_id smallint NOT NULL REFERENCES app.second_home_configuration(id),
  operation_start_date date NOT NULL CHECK (
    operation_start_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'
    AND NOT (extract(month FROM operation_start_date)=1 AND extract(day FROM operation_start_date)=1)
  ),
  exercise_year integer GENERATED ALWAYS AS (extract(year FROM operation_start_date)::integer) STORED,
  luxtory_alta smallint NOT NULL CHECK (luxtory_alta >= 0),
  luxtory_media smallint NOT NULL CHECK (luxtory_media >= 0),
  basis_ref text NOT NULL CHECK (length(btrim(basis_ref)) BETWEEN 1 AND 255),
  validated_at timestamptz NOT NULL,
  operation_id uuid NOT NULL UNIQUE REFERENCES app.operation(id),
  UNIQUE (second_home_id, version),
  UNIQUE (id, second_home_id),
  UNIQUE (id, operation_id),
  UNIQUE (id, second_home_id, configuration_id, operation_start_date)
);
CREATE TABLE app.initial_allocation_grant (
  initial_allocation_id uuid NOT NULL,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 10),
  alta smallint NOT NULL CHECK (alta >= 0),
  media smallint NOT NULL CHECK (media >= 0),
  operation_id uuid NOT NULL,
  PRIMARY KEY (initial_allocation_id, position),
  FOREIGN KEY (initial_allocation_id, operation_id)
    REFERENCES app.second_home_initial_allocation(id, operation_id)
);

CREATE TABLE app.acquisition (
  id uuid PRIMARY KEY,
  second_home_id uuid NOT NULL REFERENCES app.second_home(id),
  modality text NOT NULL CHECK (modality IN ('owner', 'co_owner')),
  location text NOT NULL CHECK (length(btrim(location)) BETWEEN 1 AND 255),
  configuration_id smallint REFERENCES app.second_home_configuration(id),
  operation_start_date date NOT NULL CHECK (operation_start_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  exercise_year integer GENERATED ALWAYS AS (extract(year FROM operation_start_date)::integer) STORED,
  initial_allocation_id uuid,
  basis_ref text NOT NULL CHECK (length(btrim(basis_ref)) BETWEEN 1 AND 255),
  formalized_at timestamptz NOT NULL,
  operation_id uuid NOT NULL UNIQUE REFERENCES app.operation(id),
  CONSTRAINT conflict_acquisition_second_home UNIQUE (second_home_id),
  CONSTRAINT conflict_acquisition_modality CHECK (
    (modality='owner' AND configuration_id IS NULL AND initial_allocation_id IS NULL)
    OR (modality='co_owner' AND configuration_id IS NOT NULL AND
      ((initial_allocation_id IS NULL) = (extract(month FROM operation_start_date)=1 AND extract(day FROM operation_start_date)=1)))
  ),
  CONSTRAINT conflict_acquisition_allocation FOREIGN KEY
    (initial_allocation_id, second_home_id, configuration_id, operation_start_date)
    REFERENCES app.second_home_initial_allocation(id, second_home_id, configuration_id, operation_start_date),
  UNIQUE (id, second_home_id),
  UNIQUE (id, second_home_id, operation_id),
  UNIQUE (id, second_home_id, operation_start_date)
);
CREATE TABLE app.spe (
  id uuid PRIMARY KEY,
  second_home_id uuid NOT NULL UNIQUE,
  acquisition_id uuid NOT NULL UNIQUE,
  party_id uuid NOT NULL UNIQUE,
  document_type text GENERATED ALWAYS AS ('cnpj'::text) STORED,
  legal_form text NOT NULL CHECK (legal_form='sa_fechada'),
  operation_id uuid NOT NULL,
  CONSTRAINT conflict_spe_acquisition FOREIGN KEY (acquisition_id, second_home_id, operation_id)
    REFERENCES app.acquisition(id, second_home_id, operation_id),
  CONSTRAINT spe_company_fk FOREIGN KEY (party_id, document_type) REFERENCES app.party(id, document_type),
  UNIQUE (id, second_home_id, acquisition_id)
);
CREATE TABLE app.stake (
  id uuid PRIMARY KEY,
  second_home_id uuid NOT NULL,
  acquisition_id uuid NOT NULL,
  spe_id uuid NOT NULL,
  -- Technical initial-allocation mapping, never the W9 draw or W11 rotation position.
  allocation_position smallint NOT NULL CHECK (allocation_position BETWEEN 1 AND 10),
  participation_bps smallint NOT NULL CHECK (participation_bps BETWEEN 1 AND 9999),
  operation_id uuid NOT NULL,
  CONSTRAINT conflict_stake_acquisition FOREIGN KEY (acquisition_id, second_home_id, operation_id)
    REFERENCES app.acquisition(id, second_home_id, operation_id),
  CONSTRAINT conflict_stake_spe FOREIGN KEY (spe_id, second_home_id, acquisition_id)
    REFERENCES app.spe(id, second_home_id, acquisition_id),
  CONSTRAINT conflict_stake_position UNIQUE (second_home_id, allocation_position),
  UNIQUE (id, second_home_id, acquisition_id),
  UNIQUE (id, second_home_id, acquisition_id, participation_bps)
);
CREATE TABLE app.holding (
  id uuid PRIMARY KEY,
  second_home_id uuid NOT NULL,
  acquisition_id uuid NOT NULL,
  party_id uuid NOT NULL REFERENCES app.party(id),
  role text NOT NULL CHECK (role IN ('owner', 'co_owner')),
  stake_id uuid,
  participation_bps smallint NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  operation_id uuid NOT NULL,
  CONSTRAINT conflict_holding_role CHECK (
    (role='owner' AND stake_id IS NULL AND participation_bps=10000)
    OR (role='co_owner' AND stake_id IS NOT NULL AND participation_bps BETWEEN 1 AND 9999)
  ),
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT conflict_holding_acquisition FOREIGN KEY (acquisition_id, second_home_id, operation_id)
    REFERENCES app.acquisition(id, second_home_id, operation_id),
  CONSTRAINT conflict_holding_stake FOREIGN KEY (stake_id, second_home_id, acquisition_id, participation_bps)
    REFERENCES app.stake(id, second_home_id, acquisition_id, participation_bps),
  CONSTRAINT conflict_holding_party_period EXCLUDE USING gist
    (second_home_id WITH =, party_id WITH =, tstzrange(valid_from, valid_until, '[)') WITH &&),
  CONSTRAINT conflict_holding_stake_period EXCLUDE USING gist
    (stake_id WITH =, tstzrange(valid_from, valid_until, '[)') WITH &&) WHERE (stake_id IS NOT NULL)
);
CREATE INDEX holding_party_idx ON app.holding(party_id, second_home_id);
CREATE INDEX holding_acquisition_idx ON app.holding(acquisition_id);
CREATE INDEX stake_acquisition_idx ON app.stake(acquisition_id);

-- TECH-026: append-only ledger; W8 implements initial grants only. Other movements/balance belong to W11.
CREATE TABLE app.use_right_ledger (
  id uuid PRIMARY KEY,
  second_home_id uuid NOT NULL,
  acquisition_id uuid NOT NULL,
  stake_id uuid NOT NULL,
  exercise_year integer NOT NULL CHECK (exercise_year BETWEEN 1 AND 9999),
  bucket text NOT NULL CHECK (bucket IN ('alta', 'media')),
  movement text NOT NULL CHECK (movement='grant'),
  source text NOT NULL CHECK (source IN ('configuration', 'initial_allocation')),
  initial_allocation_id uuid,
  quantity smallint NOT NULL CHECK (quantity >= 0),
  operation_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT conflict_use_right_initial_grant UNIQUE (stake_id, exercise_year, bucket, movement),
  CHECK ((source='initial_allocation') = (initial_allocation_id IS NOT NULL)),
  CONSTRAINT conflict_use_right_acquisition FOREIGN KEY (acquisition_id, second_home_id, operation_id)
    REFERENCES app.acquisition(id, second_home_id, operation_id),
  CONSTRAINT conflict_use_right_stake FOREIGN KEY (stake_id, second_home_id, acquisition_id)
    REFERENCES app.stake(id, second_home_id, acquisition_id),
  CONSTRAINT conflict_use_right_allocation FOREIGN KEY (initial_allocation_id, second_home_id)
    REFERENCES app.second_home_initial_allocation(id, second_home_id)
);
CREATE INDEX use_right_ledger_operation_idx ON app.use_right_ledger(operation_id);
CREATE INDEX use_right_ledger_acquisition_idx ON app.use_right_ledger(acquisition_id);

CREATE TABLE app.second_home_administration (
  id uuid PRIMARY KEY,
  second_home_id uuid NOT NULL REFERENCES app.second_home(id),
  provider_party_id uuid NOT NULL REFERENCES app.party(id),
  professional boolean NOT NULL CHECK (professional),
  scope text NOT NULL CHECK (scope IN ('professional_administration','full_luxtory_administration')),
  valid_from date NOT NULL,
  valid_until date,
  replaces_id uuid UNIQUE,
  basis_ref text NOT NULL CHECK (length(btrim(basis_ref)) BETWEEN 1 AND 255),
  operation_id uuid NOT NULL REFERENCES app.operation(id),
  created_at timestamptz NOT NULL,
  CONSTRAINT conflict_administration_civil_dates CHECK (
    valid_from BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'
    AND (valid_until IS NULL OR valid_until BETWEEN DATE '0001-01-01' AND DATE '9999-12-31')
  ),
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  CHECK (replaces_id IS NULL OR replaces_id <> id),
  UNIQUE (id, second_home_id),
  CONSTRAINT conflict_administration_replacement FOREIGN KEY (replaces_id, second_home_id)
    REFERENCES app.second_home_administration(id, second_home_id)
);
CREATE INDEX second_home_administration_home_idx ON app.second_home_administration(second_home_id, valid_from);

-- Only the fact of entry into operation; no generic lifecycle, closing, suspension or calendar activation.
CREATE TABLE app.second_home_operation_start (
  id uuid PRIMARY KEY,
  second_home_id uuid NOT NULL UNIQUE,
  acquisition_id uuid NOT NULL UNIQUE,
  effective_start_date date NOT NULL,
  operation_start_registered_at timestamptz NOT NULL,
  basis_ref text NOT NULL CHECK (length(btrim(basis_ref)) BETWEEN 1 AND 255),
  operation_id uuid NOT NULL UNIQUE REFERENCES app.operation(id),
  CONSTRAINT conflict_operation_start_base FOREIGN KEY (acquisition_id, second_home_id, effective_start_date)
    REFERENCES app.acquisition(id, second_home_id, operation_start_date)
);

-- Server-only inserts, immutable facts, explicit least-privilege RLS. Holder projections arrive with the invariants.
DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['second_home_initial_allocation','initial_allocation_grant','acquisition','spe',
      'stake','holding','use_right_ledger','second_home_administration','second_home_operation_start'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.forbid_change()', v_table || '_no_change', v_table);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change()', v_table || '_no_truncate', v_table);
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('CREATE POLICY %I ON app.%I FOR SELECT TO luxtory_app USING (true)', v_table || '_app_read', v_table);
    EXECUTE format('CREATE POLICY %I ON app.%I FOR INSERT TO luxtory_app WITH CHECK (true)', v_table || '_app_insert', v_table);
    EXECUTE format('GRANT SELECT, INSERT ON app.%I TO luxtory_app', v_table);
  END LOOP;
END $$;


-- migrate:down
-- Never discard an acquisition, allocation, administration or use-right fact on rollback.
DO $$
DECLARE v_table text; v_exists boolean;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['second_home_initial_allocation','initial_allocation_grant','acquisition','spe',
      'stake','holding','use_right_ledger','second_home_administration','second_home_operation_start'] LOOP
    EXECUTE format('LOCK TABLE app.%I IN ACCESS EXCLUSIVE MODE', v_table);
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY['second_home_initial_allocation','initial_allocation_grant','acquisition','spe',
      'stake','holding','use_right_ledger','second_home_administration','second_home_operation_start'] LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM app.%I)', v_table) INTO v_exists;
    IF v_exists THEN RAISE EXCEPTION 'W8 rollback would discard facts in app.%', v_table; END IF;
  END LOOP;
END $$;
DROP TABLE app.second_home_operation_start;
DROP TABLE app.second_home_administration;
DROP TABLE app.use_right_ledger;
DROP TABLE app.holding;
DROP TABLE app.stake;
DROP TABLE app.spe;
DROP TABLE app.acquisition;
DROP TABLE app.initial_allocation_grant;
DROP TABLE app.second_home_initial_allocation;
