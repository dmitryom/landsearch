from fastapi import APIRouter

from ...services.zoning import (
    TERRITORIAL_ZONE_LAYER,
    FUNCTIONAL_ZONE_LAYER,
    CADASTRAL_QUARTER_LAYER,
    ZONE_CLASS_TITLES,
    ZONE_CLASS_COLORS,
)
from ...services.restrictions import RESTRICTION_LAYER_CONFIGS, GENERIC_ZOUIT_CONFIG

router = APIRouter(prefix="/layers", tags=["layers"])


@router.get("/zoning")
async def zoning_layers():
    return {
        "territorial_zone": {
            "layer_id": TERRITORIAL_ZONE_LAYER.layer_id,
            "category_id": TERRITORIAL_ZONE_LAYER.category_id,
            "title": TERRITORIAL_ZONE_LAYER.title,
        },
        "functional_zone": {
            "layer_id": FUNCTIONAL_ZONE_LAYER.layer_id,
            "category_id": FUNCTIONAL_ZONE_LAYER.category_id,
            "title": FUNCTIONAL_ZONE_LAYER.title,
        },
        "cadastral_quarter": {
            "layer_id": CADASTRAL_QUARTER_LAYER.layer_id,
            "title": CADASTRAL_QUARTER_LAYER.title,
        },
        "zone_classes": {
            cls: {"title": ZONE_CLASS_TITLES.get(cls, cls), "color": ZONE_CLASS_COLORS.get(cls, "#90A4AE")}
            for cls in ZONE_CLASS_TITLES
        },
    }


@router.get("/restrictions")
async def restriction_layers():
    groups: dict[str, list[dict]] = {}
    for cfg in RESTRICTION_LAYER_CONFIGS:
        groups.setdefault(cfg.group, []).append({
            "id": cfg.id,
            "layer_id": cfg.layer_id,
            "category_id": cfg.category_id,
            "title": cfg.title,
            "color": cfg.color,
            "group": cfg.group,
        })
    return {
        "groups": groups,
        "generic_zouit_id": GENERIC_ZOUIT_CONFIG.id,
        "zouit_category_id": GENERIC_ZOUIT_CONFIG.category_id,
    }
