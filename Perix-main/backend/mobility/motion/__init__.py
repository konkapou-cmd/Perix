"""Perix bus/tram motion engine."""

MOTION_SCHEMA_VERSION = 1


def clear_motion_cache() -> None:
    from mobility.motion.engine import clear_motion_cache as _clear

    _clear()


async def position_for_trip(**kwargs):
    from mobility.motion.engine import position_for_trip as _position

    return await _position(**kwargs)


__all__ = [
    "MOTION_SCHEMA_VERSION",
    "clear_motion_cache",
    "position_for_trip",
]
