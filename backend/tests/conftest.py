import pytest

from backend.db import init_db
from backend.rate_limit import rate_limiter


@pytest.fixture(scope="session", autouse=True)
def _initialize_database():
    init_db()


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    rate_limiter.reset()
    yield
    rate_limiter.reset()