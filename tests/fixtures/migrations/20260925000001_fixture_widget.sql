-- migrate:up
CREATE SCHEMA fixture;
CREATE TABLE fixture.widget (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL
);

-- migrate:down
DROP TABLE fixture.widget;
DROP SCHEMA fixture;
