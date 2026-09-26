-- migrate:up
CREATE SCHEMA leaky;
CREATE TABLE leaky.item (id bigint PRIMARY KEY);

-- migrate:down
DROP TABLE leaky.item;
