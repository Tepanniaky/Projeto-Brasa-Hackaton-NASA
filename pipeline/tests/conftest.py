"""Fixtures sintéticas pequenas e determinísticas para os testes.

São dados de TESTE: nunca são exibidos na interface nem usados como validação.
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

MODIS_HEADER = "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type"
VIIRS_HEADER = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type"


def firms_frame(header: str, rows: list[str]) -> pd.DataFrame:
    return pd.read_csv(io.StringIO("\n".join([header, *rows])), dtype=str, keep_default_na=False)


@pytest.fixture
def raw_modis() -> pd.DataFrame:
    return firms_frame(MODIS_HEADER, [
        # lat, lon, ..., date, time(UTC), sat, inst, conf, version, ..., dn, type
        "-11.0,-45.0,320,1,1,2024-09-01,1630,Aqua,MODIS,80,61.03,300,10,D,0",
        "-11.0,-45.0,320,1,1,2024-09-01,1630,Aqua,MODIS,80,61.03,300,10,D,0",   # duplicado exato
        "-11.0,-45.0,320,1,1,2024-09-01,0130,Aqua,MODIS,30,61.03,300,10,N,0",   # 22:30 local do dia 31/08
        "-11.0,-45.0,320,1,1,2024-09-02,1630,Aqua,MODIS,29,61.03,300,10,D,0",   # baixa confiança
        "-11.0,-45.0,320,1,1,2024-09-02,1300,Terra,MODIS,90,61.03,300,10,D,0",  # Terra: fora do escopo
        "-11.0,-45.0,320,1,1,2024-09-03,1630,Aqua,MODIS,95,61.03,300,10,D,2",   # fonte estática
    ])


@pytest.fixture
def raw_viirs() -> pd.DataFrame:
    return firms_frame(VIIRS_HEADER, [
        "-11.0,-45.0,330,0.4,0.4,2024-09-01,1640,N20,VIIRS,n,2,290,3,D,0",
        "-11.01,-45.0,330,0.4,0.4,2024-09-01,1640,N20,VIIRS,l,2,290,3,D,0",      # baixa: excluída
        "-11.02,-45.0,330,0.4,0.4,2024-09-01,1640,N20,VIIRS,h,2,290,3,D,0",
        "-11.0,-45.0,330,0.4,0.4,2024-09-01,1640,N,VIIRS,n,2,290,3,D,0",         # S-NPP: fora do escopo
    ])


def make_panel(seed: int = 7, n_frag: int = 60) -> pd.DataFrame:
    """Painel fragmento × mês 2020–2025 com relação conhecida MODIS ≈ 0.4·VIIRS e sazonalidade."""
    rng = np.random.default_rng(seed)
    months = [p.strftime("%Y-%m") for p in pd.period_range("2020-01", "2025-12", freq="M")]
    rows = []
    for f in range(n_frag):
        area = 1.0 if f % 5 else 0.5
        for m in months:
            moy = int(m[5:])
            season = 4.0 if moy in (8, 9, 10) else 0.3
            v = rng.poisson(season * area * 3)
            r = rng.poisson(0.4 * v + 0.05)
            rows.append({"cell_id": f"10k_{f}_0", "cod_mun": f"29{f % 3:05d}", "area_frac": area, "month": m,
                         "ref_days": r, "pred_days": v})
    p = pd.DataFrame(rows)
    p["year"] = p["month"].str[:4].astype(int)
    p["moy"] = p["month"].str[5:7].astype(int)
    return p
