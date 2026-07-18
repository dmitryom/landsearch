from app.services.vri import normalize_vri


def test_plain_road_vri_is_normalized_as_transport() -> None:
    assert normalize_vri("дорога") == "ТРАНСПОРТ"
    assert normalize_vri("земельный участок для размещения дороги") == "ТРАНСПОРТ"
