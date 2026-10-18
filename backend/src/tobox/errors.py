"""Domain errors. Raised by `ops` and mapped to HTTP statuses (REST) or tool errors (MCP)."""

from sqlalchemy.orm import Session

from tobox.db import Base


class DomainError(Exception):
    status_code = 400

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class NotFoundError(DomainError):
    status_code = 404


class ConflictError(DomainError):
    status_code = 409


class InvalidError(DomainError):
    status_code = 422


def get_or_404[T: Base](session: Session, model: type[T], ident: object) -> T:
    obj = session.get(model, ident)
    if obj is None:
        raise NotFoundError(f"{model.__name__} {ident} not found")
    return obj
