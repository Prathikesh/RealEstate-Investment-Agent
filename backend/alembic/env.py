import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make `app` importable from the backend/ directory
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.config import settings  # noqa: E402
from app.database import Base  # noqa: E402
import app.models  # noqa: E402, F401 — registers all models with Base.metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Alembic uses a sync psycopg2 URL (strips +asyncpg if present)
sync_url = settings.database_url.replace("+asyncpg", "")
config.set_main_option("sqlalchemy.url", sync_url)

target_metadata = Base.metadata

# PostGIS creates these tables — never let Alembic touch them
POSTGIS_TABLES = {"spatial_ref_sys", "topology", "layer", "raster_columns", "raster_overviews"}
POSTGIS_SCHEMAS = {"topology"}


def include_object(object, name, type_, reflected, compare_to):
    """Filter out PostGIS system tables and schemas from Alembic migrations."""
    if type_ == "table":
        if name in POSTGIS_TABLES:
            return False
        if hasattr(object, "schema") and object.schema in POSTGIS_SCHEMAS:
            return False
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=sync_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
