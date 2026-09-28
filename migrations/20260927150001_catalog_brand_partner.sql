-- migrate:up
-- Brand Partner (`03` §3.1, BR-010…016, BR-021; `docs/specs/catalog.md`, ADR-0010). Sem dado pessoal. Criada pelo
-- command `register_brand_partner`; a autorização de exposição (BR-015) e o encerramento (BR-021) passam de vazios a
-- preenchidos uma única vez cada e nunca são apagados (histórico). O resto é imutável.
CREATE TABLE app.brand_partner (
  id uuid PRIMARY KEY,
  brand_name text NOT NULL CHECK (length(brand_name) BETWEEN 1 AND 200),
  exposure_authorization_ref text CHECK (length(exposure_authorization_ref) BETWEEN 1 AND 255),
  exposure_authorized_at timestamptz,
  terminated_effective_at timestamptz,
  termination_basis text CHECK (length(termination_basis) BETWEEN 1 AND 255),
  termination_registered_at timestamptz,
  operation_id uuid NOT NULL UNIQUE REFERENCES app.operation (id),
  created_at timestamptz NOT NULL,
  CONSTRAINT brand_partner_exposure_check
    CHECK ((exposure_authorization_ref IS NULL) = (exposure_authorized_at IS NULL)),
  CONSTRAINT brand_partner_termination_check CHECK (
    (terminated_effective_at IS NULL) = (termination_basis IS NULL)
    AND (termination_basis IS NULL) = (termination_registered_at IS NULL)
  )
);

-- Só duas mudanças existem: registrar a exposição e registrar o encerramento, cada uma uma vez.
CREATE FUNCTION app.brand_partner_transition() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'exposure_authorization_ref' - 'exposure_authorized_at'
                    - 'terminated_effective_at' - 'termination_basis' - 'termination_registered_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'exposure_authorization_ref' - 'exposure_authorized_at'
                    - 'terminated_effective_at' - 'termination_basis' - 'termination_registered_at')
     OR (OLD.exposure_authorized_at IS NOT NULL
         AND (NEW.exposure_authorization_ref, NEW.exposure_authorized_at)
             IS DISTINCT FROM (OLD.exposure_authorization_ref, OLD.exposure_authorized_at))
     OR (OLD.termination_registered_at IS NOT NULL
         AND (NEW.terminated_effective_at, NEW.termination_basis, NEW.termination_registered_at)
             IS DISTINCT FROM (OLD.terminated_effective_at, OLD.termination_basis, OLD.termination_registered_at))
  THEN
    RAISE EXCEPTION 'app.brand_partner: only a single exposure authorization and a single termination can change a row'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER brand_partner_transition BEFORE UPDATE ON app.brand_partner
  FOR EACH ROW EXECUTE FUNCTION app.brand_partner_transition();
CREATE TRIGGER brand_partner_no_delete BEFORE DELETE ON app.brand_partner
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER brand_partner_no_truncate BEFORE TRUNCATE ON app.brand_partner
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- Só o papel de aplicação lê e escreve (ADR-0010 §7); `anon`/`authenticated` não têm política nem grant. O UPDATE de
-- coluna também habilita a trava da linha (`FOR SHARE`/`FOR NO KEY UPDATE`) que serializa o catálogo (ADR-0010 §8).
ALTER TABLE app.brand_partner ENABLE ROW LEVEL SECURITY;
CREATE POLICY brand_partner_app_read ON app.brand_partner FOR SELECT TO luxtory_app USING (true);
CREATE POLICY brand_partner_app_insert ON app.brand_partner FOR INSERT TO luxtory_app WITH CHECK (true);
CREATE POLICY brand_partner_app_update ON app.brand_partner FOR UPDATE TO luxtory_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON app.brand_partner TO luxtory_app;
GRANT UPDATE (exposure_authorization_ref, exposure_authorized_at, terminated_effective_at, termination_basis,
              termination_registered_at) ON app.brand_partner TO luxtory_app;

-- migrate:down
REVOKE ALL ON app.brand_partner FROM luxtory_app;
DROP TABLE app.brand_partner;
DROP FUNCTION app.brand_partner_transition();
