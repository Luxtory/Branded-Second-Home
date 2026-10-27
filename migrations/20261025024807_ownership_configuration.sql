-- migrate:up
-- W8: immutable domain catalogue, exactly BR-076/077 and TECH-026. No operational defaults or CRUD.
CREATE TABLE app.second_home_configuration (
  id smallint PRIMARY KEY,
  participation_bps smallint NOT NULL,
  annual_days smallint NOT NULL,
  alta smallint NOT NULL,
  media smallint NOT NULL,
  luxtory_alta smallint NOT NULL,
  luxtory_media smallint NOT NULL,
  CONSTRAINT second_home_configuration_canonical CHECK (
    (id, participation_bps, annual_days, alta, media, luxtory_alta, luxtory_media) IN (
      (10, 1000, 35, 10, 25, 3, 12),
      (8, 1250, 44, 12, 32, 7, 6),
      (4, 2500, 88, 24, 64, 7, 6),
      (2, 5000, 176, 48, 128, 7, 6)
    )
  )
);
INSERT INTO app.second_home_configuration VALUES
  (10, 1000, 35, 10, 25, 3, 12),
  (8, 1250, 44, 12, 32, 7, 6),
  (4, 2500, 88, 24, 64, 7, 6),
  (2, 5000, 176, 48, 128, 7, 6);
CREATE TRIGGER second_home_configuration_no_change BEFORE INSERT OR UPDATE OR DELETE
  ON app.second_home_configuration FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER second_home_configuration_no_truncate BEFORE TRUNCATE
  ON app.second_home_configuration FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();
ALTER TABLE app.second_home_configuration ENABLE ROW LEVEL SECURITY;
CREATE POLICY second_home_configuration_app_read ON app.second_home_configuration
  FOR SELECT TO luxtory_app USING (true);
GRANT SELECT ON app.second_home_configuration TO luxtory_app;


-- migrate:down
-- Referencing W8 facts must be rolled back first; their down migrations refuse to discard real facts.
DROP TABLE app.second_home_configuration;
