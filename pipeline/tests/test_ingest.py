import pandas as pd

from brasa import config, ingest


def test_modis_confidence_classes_follow_user_guide_table_11():
    assert ingest.modis_confidence_class(29) == "baixa"
    assert ingest.modis_confidence_class(30) == "nominal"
    assert ingest.modis_confidence_class(79) == "nominal"
    assert ingest.modis_confidence_class(80) == "alta"


def test_sensor_identification_keeps_only_aqua_and_noaa20():
    assert ingest.identify_sensor("MODIS", "Aqua") == "MODIS_AQUA"
    assert ingest.identify_sensor("MODIS", "Terra") is None
    assert ingest.identify_sensor("VIIRS", "N20") == "VIIRS_NOAA20"
    assert ingest.identify_sensor("VIIRS", "N") is None  # S-NPP


def test_standardize_preserves_provenance_and_converts_to_local_day(raw_modis):
    std = ingest.standardize(raw_modis, "modis_2024_Brazil.csv", "abc123")
    assert set(ingest.STANDARD_COLUMNS) <= set(std.columns)
    assert (std["source_sha256"] == "abc123").all()
    assert (std["version"] == "61.03").all()
    # 2024-09-01 01:30 UTC = 2024-08-31 22:30 em America/Bahia (UTC-3)
    night = std.iloc[2]
    assert night["acq_date_utc"] == "2024-09-01"
    assert night["date_local"] == "2024-08-31"
    assert night["time_local"] == "22:30"
    day = std.iloc[0]
    assert day["date_local"] == "2024-09-01" and day["time_local"] == "13:30"


def test_confidence_scales_are_not_mixed(raw_modis, raw_viirs):
    std = pd.concat([ingest.standardize(raw_modis, "m", "x"), ingest.standardize(raw_viirs, "v", "y")],
                    ignore_index=True)
    ok = ingest.passes_confidence(std)
    modis = std["instrument"] == "MODIS"
    # MODIS: limiar numérico 30
    assert ok[modis].tolist() == [True, True, True, False, True, True]
    # VIIRS: classes n/h mantidas, l descartada, sem conversão numérica
    assert ok[~modis].tolist() == [True, False, True, True]
    assert config.MODIS_MIN_CONFIDENCE == 30
    assert set(config.VIIRS_KEEP_CONFIDENCE) == {"n", "h"}


def test_drop_reasons_are_first_applicable_and_complete(raw_modis, raw_viirs):
    std = pd.concat([ingest.standardize(raw_modis, "m", "x"), ingest.standardize(raw_viirs, "v", "y")],
                    ignore_index=True)
    in_region = pd.Series(True, index=std.index)
    reason = ingest.assign_drop_reason(std, in_region)
    assert [r if isinstance(r, str) else None for r in reason] == [
        None, "duplicado", None, "baixa_confianca", "satelite_fora_do_escopo", "tipo_nao_vegetacao",
        None, "baixa_confianca", None, "satelite_fora_do_escopo",
    ]
    outside = ingest.assign_drop_reason(std, pd.Series(False, index=std.index))
    assert outside.notna().all()


def test_nrt_versions_are_flagged():
    raw = pd.DataFrame({"latitude": ["-11"], "longitude": ["-45"], "acq_date": ["2026-10-01"],
                        "acq_time": ["1630"], "satellite": ["N20"], "instrument": ["VIIRS"],
                        "confidence": ["n"], "version": ["2.0NRT"], "daynight": ["D"]})
    std = ingest.standardize(raw, "f", "h")
    assert std["processing"].iloc[0] == "NRT"
    assert std["type"].isna().all()  # NRT não traz type; o filtro não é aplicado e isso fica registrado
