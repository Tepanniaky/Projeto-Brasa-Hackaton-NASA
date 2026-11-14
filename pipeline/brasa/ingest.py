"""Leitura de CSVs oficiais do FIRMS, padronização e critérios de qualidade.

Aceita os formatos com cabeçalho do FIRMS:
  * arquivos anuais por país (``/data/country/<produto>/<ano>/...csv``);
  * CSV da ferramenta de download de histórico (Archive Download), que tem as
    mesmas colunas.

Regras (ver ``docs/METHODOLOGY.md`` §2):
  * MODIS: ``confidence`` é percentual 0–100. Mantém-se ≥ 30 (nominal e alta).
  * VIIRS: ``confidence`` é categórico l/n/h. Mantém-se n e h.
  * Ambos: ``type == 0`` (presumida vegetação) quando o campo existe.
As escalas de confiança NUNCA são convertidas entre si.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
import pandas as pd

from . import config

# Ordem dos motivos de descarte: cada registro recebe o PRIMEIRO motivo aplicável.
DROP_REASONS = (
    "satelite_fora_do_escopo",
    "duplicado",
    "tipo_nao_vegetacao",
    "baixa_confianca",
    "fora_da_regiao",
)

STANDARD_COLUMNS = [
    "sensor", "satellite", "instrument", "latitude", "longitude",
    "acq_date_utc", "acq_time_utc", "acq_datetime_utc", "date_local", "time_local",
    "confidence_raw", "confidence_class", "frp", "daynight", "type", "version",
    "processing", "scan", "track", "source_file", "source_sha256",
]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def identify_sensor(instrument: str, satellite: str) -> str | None:
    """Mapeia (instrumento, satélite) para um sensor do BRASA, ou None se fora do escopo."""
    for spec in config.SENSORS.values():
        if instrument.upper() == spec.instrument and satellite in spec.satellite_codes:
            return spec.id
    return None


def normalize_viirs_confidence(value: str) -> str:
    v = str(value).strip().lower()
    return {"low": "l", "nominal": "n", "high": "h"}.get(v, v)


def modis_confidence_class(pct: float) -> str:
    """Tabela 11 do guia MODIS C6/C6.1: low <30, nominal 30–79, high ≥80."""
    if pct < 30:
        return "baixa"
    if pct < 80:
        return "nominal"
    return "alta"


def to_local(dt_utc: pd.Series, tz: str = config.LOCAL_TZ) -> pd.Series:
    return dt_utc.dt.tz_convert(tz)


def read_firms_csv(path: Path) -> pd.DataFrame:
    """Lê um CSV do FIRMS preservando todos os campos como vieram (texto)."""
    df = pd.read_csv(path, dtype=str, keep_default_na=False)
    required = {"latitude", "longitude", "acq_date", "acq_time", "satellite",
                "instrument", "confidence", "version", "daynight"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"{path.name}: colunas obrigatórias ausentes: {sorted(missing)}")
    return df


def standardize(raw: pd.DataFrame, source_file: str, source_sha256: str) -> pd.DataFrame:
    """Converte o CSV bruto no esquema padronizado, sem descartar nada."""
    out = pd.DataFrame(index=raw.index)
    out["satellite"] = raw["satellite"].str.strip()
    out["instrument"] = raw["instrument"].str.strip().str.upper()
    out["sensor"] = [identify_sensor(i, s) for i, s in zip(out["instrument"], out["satellite"])]
    out["latitude"] = pd.to_numeric(raw["latitude"])
    out["longitude"] = pd.to_numeric(raw["longitude"])
    out["acq_date_utc"] = raw["acq_date"].str.strip()
    out["acq_time_utc"] = raw["acq_time"].str.strip().str.zfill(4)
    out["acq_datetime_utc"] = pd.to_datetime(
        out["acq_date_utc"] + " " + out["acq_time_utc"], format="%Y-%m-%d %H%M", utc=True
    )
    local = to_local(out["acq_datetime_utc"])
    out["date_local"] = local.dt.strftime("%Y-%m-%d")
    out["time_local"] = local.dt.strftime("%H:%M")
    out["confidence_raw"] = raw["confidence"].str.strip()
    is_modis = out["instrument"] == "MODIS"
    conf_cls = pd.Series(index=raw.index, dtype=object)
    if is_modis.any():
        pct = pd.to_numeric(out.loc[is_modis, "confidence_raw"])
        conf_cls.loc[is_modis] = [modis_confidence_class(p) for p in pct]
    if (~is_modis).any():
        mapping = {"l": "baixa", "n": "nominal", "h": "alta"}
        conf_cls.loc[~is_modis] = [mapping.get(normalize_viirs_confidence(v), "desconhecida")
                                   for v in out.loc[~is_modis, "confidence_raw"]]
    out["confidence_class"] = conf_cls
    out["frp"] = pd.to_numeric(raw.get("frp", pd.Series(np.nan, index=raw.index)), errors="coerce")
    out["daynight"] = raw["daynight"].str.strip()
    if "type" in raw.columns:
        out["type"] = pd.to_numeric(raw["type"], errors="coerce").astype("Int64")
    else:
        out["type"] = pd.array([pd.NA] * len(raw), dtype="Int64")
    out["version"] = raw["version"].str.strip()
    out["processing"] = np.where(out["version"].str.upper().str.contains("RT"), "NRT", "SP")
    out["scan"] = pd.to_numeric(raw.get("scan"), errors="coerce")
    out["track"] = pd.to_numeric(raw.get("track"), errors="coerce")
    out["source_file"] = source_file
    out["source_sha256"] = source_sha256
    return out[STANDARD_COLUMNS]


def passes_confidence(df: pd.DataFrame) -> pd.Series:
    """Critério de confiança específico por produto (escalas não equivalentes)."""
    ok = pd.Series(False, index=df.index)
    modis = df["instrument"] == "MODIS"
    viirs = df["instrument"] == "VIIRS"
    ok.loc[modis] = pd.to_numeric(df.loc[modis, "confidence_raw"]) >= config.MODIS_MIN_CONFIDENCE
    ok.loc[viirs] = df.loc[viirs, "confidence_raw"].map(normalize_viirs_confidence).isin(
        config.VIIRS_KEEP_CONFIDENCE)
    return ok


def assign_drop_reason(df: pd.DataFrame, in_region: pd.Series) -> pd.Series:
    """Retorna o primeiro motivo de descarte de cada linha (NA = mantida)."""
    reason = pd.Series(pd.NA, index=df.index, dtype=object)

    def mark(mask: pd.Series, label: str) -> None:
        sel = mask & reason.isna()
        reason.loc[sel] = label

    mark(df["sensor"].isna(), "satelite_fora_do_escopo")
    dup_cols = ["sensor", "latitude", "longitude", "acq_datetime_utc"]
    mark(df.duplicated(subset=dup_cols, keep="first"), "duplicado")
    has_type = df["type"].notna()
    mark(has_type & ~df["type"].isin(config.KEEP_TYPES), "tipo_nao_vegetacao")
    mark(~passes_confidence(df), "baixa_confianca")
    mark(~in_region, "fora_da_regiao")
    return reason


def load_raw_directory(raw_dir: Path) -> tuple[pd.DataFrame, list[dict]]:
    """Lê todos os CSVs listados no manifesto de aquisição/importação."""
    import json

    manifest_path = raw_dir / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(
            f"Manifesto ausente em {manifest_path}. Rode `python -m brasa.fetch_firms` "
            "ou `python -m brasa.cli import-firms` primeiro.")
    manifest = json.loads(manifest_path.read_text())
    frames, sources = [], []
    for entry in manifest["files"]:
        folder = entry.get("folder", entry["product"])
        path = raw_dir / folder / entry["subset_file"]
        digest = sha256_file(path)
        if entry.get("subset_sha256") and digest != entry["subset_sha256"]:
            raise ValueError(f"{path.name}: SHA-256 do recorte não confere com o manifesto")
        raw = read_firms_csv(path)
        frames.append(standardize(raw, source_file=entry["source_url"].rsplit("/", 1)[-1]
                                  if entry.get("source_url") else path.name,
                                  source_sha256=entry.get("source_sha256", digest)))
        sources.append({**entry, "subset_sha256_checked": digest})
    return pd.concat(frames, ignore_index=True), sources
