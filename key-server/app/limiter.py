"""
Rate limiter singleton for Whispro Key Server.
Uses slowapi (backed by in-memory storage for single-instance dev;
swap the storage backend for Redis in multi-server prod).
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

# Key function: rate-limit by real client IP
limiter = Limiter(key_func=get_remote_address)
