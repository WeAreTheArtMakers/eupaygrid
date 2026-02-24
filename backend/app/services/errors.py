from __future__ import annotations


class DomainError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message

    def to_detail(self) -> dict[str, str]:
        return {"error": self.code, "message": self.message}
