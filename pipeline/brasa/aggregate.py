"""Agregações mensais por município e por sensor.

Métricas (nunca somadas entre sensores):
  * ``deteccoes``: número de registros (focos) que passaram nos critérios;
  * ``dias_com_deteccao``: dias locais distintos com ≥ 1 detecção no recorte;
  * ``dias_celula_<grade>``: pares distintos (fragmento, dia local) com ≥ 1
    detecção, onde fragmento = célula ∩ município.

Os valores municipais de ``deteccoes`` e ``dias_celula_*`` somam o estadual.
``dias_com_deteccao`` NÃO é aditivo e é calculado separadamente para o estado.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import config, spatial

ADDITIVE_METRICS = ("deteccoes", "dias_celula_g5", "dias_celula_g10")
ALL_METRICS = ("deteccoes", "dias_com_deteccao", "dias_celula_g5", "dias_celula_g10")


def month_range(start: str, end: str) -> list[str]:
    return [p.strftime("%Y-%m") for p in pd.period_range(start, end, freq="M")]


def add_cells(det: pd.DataFrame) -> pd.DataFrame:
    """Acrescenta o identificador de célula de cada grade (requer colunas x, y no CRS da grade)."""
    out = det.copy()
    for gid, size in config.GRID_SIZES_M.items():
        ix, iy = spatial.cell_index(out["x"].to_numpy(), out["y"].to_numpy(), size)
        out[f"cell_{gid}"] = spatial.cell_ids(ix, iy, size)
    return out


def monthly_by_municipality(det: pd.DataFrame, cod_muns: list[str], months: list[str],
                            sensors: list[str]) -> pd.DataFrame:
    """Tabela longa completa (com zeros): cod_mun × mês × sensor × métricas."""
    d = det.assign(month=det["date_local"].str[:7])
    keys = ["cod_mun", "month", "sensor"]
    parts = {
        "deteccoes": d.groupby(keys).size(),
        "dias_com_deteccao": d.groupby(keys)["date_local"].nunique(),
    }
    for gid in config.GRID_SIZES_M:
        parts[f"dias_celula_{gid}"] = (d.drop_duplicates(keys + [f"cell_{gid}", "date_local"])
                                        .groupby(keys).size())
    table = pd.DataFrame(parts)
    full = pd.MultiIndex.from_product([cod_muns, months, sensors], names=keys)
    return table.reindex(full, fill_value=0).astype(int).reset_index()


def monthly_state(det: pd.DataFrame, by_mun: pd.DataFrame, months: list[str], sensors: list[str]) -> pd.DataFrame:
    """Estado: soma dos municípios para métricas aditivas; dias distintos recalculados."""
    add = by_mun.groupby(["month", "sensor"])[list(ADDITIVE_METRICS)].sum()
    d = det.assign(month=det["date_local"].str[:7])
    days = d.groupby(["month", "sensor"])["date_local"].nunique().rename("dias_com_deteccao")
    full = pd.MultiIndex.from_product([months, sensors], names=["month", "sensor"])
    out = add.reindex(full, fill_value=0).join(days.reindex(full, fill_value=0))
    out = out.astype(int).reset_index()
    out.insert(0, "cod_mun", config.STATE_CODE)
    return out


def fragment_month_panel(det: pd.DataFrame, fragments: pd.DataFrame, months: list[str], gid: str,
                         reference: str = config.REFERENCE_SENSOR,
                         predictor: str = config.PREDICTOR_SENSOR) -> pd.DataFrame:
    """Painel completo fragmento × mês com dias de detecção da referência e do preditor."""
    cell_col = f"cell_{gid}"
    d = det.assign(month=det["date_local"].str[:7])
    days = (d.drop_duplicates([cell_col, "cod_mun", "date_local", "sensor"])
             .groupby([cell_col, "cod_mun", "month", "sensor"]).size()
             .unstack("sensor", fill_value=0))
    for s in (reference, predictor):
        if s not in days.columns:
            days[s] = 0
    days.index = days.index.set_names(["cell_id", "cod_mun", "month"])
    frag = fragments.set_index(["cell_id", "cod_mun"])
    nm = len(months)
    idx = pd.MultiIndex.from_arrays(
        [np.repeat(frag.index.get_level_values(0).to_numpy(), nm),
         np.repeat(frag.index.get_level_values(1).to_numpy(), nm),
         np.tile(np.asarray(months), len(frag))],
        names=["cell_id", "cod_mun", "month"])
    panel = days[[reference, predictor]].reindex(idx, fill_value=0).reset_index()
    panel = panel.rename(columns={reference: "ref_days", predictor: "pred_days"})
    panel["area_frac"] = frag["area_frac"].reindex(
        pd.MultiIndex.from_arrays([panel["cell_id"], panel["cod_mun"]])).to_numpy()
    # Detecções em fragmentos que não existem na lista (ex.: ponto em divisa
    # atribuído a um município cuja interseção com a célula tem área ~0) são
    # descartadas aqui e contadas na auditoria.
    lost = int(days[[reference, predictor]].sum().sum() - panel[["ref_days", "pred_days"]].sum().sum())
    panel.attrs["dias_fora_de_fragmento"] = lost
    panel["year"] = panel["month"].str[:4].astype(int)
    panel["moy"] = panel["month"].str[5:7].astype(int)
    return panel


def team_week_index(dates_utc: pd.Series) -> pd.Series:
    """Convenção da camada A: bloco fixo de 7 dias desde 1º/jan (data UTC), semanas 0–51; os dias finais vão para a 51."""
    doy = pd.to_datetime(dates_utc).dt.dayofyear - 1
    return np.minimum(doy // 7, 51)
