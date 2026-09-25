-- migrate:up
CREATE TABLE fixture.job_run (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job text NOT NULL,
  active boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX job_run_one_active ON fixture.job_run (job) WHERE active;

-- migrate:down
DROP TABLE fixture.job_run;
