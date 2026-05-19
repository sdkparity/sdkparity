from __future__ import annotations

from typing import Any


class User:
    def __init__(self, id: str, email: str) -> None:
        self.id = id
        self.email = email


class Client:
    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    def list_users(self, limit: int | None = None) -> list[User]:
        return []

    def get_user(self, user_id: str) -> User:
        return User(id=user_id, email="person@example.com")

    def _token(self) -> str:
        return self.api_key


def create_options(**data: Any) -> dict[str, Any]:
    return data
