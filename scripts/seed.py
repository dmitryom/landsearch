#!/usr/bin/env python3
"""Seed demo data for LandSearch — idempotent, safe to re-run."""

import asyncio
import logging
import uuid
import random

from shapely.geometry import shape, box
from shapely.ops import unary_union
from geoalchemy2.shape import from_shape, to_shape
from sqlalchemy import select, delete, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

import sys
import pathlib
sys.path.insert(0, str(pathlib.Path(sys.path[0]).parent if __name__ == "__main__" else "."))

from app.core.security import hash_password
from app.models import Tenant, User, UserRole, Settlement, Plot, PlotStatus

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("seed")

DATABASE_URL = "postgresql+asyncpg://landsearch:FMmEHcWlw1cY2kTxeWuZ@localhost:5432/landsearch"

engine = create_async_engine(DATABASE_URL, echo=False)
session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

SETTLEMENTS = [
    {
        "name": "Коттеджный посёлок Серебряный Ключ",
        "region": "Московская область",
        "district": "Раменский",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[38.12, 55.57], [38.16, 55.57], [38.16, 55.60], [38.12, 55.60], [38.12, 55.57]]],
        },
        "plots": [
            {"cn": "50:23:0010201:1", "area": 1200, "price": 4800000, "status": "free", "address": "МО, Раменский р-н, КП Серебряный Ключ, ул. Центральная, 1", "use": "ИЖС"},
            {"cn": "50:23:0010201:2", "area": 1500, "price": 6000000, "status": "free", "address": "МО, Раменский р-н, КП Серебряный Ключ, ул. Центральная, 2", "use": "ИЖС"},
            {"cn": "50:23:0010201:3", "area": 800, "price": 3600000, "status": "reserved", "address": "МО, Раменский р-н, КП Серебряный Ключ, ул. Лесная, 1", "use": "ИЖС"},
            {"cn": "50:23:0010201:4", "area": 2000, "price": 8500000, "status": "free", "address": "МО, Раменский р-н, КП Серебряный Ключ, ул. Полевая, 1", "use": "ЛПХ"},
            {"cn": "50:23:0010201:5", "area": 1000, "price": 4200000, "status": "booked", "address": "МО, Раменский р-н, КП Серебряный Ключ, ул. Садовая, 1", "use": "ИЖС"},
            {"cn": "50:23:0010201:6", "area": 3000, "price": 15000000, "status": "free", "address": "МО, Раменский р-н, КП Серебряный Ключ, ул. Озёрная, 1", "use": "ИЖС"},
            {"cn": "50:23:0010201:7", "area": 2000, "price": 4000000, "status": "sold", "address": "МО, Раменский р-н, КП Серебряный Ключ, ул. Озёрная, 2", "use": "ИЖС"},
            {"cn": "50:23:0010201:8", "area": 1000, "price": 4500000, "status": "free", "address": "МО, Раменский р-н, КП Серебряный Ключ, ул. Речная, 1", "use": "ИЖС"},
        ],
    },
    {
        "name": "СНТ Заря",
        "region": "Московская область",
        "district": "Раменский",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[38.22, 55.54], [38.26, 55.54], [38.26, 55.57], [38.22, 55.57], [38.22, 55.54]]],
        },
        "plots": [
            {"cn": "50:23:0010202:1", "area": 600, "price": 1800000, "status": "free", "address": "МО, Раменский р-н, СНТ Заря, уч. 1", "use": "СНТ"},
            {"cn": "50:23:0010202:2", "area": 800, "price": 2400000, "status": "free", "address": "МО, Раменский р-н, СНТ Заря, уч. 2", "use": "СНТ"},
            {"cn": "50:23:0010202:3", "area": 500, "price": 1500000, "status": "sold", "address": "МО, Раменский р-н, СНТ Заря, уч. 3", "use": "СНТ"},
            {"cn": "50:23:0010202:4", "area": 1000, "price": 3500000, "status": "free", "address": "МО, Раменский р-н, СНТ Заря, уч. 4", "use": "СНТ"},
            {"cn": "50:23:0010202:5", "area": 700, "price": 2100000, "status": "reserved", "address": "МО, Раменский р-н, СНТ Заря, уч. 5", "use": "СНТ"},
            {"cn": "50:23:0010202:6", "area": 900, "price": 2700000, "status": "free", "address": "МО, Раменский р-н, СНТ Заря, уч. 6", "use": "СНТ"},
        ],
    },
    {
        "name": "Посёлок Озёрный",
        "region": "Московская область",
        "district": "Раменский",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[38.10, 55.52], [38.14, 55.52], [38.14, 55.55], [38.10, 55.55], [38.10, 55.52]]],
        },
        "plots": [
            {"cn": "50:23:0010203:1", "area": 1500, "price": 6000000, "status": "free", "address": "МО, Раменский р-н, ПО Озёрный, ул. Берёзовая, 1", "use": "ИЖС"},
            {"cn": "50:23:0010203:2", "area": 1200, "price": 5400000, "status": "free", "address": "МО, Раменский р-н, ПО Озёрный, ул. Берёзовая, 2", "use": "ИЖС"},
            {"cn": "50:23:0010203:3", "area": 1800, "price": 7200000, "status": "reserved", "address": "МО, Раменский р-н, ПО Озёрный, ул. Сосновая, 1", "use": "ИЖС"},
            {"cn": "50:23:0010203:4", "area": 2500, "price": 10000000, "status": "free", "address": "МО, Раменский р-н, ПО Озёрный, ул. Сосновая, 2", "use": "ЛПХ"},
            {"cn": "50:23:0010203:5", "area": 1000, "price": 4000000, "status": "booked", "address": "МО, Раменский р-н, ПО Озёрный, ул. Кленовая, 1", "use": "ИЖС"},
        ],
    },
]


def generate_plot_geometry(settlement_geom, index, total):
    """Generate a small rectangular polygon for a plot within the settlement boundary."""
    bounds = settlement_geom.bounds
    min_lng, min_lat, max_lng, max_lat = bounds

    width = (max_lng - min_lng) * 0.18
    height = (max_lat - min_lat) * 0.18

    cols = max(1, int((max_lng - min_lng) / (width * 1.3)))
    row = index // cols
    col = index % cols

    center_lng = min_lng + width * 0.5 + col * (width * 1.3)
    center_lat = max_lat - height * 0.5 - row * (height * 1.3)

    center_lng += random.uniform(-width * 0.1, width * 0.1)
    center_lat += random.uniform(-height * 0.1, height * 0.1)

    half_w = width * 0.4
    half_h = height * 0.4

    return box(center_lng - half_w, center_lat - half_h, center_lng + half_w, center_lat + half_h)


async def seed():
    random.seed(42)

    async with session_factory() as session:
        tenant = await session.execute(select(Tenant).where(Tenant.slug == "demo-tenant"))
        tenant = tenant.scalar_one_or_none()

        if not tenant:
            tenant = Tenant(
                name="Демо-застройщик",
                slug="demo-tenant",
                config={"demo": True},
            )
            session.add(tenant)
            await session.flush()
            log.info("Created demo tenant")

            admin = User(
                tenant_id=tenant.id,
                email="admin@demo.landsearch",
                password_hash=hash_password("demo123456"),
                full_name="Админ Демо",
                role=UserRole.admin,
            )
            session.add(admin)
            log.info("Created demo admin user (admin@demo.landsearch / demo123456)")

        for s_data in SETTLEMENTS:
            existing = await session.execute(
                select(Settlement).where(Settlement.tenant_id == tenant.id, Settlement.name == s_data["name"])
            )
            settlement = existing.scalar_one_or_none()

            if not settlement:
                geom = from_shape(shape(s_data["geometry"]), srid=4326)
                settlement = Settlement(
                    tenant_id=tenant.id,
                    name=s_data["name"],
                    region=s_data["region"],
                    district=s_data["district"],
                    geometry=geom,
                )
                session.add(settlement)
                await session.flush()
                log.info("Created settlement: %s", s_data["name"])
            else:
                await session.refresh(settlement)

            settlement_shp = shape(s_data["geometry"])
            total_plots = len(s_data["plots"])

            for i, p_data in enumerate(s_data["plots"]):
                existing_plot = await session.execute(
                    select(Plot).where(Plot.tenant_id == tenant.id, Plot.cadastral_number == p_data["cn"])
                )
                plot = existing_plot.scalar_one_or_none()

                if plot:
                    if not plot.geometry:
                        plot_geom = generate_plot_geometry(settlement_shp, i, total_plots)
                        plot.geometry = from_shape(plot_geom, srid=4326)
                        log.info("  Updated geometry for: %s", p_data["cn"])
                    continue

                plot_geom = generate_plot_geometry(settlement_shp, i, total_plots)
                plot = Plot(
                    tenant_id=tenant.id,
                    settlement_id=settlement.id,
                    cadastral_number=p_data["cn"],
                    address=p_data["address"],
                    area_m2=p_data["area"],
                    price=p_data["price"],
                    price_per_hectare=round(p_data["price"] / (p_data["area"] / 10000)),
                    status=PlotStatus(p_data["status"]),
                    permitted_use=p_data.get("use", "ИЖС"),
                    category="Земли населённых пунктов",
                    title=p_data["cn"].split(":")[-1],
                    geometry=from_shape(plot_geom, srid=4326),
                )
                session.add(plot)
                log.info("  Created plot: %s (%s)", p_data["cn"], p_data["status"])

        await session.commit()
        log.info("Seed complete!")


if __name__ == "__main__":
    asyncio.run(seed())
