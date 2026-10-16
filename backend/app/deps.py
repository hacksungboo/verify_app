from fastapi import Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .security import decode_token


def current_user(
    authorization: str | None = Header(default=None),
    token: str | None = Query(default=None, description="SSE(EventSource)는 헤더를 못 보내므로 쿼리로 받는다"),
    db: Session = Depends(get_db),
) -> User:
    raw = token
    if authorization and authorization.lower().startswith("bearer "):
        raw = authorization[7:]
    user_id = decode_token(raw) if raw else None
    user = db.get(User, user_id) if user_id else None
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요해요")
    return user
