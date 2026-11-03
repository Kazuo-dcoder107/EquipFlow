import pytest

from app.services import sessions


@pytest.fixture(autouse=True)
def _fresh_sessions():
    sessions.clear_all()
    yield
    sessions.clear_all()
