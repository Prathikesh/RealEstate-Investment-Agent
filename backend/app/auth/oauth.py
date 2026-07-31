"""
Google OAuth client (authlib). Registered with empty credentials in demo
mode — /google/login rejects with 503 until GOOGLE_CLIENT_ID/SECRET are set,
matching the rest of the app's "empty config = feature disabled" convention.
"""
from authlib.integrations.starlette_client import OAuth

from app.config import settings

oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)
