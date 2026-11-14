"""Smoke test do pipeline completo no exemplo pequeno (dados reais recortados, ~2 mil linhas)."""
import json
from pathlib import Path

import pytest

from brasa import cli, config

EX = Path(__file__).resolve().parents[1] / "examples" / "firms"
IBGE = config.dataset_paths("real")


@pytest.mark.skipif(not IBGE.ibge_municipios.exists(), reason="malha IBGE ausente em data/raw/ibge")
def test_example_runs_and_reports_insufficient_harmonization(tmp_path):
    m = cli.build(EX, IBGE.ibge_municipios, IBGE.ibge_nomes, tmp_path, "exemplo", None, period=("2024-09", "2024-09"))
    assert m["dataset_kind"] == "exemplo"
    for name in ("manifest.json", "serie_mensal.json", "harmonizacao.json"):
        json.loads((tmp_path / name).read_text())  # JSON estrito (sem NaN)
    serie = json.loads((tmp_path / "serie_mensal.json").read_text())
    assert serie["meses"] == ["2024-09"]
    st = serie["regioes"]["29"]["series"]
    # estado = soma dos municípios para métricas aditivas, sensor a sensor
    for sensor in ("MODIS_AQUA", "VIIRS_NOAA20"):
        total = sum(r["series"][sensor]["deteccoes"][0] for k, r in serie["regioes"].items() if k != "29")
        assert st[sensor]["deteccoes"][0] == total > 0
    harm = json.loads((tmp_path / "harmonizacao.json").read_text())
    assert harm["status"] == "dados_insuficientes"
    assert all(g["ajuste"]["status"] == "dados_insuficientes" for g in harm["grades"].values())
    # procedência preservada
    assert all(f["sha256_verified"] for f in m["fontes_firms"])
