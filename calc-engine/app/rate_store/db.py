import os
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

# Ensure the data directory exists
Path(settings.db_path).parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    f"sqlite:///{settings.db_path}",
    connect_args={"check_same_thread": False},
    echo=(settings.environment == "development"),
)


def create_db_and_tables() -> None:
    """Create all tables if they don't exist. Safe to call on every startup."""
    SQLModel.metadata.create_all(engine)


def get_session():
    """FastAPI dependency — yields a DB session."""
    with Session(engine) as session:
        yield session
