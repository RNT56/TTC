"""Stable fault taxonomy and retry policy for D38 worker attempts."""

from __future__ import annotations

import math

MIN_RETRY_DELAY_SECONDS = 1.0
MAX_RETRY_DELAY_SECONDS = 15 * 60.0


class RetryableJobError(RuntimeError):
    """A bounded transient failure that may be attempted again under a new lease."""

    def __init__(self, code: str, message: str, *, retry_after_seconds: float | None = None) -> None:
        super().__init__(message)
        alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
        allowed = f"{alphabet}-"
        if (
            not code
            or len(code) > 80
            or code[0] not in alphabet
            or any(ch not in allowed for ch in code)
        ):
            raise ValueError("retryable job error code is invalid")
        self.code = code
        self.retry_after_seconds = retry_after_seconds


class JobTimeoutError(RetryableJobError):
    def __init__(self, message: str = "worker execution timed out") -> None:
        super().__init__("worker-timeout", message)


class ProviderRateLimitError(RetryableJobError):
    def __init__(self, retry_after_seconds: float, message: str = "provider rate limit reached") -> None:
        super().__init__("provider-rate-limited", message, retry_after_seconds=retry_after_seconds)


class ProviderUnavailableError(RetryableJobError):
    def __init__(self, message: str = "provider is unavailable") -> None:
        super().__init__("provider-unavailable", message)


class PartialObjectUploadError(RetryableJobError):
    def __init__(self, message: str = "object upload is incomplete") -> None:
        super().__init__("partial-object-upload", message)


def retry_delay_seconds(attempt: int, hinted_seconds: float | None = None) -> float:
    """Deterministic exponential retry delay with a bounded provider hint."""

    exponent = max(0, min(int(attempt) - 1, 8))
    delay = min(5.0 * (2**exponent), MAX_RETRY_DELAY_SECONDS)
    if hinted_seconds is not None:
        try:
            hint = float(hinted_seconds)
        except (TypeError, ValueError):
            hint = MIN_RETRY_DELAY_SECONDS
        if math.isfinite(hint):
            delay = max(delay, hint)
    return max(MIN_RETRY_DELAY_SECONDS, min(delay, MAX_RETRY_DELAY_SECONDS))
