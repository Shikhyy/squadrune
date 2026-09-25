"""
test_auth.py — Tests for the User Authentication Module (BEFORE state)
"""
import pytest
from auth import AppError, hash_password, verify_password, create_token


def test_hash_password_returns_string():
    result = hash_password("mysecret")
    assert isinstance(result, str)
    assert result != "mysecret"


def test_verify_password_correct():
    hashed = hash_password("correcthorse")
    assert verify_password("correcthorse", hashed) is True


def test_verify_password_wrong():
    hashed = hash_password("correcthorse")
    assert verify_password("wrong", hashed) is False


def test_create_token_returns_string():
    token = create_token("user123", "my-secret")
    assert isinstance(token, str)
    assert len(token) > 0


def test_app_error_has_code():
    err = AppError(code="AUTH_000", message="test error")
    assert err.code == "AUTH_000"
    assert "AUTH_000" in str(err)
