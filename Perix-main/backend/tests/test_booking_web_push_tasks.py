"""Booking push scheduling regressions: no database, network or real pushes."""
import asyncio
import inspect
from unittest.mock import AsyncMock

import pytest
from routes import push_web


@pytest.mark.asyncio
@pytest.mark.parametrize('client,owner,recipients',[
    (None,None,[]),('client',None,['client']),
    (None,'owner',['owner']),('client','owner',['owner','client']),
])
async def test_booking_notifications_schedule_coroutines_without_blocking(monkeypatch,client,owner,recipients):
    sender=AsyncMock()
    monkeypatch.setattr(push_web,'notify_web_push',sender)
    scheduled=[]
    original=asyncio.create_task
    def capture(coroutine):
        assert inspect.iscoroutine(coroutine)
        task=original(coroutine)
        scheduled.append(task)
        return task
    monkeypatch.setattr(push_web.asyncio,'create_task',capture)
    await push_web.notify_booking_web_push(client_id=client,owner_user_id=owner,
        service_name='Test room',client_name='Test guest')
    assert len(scheduled)==len(recipients)
    assert sender.await_count==0  # Booking caller is not held by delivery I/O.
    if scheduled:await asyncio.gather(*scheduled)
    assert [call.args[0] for call in sender.await_args_list]==recipients
    assert all(call.kwargs['data']=={'type':'booking'} for call in sender.await_args_list)
