from fastapi import APIRouter

from .endpoints import admin, health, property, rates

v1_router = APIRouter(prefix="/v1")
v1_router.include_router(property.router, prefix="/property", tags=["Property Analysis"])
v1_router.include_router(rates.router, prefix="/rates", tags=["Rate Store"])
v1_router.include_router(health.router, prefix="/health", tags=["Health"])
v1_router.include_router(admin.router, prefix="/admin", tags=["Admin"])
