"""Coalescing rebuild requests for the single mobility precompute worker.

This object is deliberately pure/synchronous. asyncio.Event + locking live
in mobility_workers; keeping request coalescing here makes the semantics
easy to unit test.
"""
from dataclasses import dataclass, field
from typing import Iterable, Optional


@dataclass
class RebuildRequest:
    all_patterns: bool
    pattern_ids: Optional[set[str]]
    reasons: list[str]


@dataclass
class RebuildRequestQueue:
    _all_patterns: bool = False
    _pattern_ids: set[str] = field(default_factory=set)
    _reasons: set[str] = field(default_factory=set)

    def request(
        self,
        pattern_ids: Optional[Iterable[str]] = None,
        *,
        reason: str = "UNSPECIFIED",
    ) -> None:
        clean_reason = str(reason or "UNSPECIFIED")
        self._reasons.add(clean_reason)
        if pattern_ids is None:
            self._all_patterns = True
            self._pattern_ids.clear()
            return
        if self._all_patterns:
            return
        for pattern_id in pattern_ids:
            value = str(pattern_id or "").strip()
            if value:
                self._pattern_ids.add(value)

    def pending(self) -> bool:
        return self._all_patterns or bool(self._pattern_ids) or bool(self._reasons)

    def drain(self) -> RebuildRequest:
        request = RebuildRequest(
            all_patterns=self._all_patterns,
            pattern_ids=None if self._all_patterns else set(self._pattern_ids),
            reasons=sorted(self._reasons),
        )
        self._all_patterns = False
        self._pattern_ids.clear()
        self._reasons.clear()
        return request
