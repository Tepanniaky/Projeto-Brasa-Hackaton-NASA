"""Parâmetros do pipeline BRASA.

Cada regra aqui tem uma fonte documentada em ``docs/METHODOLOGY.md``. Mudar um
valor muda o resultado científico: registre a mudança na metodologia.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

PIPELINE_VERSION = "0.1.0"
SCHEMA_VERSION = "1.0"

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
WEB_DATA_DIR = ROOT / "web" / "public" / "data"

# Definição de "dia": data civil local. America/Bahia = UTC-3 sem horário de
# verão desde 2012 (fonte: base tz IANA). A conversão é feita por zoneinfo,
# não por deslocamento fixo, para que o código continue certo fora da janela.
LOCAL_TZ = "America/Bahia"

# CRS
SOURCE_CRS_FIRMS = "EPSG:4326"  # FIRMS publica latitude/longitude WGS84
SOURCE_CRS_IBGE = "EPSG:4674"   # Malhas IBGE: SIRGAS 2000 geográfico
# SIRGAS 2000 / Brazil Albers: projeção de área igual para o Brasil continental.
# A Bahia cruza os fusos UTM 23S e 24S, então UTM não serve para uma grade única.
# Transformação WGS84 -> 10857 com precisão de 1 m, sem operação "ballpark"
# (verificado com o script crs_reprojection_plan.py da skill geopandas).
GRID_CRS = "EPSG:10857"

# Grades comuns avaliadas. A origem é múltipla de 10 km para que as células de
# 5 km fiquem aninhadas nas de 10 km.
GRID_SIZES_M = {"g5": 5_000, "g10": 10_000}
GRID_ORIGIN_STEP_M = 10_000


@dataclass(frozen=True)
class SensorSpec:
    id: str
    label: str
    instrument: str
    satellite: str
    satellite_codes: tuple[str, ...]  # valores aceitos no campo `satellite`
    firms_product: str                # pasta no FIRMS
    source_product: str               # produto de origem na NASA
    nominal_pixel_m: int
    quality_rule: str                 # texto exibido na interface
    confidence_kind: str              # "percent" (MODIS) ou "class" (VIIRS)


SENSORS: dict[str, SensorSpec] = {
    "MODIS_AQUA": SensorSpec(
        id="MODIS_AQUA",
        label="MODIS/Aqua",
        instrument="MODIS",
        satellite="Aqua",
        satellite_codes=("Aqua", "A"),
        firms_product="modis",
        source_product="MCD14ML (MODIS C6/C6.1 Active Fire), via FIRMS",
        nominal_pixel_m=1000,
        quality_rule="confiança numérica ≥ 30 % (classes nominal e alta, Tabela 11 do guia MODIS C6.1) e type = 0",
        confidence_kind="percent",
    ),
    "VIIRS_NOAA20": SensorSpec(
        id="VIIRS_NOAA20",
        label="VIIRS/NOAA-20",
        instrument="VIIRS",
        satellite="NOAA-20",
        satellite_codes=("N20", "NOAA-20", "NOAA20", "J1"),
        firms_product="viirs-jpss1",
        source_product="VJ114IMGML (VIIRS C2 375 m Active Fire), via FIRMS",
        nominal_pixel_m=375,
        quality_rule="confiança categórica nominal ou alta (baixa excluída: Anomalia Magnética do Atlântico Sul e reflexo solar) e type = 0",
        confidence_kind="class",
    ),
}

# Critérios de qualidade. As escalas NÃO são equivalentes e nunca são convertidas.
MODIS_MIN_CONFIDENCE = 30           # guia MODIS C6.1, Tabela 11: nominal ≥ 30 %
VIIRS_KEEP_CONFIDENCE = ("n", "h")  # guia VIIRS C2 375 m, §2: low = glint/SAMA
KEEP_TYPES = (0,)                   # 0 = presumida vegetação

# Série de referência da camada A (equipe): reproduzida em 2020–2021 como
# contagem MODIS Terra+Aqua sem filtro de confiança, semanas por data UTC.
TEAM_REFERENCE_SATELLITES = ("Aqua", "Terra", "A", "T")
STATE_CODE = "29"
STATE_NAME = "Bahia"

# Indisponibilidades conhecidas (fonte: guia MODIS C6.1 §7.2.4).
KNOWN_GAPS = [
    {
        "sensor": "MODIS_AQUA",
        "start": "2020-08-16",
        "end": "2020-09-02",
        "kind": "parcial",
        "note": "Falha da unidade FMU do Aqua; produtos gerados só com Direct Broadcast, cobertura incompleta.",
        "source": "MODIS C6/C6.1 Active Fire User Guide v1.0, §7.2.4",
    }
]

# Harmonização experimental
REFERENCE_SENSOR = "MODIS_AQUA"   # escala-alvo do ajuste
PREDICTOR_SENSOR = "VIIRS_NOAA20"
TRAIN_YEARS = (2020, 2021, 2022)
EVAL_YEARS = (2023, 2024, 2025)
# Meses removidos do AJUSTE (não da exibição) por indisponibilidade do sensor de referência.
EXCLUDE_FROM_FIT_MONTHS = ("2020-08", "2020-09")


@dataclass
class DatasetPaths:
    kind: str  # "real" | "synthetic"
    raw_firms: Path
    ibge_municipios: Path
    ibge_nomes: Path
    out_dir: Path
    interim: Path = field(default=DATA_DIR / "interim")


def dataset_paths(kind: str) -> DatasetPaths:
    ibge = DATA_DIR / "raw" / "ibge"
    if kind == "real":
        return DatasetPaths(
            kind="real",
            raw_firms=DATA_DIR / "raw" / "firms_bahia",
            ibge_municipios=ibge / "bahia_29_municipios.geojson",
            ibge_nomes=ibge / "bahia_29_municipios_nomes.json",
            out_dir=WEB_DATA_DIR / "real",
            interim=DATA_DIR / "interim" / "real",
        )
    if kind == "synthetic":
        return DatasetPaths(
            kind="synthetic",
            raw_firms=DATA_DIR / "synthetic" / "firms",
            ibge_municipios=ibge / "bahia_29_municipios.geojson",
            ibge_nomes=ibge / "bahia_29_municipios_nomes.json",
            out_dir=WEB_DATA_DIR / "demo",
            interim=DATA_DIR / "interim" / "demo",
        )
    raise ValueError(f"dataset desconhecido: {kind}")
