import asyncio
import pytest


@pytest.fixture(scope="function")
def event_loop():
    """Create a fresh event loop per test to avoid Motor executor cache issues."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()
