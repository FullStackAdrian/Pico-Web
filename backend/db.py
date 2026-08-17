import os
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./pico_web.db")
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def _ensure_device_columns():
    inspector = inspect(engine)
    if 'devices' not in inspector.get_table_names():
        return
    existing = {column['name'] for column in inspector.get_columns('devices')}
    additions = {
        'group_name': 'VARCHAR(80)',
        'tags': 'JSON',
        'last_seen': 'TIMESTAMP',
        'firmware': 'VARCHAR(64)',
        'metrics': 'JSON',
    }
    with engine.begin() as connection:
        for name, sql_type in additions.items():
            if name not in existing:
                connection.execute(text(f'ALTER TABLE devices ADD COLUMN {name} {sql_type}'))

def _ensure_execution_columns():
    inspector = inspect(engine)
    if 'executions' not in inspector.get_table_names():
        return
    existing = {column['name'] for column in inspector.get_columns('executions')}
    additions = {
        'job_id': 'VARCHAR(64)',
        'script_version': 'INTEGER',
    }
    with engine.begin() as connection:
        for name, sql_type in additions.items():
            if name not in existing:
                connection.execute(text(f'ALTER TABLE executions ADD COLUMN {name} {sql_type}'))

def _ensure_script_columns():
    inspector = inspect(engine)
    if 'scripts' not in inspector.get_table_names():
        return
    existing = {column['name'] for column in inspector.get_columns('scripts')}
    if 'current_version' not in existing:
        with engine.begin() as connection:
            connection.execute(text('ALTER TABLE scripts ADD COLUMN current_version INTEGER DEFAULT 1'))

def _ensure_job_columns():
    inspector = inspect(engine)
    if 'jobs' not in inspector.get_table_names():
        return
    existing = {column['name'] for column in inspector.get_columns('jobs')}
    if 'script_version' not in existing:
        with engine.begin() as connection:
            connection.execute(text('ALTER TABLE jobs ADD COLUMN script_version INTEGER'))

def init_db():
    from backend.models import Base as ModelBase
    ModelBase.metadata.create_all(bind=engine)
    _ensure_device_columns()
    _ensure_execution_columns()
    _ensure_script_columns()
    _ensure_job_columns()
    from backend.rbac import seed_rbac
    seed_rbac()
