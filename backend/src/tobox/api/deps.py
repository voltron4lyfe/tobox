from typing import Annotated

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from tobox.db import Base, get_session

SessionDep = Annotated[Session, Depends(get_session)]


def get_or_404[T: Base](session: Session, model: type[T], ident: object) -> T:
    obj = session.get(model, ident)
    if obj is None:
        raise HTTPException(404, f"{model.__name__} {ident} not found")
    return obj
