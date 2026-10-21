-- migrate:up
-- Contato do interesse (W6; `03` v3.15 §3.1 `interest_contact`; spec ownership §14.7; ADR-0018): nome, telefone e
-- e-mail obrigatórios, separados de `app.interest`, que continua imutável. Relação 1:1 pela chave primária; nenhuma FK
-- para party, holding, membership, Brand Partner ou parceiro — o contato não cria Titular, conta, vínculo nem direito.
-- Textos chegam normalizados pela aplicação; os limites são técnicos (TECH-100). Sem UPDATE; DELETE estruturalmente
-- possível (sem gatilho e sem referência), mas não concedido ao papel de aplicação: a W6 não tem caminho de eliminação
-- (D-W6-2 = A). Eliminar o contato não altera o interesse nem a chave de idempotência.
CREATE TABLE app.interest_contact (
  interest_id uuid PRIMARY KEY REFERENCES app.interest (id),
  name text NOT NULL
    CONSTRAINT interest_contact_name_check
    CHECK (length(name) BETWEEN 1 AND 200 AND name = btrim(name) AND name !~ '[[:cntrl:]]'),
  -- `+` inicial opcional e 8 a 15 dígitos (limite técnico do E.164); o código do país nunca é inferido.
  phone text NOT NULL CONSTRAINT interest_contact_phone_check CHECK (phone ~ '^\+?[0-9]{8,15}$'),
  email text NOT NULL
    CONSTRAINT interest_contact_email_check
    CHECK (length(email) BETWEEN 3 AND 254
           AND email ~ '^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:]]+\.[^@[:space:][:cntrl:]]+$'),
  created_at timestamptz NOT NULL
);

CREATE TRIGGER interest_contact_no_update BEFORE UPDATE ON app.interest_contact
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER interest_contact_no_truncate BEFORE TRUNCATE ON app.interest_contact
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- RLS ligada, política só para o papel de aplicação (ADR-0010 §7): `anon` e `authenticated` não leem nem gravam.
ALTER TABLE app.interest_contact ENABLE ROW LEVEL SECURITY;
CREATE POLICY interest_contact_app_read ON app.interest_contact FOR SELECT TO luxtory_app USING (true);
CREATE POLICY interest_contact_app_insert ON app.interest_contact FOR INSERT TO luxtory_app WITH CHECK (true);
GRANT SELECT, INSERT ON app.interest_contact TO luxtory_app;

-- migrate:down
-- Fail-closed: apagar a tabela eliminaria contatos sem o procedimento operacional de eliminação (spec ownership §14.12).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.interest_contact) THEN
    RAISE EXCEPTION 'W6 rollback precondition: interest_contact has rows; contacts are only removed by the operational procedure'
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;
REVOKE ALL ON app.interest_contact FROM luxtory_app;
DROP TABLE app.interest_contact;
