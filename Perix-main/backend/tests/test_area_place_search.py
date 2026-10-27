"""Public area search only: no DB/provider calls, private reverse stays private."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import FastAPI

from routes import places


@pytest.fixture
def search(monkeypatch):
    places._autocomplete_cache.clear()
    monkeypatch.setattr(places, "_last_nominatim_request", 0)
    monkeypatch.setattr(places, "_nominatim_lock", asyncio.Lock())
    response = SimpleNamespace(status_code=200, raise_for_status=lambda: None,
                               json=lambda: [{"place_id": 1, "display_name": "Domplatz, Magdeburg, Germany",
                                              "lat": "52.124", "lon": "11.631", "address": {"road": "Domplatz"}}])
    get = AsyncMock(return_value=response)

    class Client:
        async def __aenter__(self):
            return SimpleNamespace(get=get)

        async def __aexit__(self, *args):
            return False

    monkeypatch.setattr(places, "httpx", SimpleNamespace(AsyncClient=lambda **kwargs: Client()))
    app = FastAPI()
    app.include_router(places.router)
    return app, get


@pytest.mark.asyncio
async def test_guest_can_select_area_without_location_or_login(search):
    app, get = search
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://test") as client:
        result = await client.get("/places/autocomplete", params={"input": "Domplatz", "lang": "en"})
    assert result.status_code == 200
    assert result.json()["predictions"][0] == {
        "place_id": 1, "description": "Domplatz, Magdeburg, Germany", "lat": 52.124,
        "lon": 11.631, "lng": 11.631, "public_location_label": "Domplatz",
    }
    assert get.await_count == 1


@pytest.mark.asyncio
async def test_repeated_queries_use_bounded_public_cache_without_provider_calls(search):
    app, get = search
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://test") as client:
        first = await client.get("/places/autocomplete", params={"input": " Domplatz ", "lang": "en"})
        second = await client.get("/places/autocomplete", params={"input": "domplatz", "lang": "en"})
    assert first.json() == second.json()
    assert get.await_count == 1
    assert len(places._autocomplete_cache) == 1


@pytest.mark.asyncio
async def test_bounds_and_query_length_are_validated_before_provider_calls(search):
    app, get = search
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://test") as client:
        for query in ({"input": "x" * 201}, {"input": "Berlin", "near_lat": 91},
                      {"input": "Berlin", "near_lng": -181}):
            assert (await client.get("/places/autocomplete", params=query)).status_code == 422
    assert get.await_count == 0


@pytest.mark.asyncio
async def test_reverse_geocoding_does_not_become_public(search):
    app, get = search
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://test") as client:
        result = await client.get("/places/reverse?lat=52&lng=11")
    assert result.status_code == 401
    assert get.await_count == 0
