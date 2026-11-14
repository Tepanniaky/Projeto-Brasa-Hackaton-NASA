"""Auditoria independente da série harmonizada da equipe (camada A) e resumos de qualidade.

A camada A declara: "até 2021, MODIS observado; a partir de 2022, VIIRS convertido
para a escala MODIS". Aqui verificamos, com os registros FIRMS baixados:
  1. se 2020–2021 reproduzem exatamente a contagem MODIS (Terra+Aqua, sem filtro,
     semanas por data UTC);
  2. quanto a série convertida (2022–2025) difere do que o MODIS observou nos
     mesmos anos, e se o observado cai dentro da faixa min–max publicada.
O MODIS observado depois de 2022 também é afetado pela deriva orbital. Por isso
a diferença é uma divergência a explicar, não um "erro" da equipe por definição.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from . import aggregate, config


def team_reference_counts(std: pd.DataFrame, cod_mun: pd.Series) -> pd.DataFrame:
    """Contagens MODIS Terra+Aqua SEM filtro de qualidade, por município, ano e semana UTC."""
    sel = (std["instrument"] == "MODIS") & std["satellite"].isin(config.TEAM_REFERENCE_SATELLITES) & cod_mun.notna()
    d = std.loc[sel, ["acq_date_utc"]].assign(cod_mun=cod_mun[sel])
    d["year"] = d["acq_date_utc"].str[:4].astype(int)
    d["semana"] = aggregate.team_week_index(d["acq_date_utc"]).to_numpy()
    d["month_utc"] = d["acq_date_utc"].str[:7]
    return d


def audit_region(team_json: dict, ref: pd.DataFrame) -> dict:
    anos_cal = team_json["calendario"]["anos"]
    out = {"reproducao_2020_2021": [], "comparacao_anual": []}
    for year in (2020, 2021):
        if year not in anos_cal:
            continue
        team_w = np.array(team_json["calendario"]["valores"][anos_cal.index(year)], dtype=float)
        obs_w = np.bincount(ref.loc[ref["year"] == year, "semana"], minlength=52)[:52].astype(float)
        out["reproducao_2020_2021"].append({
            "ano": year, "semanas_iguais": int((np.isclose(team_w, obs_w)).sum()), "semanas": 52,
            "total_equipe": float(team_w.sum()), "total_modis_ta_sem_filtro": float(obs_w.sum())})
    anual = {a["ano"]: a for a in team_json["anual"]}
    for year in range(2020, 2026):
        if year not in anual:
            continue
        a = anual[year]
        obs = int((ref["year"] == year).sum())
        out["comparacao_anual"].append({
            "ano": year,
            "equipe": a["valor"], "equipe_min": a["min"], "equipe_max": a["max"],
            "modis_ta_observado": obs,
            "diferenca_relativa": (a["valor"] - obs) / obs if obs else None,
            "observado_dentro_da_faixa": bool(a["min"] <= obs <= a["max"]),
            "origem_equipe": "MODIS observado" if year <= 2021 else "VIIRS convertido",
        })
    rep = out["reproducao_2020_2021"]
    out["reproduzida"] = bool(rep) and all(r["semanas_iguais"] == 52 for r in rep)
    return out


def audit_team(team_dir: Path, std: pd.DataFrame, cod_mun: pd.Series, munis: pd.DataFrame) -> dict | None:
    """Audita o estado e todos os municípios que existirem na camada A."""
    if not (team_dir / "estado.json").exists():
        return None
    ref = team_reference_counts(std, cod_mun)
    regions = {config.STATE_CODE: audit_region(json.loads((team_dir / "estado.json").read_text()), ref)}
    for cod in munis["cod_mun"]:
        p = team_dir / "mun" / f"{cod}.json"
        if p.exists():
            regions[cod] = audit_region(json.loads(p.read_text()), ref[ref["cod_mun"] == cod])
    # Síntese para municípios com atividade relevante (≥ 50 detecções MODIS no ano).
    rows = []
    for cod, r in regions.items():
        if cod == config.STATE_CODE:
            continue
        for c in r["comparacao_anual"]:
            if c["ano"] >= 2022 and c["modis_ta_observado"] >= 50:
                rows.append({"cod_mun": cod, **c})
    df = pd.DataFrame(rows)
    sintese = {}
    if not df.empty:
        for year, g in df.groupby("ano"):
            sintese[int(year)] = {
                "municipios": int(len(g)),
                "mediana_diferenca_relativa": float(g["diferenca_relativa"].median()),
                "p10_diferenca_relativa": float(g["diferenca_relativa"].quantile(0.10)),
                "p90_diferenca_relativa": float(g["diferenca_relativa"].quantile(0.90)),
                "fracao_observado_dentro_da_faixa": float(g["observado_dentro_da_faixa"].mean()),
            }
    reproduzidos = sum(1 for k, r in regions.items() if k != config.STATE_CODE and r["reproduzida"])
    return {
        "metodo": ("Contagem MODIS Terra+Aqua sem filtro de confiança ou tipo, município por ponto-no-polígono "
                   "(IBGE), semana = min((dia_do_ano_UTC − 1) // 7, 51)."),
        "municipios_reproduzidos_2020_2021": reproduzidos,
        "municipios_auditados": len(regions) - 1,
        "sintese_2022_2025_municipios_com_50_ou_mais": sintese,
        "regioes": regions,
    }


def overpass_drift(std: pd.DataFrame) -> list[dict]:
    """Horário local mediano das detecções diurnas por satélite e ano: evidência da deriva orbital."""
    d = std[(std["daynight"] == "D") & std["satellite"].notna()].copy()
    d["year"] = d["acq_date_utc"].str[:4].astype(int)
    hh = d["time_local"].str[:2].astype(int) + d["time_local"].str[3:5].astype(int) / 60
    d["hora"] = hh
    out = []
    for (sat, year), g in d.groupby(["satellite", "year"]):
        out.append({"satelite": sat, "ano": int(year), "hora_local_mediana": round(float(g["hora"].median()), 2),
                    "n": int(len(g))})
    return out


def quality_summary(std: pd.DataFrame, reason: pd.Series) -> list[dict]:
    d = std.assign(motivo=reason.fillna("mantido"), year=std["acq_date_utc"].str[:4].astype(int))
    d["sensor_rotulo"] = d["sensor"].fillna(d["instrument"] + "/" + d["satellite"])
    out = []
    for (sensor, year), g in d.groupby(["sensor_rotulo", "year"]):
        counts = g["motivo"].value_counts().to_dict()
        out.append({"sensor": sensor, "ano": int(year), "linhas": int(len(g)),
                    "mantidos": int(counts.pop("mantido", 0)),
                    "descartes": {k: int(v) for k, v in counts.items()},
                    "versoes": sorted(g["version"].unique().tolist()),
                    "processamento": sorted(g["processing"].unique().tolist())})
    return out
