from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RestrictionLayerConfig:
    id: str
    layer_id: int
    category_id: int
    group: str
    title: str
    color: str
    type_zone_terms: tuple[str, ...] = ()
    subcategory_ids: tuple[int, ...] = ()


RESTRICTION_LAYER_CONFIGS: tuple[RestrictionLayerConfig, ...] = (
    RestrictionLayerConfig(
        id="restriction-zouit-engineering", layer_id=37578, category_id=36940,
        group="ЗОУИТ: инженерные сети",
        title="Охранные зоны инженерных коммуникаций", color="#C2185B",
        type_zone_terms=("охранная зона инженерных коммуникаций",),
        subcategory_ids=(17,),
    ),
    RestrictionLayerConfig(
        id="restriction-zouit-power", layer_id=37578, category_id=36940,
        group="ЗОУИТ: инженерные сети",
        title="Охранные зоны электроэнергетики", color="#E31A1C",
        type_zone_terms=("электроэнергетики", "электросетевого хозяйства"),
        subcategory_ids=(41,),
    ),
    RestrictionLayerConfig(
        id="restriction-zouit-communications", layer_id=37578, category_id=36940,
        group="ЗОУИТ: инженерные сети",
        title="Охранные зоны связи и радиофикации", color="#F57C00",
        type_zone_terms=("сооружений связи", "радиофикации"),
        subcategory_ids=(18,),
    ),
    RestrictionLayerConfig(
        id="restriction-zouit-pipelines", layer_id=37578, category_id=36940,
        group="ЗОУИТ: инженерные сети",
        title="Охранные зоны трубопроводов", color="#8C510A",
        type_zone_terms=("охранная зона трубопроводов",),
    ),
    RestrictionLayerConfig(
        id="restriction-zouit-pipeline-distance", layer_id=37578, category_id=36940,
        group="ЗОУИТ: инженерные сети",
        title="Зоны минимальных расстояний до трубопроводов", color="#A16207",
        type_zone_terms=("минимальных расстояний", "трубопроводов"),
    ),
    RestrictionLayerConfig(
        id="restriction-zouit-geodetic", layer_id=37579, category_id=36940,
        group="ЗОУИТ: специальные объекты",
        title="Охранные зоны геодезических пунктов", color="#6D28D9",
        type_zone_terms=("геодезического пункта",),
        subcategory_ids=(14,),
    ),
    RestrictionLayerConfig(
        id="restriction-zouit-public-servitude", layer_id=37581, category_id=36940,
        group="ЗОУИТ: специальные объекты",
        title="Зоны публичного сервитута", color="#D55E00",
        type_zone_terms=("публичного сервитута",),
        subcategory_ids=(31,),
    ),
    RestrictionLayerConfig(
        id="restriction-zouit-transport", layer_id=37578, category_id=36940,
        group="ЗОУИТ: транспорт",
        title="Охранные зоны транспорта", color="#4B5563",
        type_zone_terms=("охранная зона транспорта",),
        subcategory_ids=(16,),
    ),
    RestrictionLayerConfig(
        id="restriction-zouit-roadside", layer_id=37578, category_id=36940,
        group="ЗОУИТ: транспорт",
        title="Придорожные полосы", color="#374151",
        type_zone_terms=("придорож",),
        subcategory_ids=(19,),
    ),
    RestrictionLayerConfig(
        id="restriction-zouit-aerodrome", layer_id=37579, category_id=36940,
        group="ЗОУИТ: транспорт",
        title="Приаэродромные территории", color="#111827",
        type_zone_terms=("приаэродром",),
    ),
    RestrictionLayerConfig(
        id="restriction-zouit-water-supply", layer_id=37580, category_id=36940,
        group="ЗОУИТ: вода и санитария",
        title="Зоны санитарной охраны водоснабжения", color="#1976D2",
        type_zone_terms=("санитарной охраны источников", "водоснабжения"),
        subcategory_ids=(7,),
    ),
    RestrictionLayerConfig(
        id="restriction-zouit-sanitary", layer_id=37580, category_id=36940,
        group="ЗОУИТ: вода и санитария",
        title="Санитарно-защитные зоны", color="#C51B7D",
        type_zone_terms=("санитарно-защитная",),
        subcategory_ids=(26,),
    ),
    RestrictionLayerConfig(
        id="restriction-zouit-water-protection", layer_id=37580, category_id=36940,
        group="ЗОУИТ: вода и санитария",
        title="Водоохранные зоны", color="#1D4ED8",
        type_zone_terms=("водоохранная зона",),
        subcategory_ids=(5,),
    ),
    RestrictionLayerConfig(
        id="restriction-zouit-shoreline-protection", layer_id=37580, category_id=36940,
        group="ЗОУИТ: вода и санитария",
        title="Прибрежные защитные полосы", color="#0891B2",
        type_zone_terms=("прибрежная защитная полоса",),
        subcategory_ids=(6,),
    ),
    RestrictionLayerConfig(
        id="restriction-zouit-cultural", layer_id=37577, category_id=36940,
        group="ЗОУИТ: культурное наследие",
        title="Зоны охраны объектов культурного наследия", color="#7B2CBF",
        type_zone_terms=("культурного наследия",),
        subcategory_ids=(13,),
    ),
    RestrictionLayerConfig(
        id="restriction-zouit-environment-monitoring", layer_id=37579, category_id=36940,
        group="ЗОУИТ: природные объекты",
        title="Охранные зоны пунктов наблюдений", color="#00897B",
        type_zone_terms=("стационарного пункта наблюдений",),
        subcategory_ids=(15,),
    ),
    RestrictionLayerConfig(
        id="restriction-zouit-other", layer_id=37581, category_id=36940,
        group="ЗОУИТ: прочее",
        title="Иные ЗОУИТ", color="#8C510A",
        type_zone_terms=("иная зона", "иные зоны"),
        subcategory_ids=(40,),
    ),
    RestrictionLayerConfig(
        id="restriction-red-lines", layer_id=879243, category_id=38942,
        group="Планировка",
        title="Красные линии", color="#E31A1C",
    ),
    RestrictionLayerConfig(
        id="restriction-territorial-zones", layer_id=875838, category_id=472819,
        group="Градостроительные зоны",
        title="Территориальные зоны", color="#F57C00",
    ),
    RestrictionLayerConfig(
        id="restriction-cultural-territories", layer_id=875840, category_id=472820,
        group="Ограничения",
        title="Территории объектов культурного наследия", color="#9C27B0",
    ),
    RestrictionLayerConfig(
        id="restriction-protected-natural", layer_id=875845, category_id=472825,
        group="Ограничения",
        title="Особо охраняемые природные территории", color="#2E7D32",
    ),
    RestrictionLayerConfig(
        id="restriction-shorelines", layer_id=875832, category_id=472813,
        group="Вода",
        title="Береговые линии и границы водных объектов", color="#1976D2",
    ),
    RestrictionLayerConfig(
        id="restriction-forestry", layer_id=875866, category_id=472847,
        group="Лес",
        title="Лесничества", color="#006D2C",
    ),
    RestrictionLayerConfig(
        id="restriction-forest-parks", layer_id=875874, category_id=472853,
        group="Лес",
        title="Граница лесопарка", color="#66BB6A",
    ),
)

RESTRICTION_CONFIG_BY_TITLE = {
    config.title: config for config in RESTRICTION_LAYER_CONFIGS
}

RESTRICTION_CONFIG_BY_LAYER_ID: dict[int, RestrictionLayerConfig] = {
    config.layer_id: config for config in RESTRICTION_LAYER_CONFIGS
}

_CATEGORY_COUNTS = {
    cat: sum(1 for c in RESTRICTION_LAYER_CONFIGS if c.category_id == cat)
    for cat in {c.category_id for c in RESTRICTION_LAYER_CONFIGS}
}

RESTRICTION_CONFIG_BY_CATEGORY_ID = {
    config.category_id: config
    for config in RESTRICTION_LAYER_CONFIGS
    if _CATEGORY_COUNTS[config.category_id] == 1
}

GENERIC_ZOUIT_CONFIG = next(
    c for c in RESTRICTION_LAYER_CONFIGS if c.id == "restriction-zouit-other"
)

ZOUIT_LAYER_CONFIGS = tuple(
    c for c in RESTRICTION_LAYER_CONFIGS
    if c.category_id == GENERIC_ZOUIT_CONFIG.category_id
)
