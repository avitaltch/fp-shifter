#!/bin/sh
set -eu

: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${SHIFTSYNC_RUNTIME_PASSWORD:?SHIFTSYNC_RUNTIME_PASSWORD is required}"

export PGPASSWORD="$POSTGRES_PASSWORD"

psql \
  --host=postgres \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 \
  --set=database_name="$POSTGRES_DB" \
  --set=runtime_password="$SHIFTSYNC_RUNTIME_PASSWORD" <<'SQL'
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'shiftsync_runtime') then
    create role shiftsync_runtime;
  end if;
end
$$;

alter role shiftsync_runtime with
  login
  password :'runtime_password'
  nosuperuser
  nocreatedb
  nocreaterole
  noinherit
  noreplication;

revoke all on database :"database_name" from public;
grant connect on database :"database_name" to shiftsync_runtime;
revoke create on schema public from public;
grant usage on schema public to shiftsync_runtime;
grant select, insert, update, delete on all tables in schema public to shiftsync_runtime;
grant usage, select on all sequences in schema public to shiftsync_runtime;

alter default privileges for role shiftsync in schema public
  grant select, insert, update, delete on tables to shiftsync_runtime;
alter default privileges for role shiftsync in schema public
  grant usage, select on sequences to shiftsync_runtime;
SQL
