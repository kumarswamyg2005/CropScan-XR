import pytest

from app.config import Settings


@pytest.mark.parametrize("given", [
    "postgres://u:p@host:5432/db",
    "postgresql://u:p@host:5432/db",
    "postgresql+psycopg://u:p@host:5432/db",
])
def test_hosted_database_urls_use_psycopg3(given):
    """Render gives postgres:// URLs; only the psycopg 3 driver is installed."""
    assert Settings(database_url=given).database_url == "postgresql+psycopg://u:p@host:5432/db"


def test_sqlite_url_is_left_alone():
    assert Settings(database_url="sqlite://").database_url == "sqlite://"
