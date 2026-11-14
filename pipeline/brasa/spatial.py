"""Região, grade comum e atribuição espacial das detecções.

Decisões (ver ``docs/METHODOLOGY.md`` §4):
  * Município de uma detecção: ponto-no-polígono com predicado ``intersects``,
    que inclui a borda. Um ponto exatamente sobre a divisa de dois municípios
    fica com o menor código IBGE. Esses casos são contados e reportados.
  * Grade: quadrados de 5 km e 10 km em EPSG:10857 (área igual), com origem
    em (0, 0). Assim cada célula de 5 km está contida numa única célula de 10 km.
  * Unidade de agregação: fragmento = célula ∩ município. Os fragmentos de um
    município somam o município, e os municípios somam o estado.
"""

from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import box

from . import config


def load_municipalities(geojson: Path, names_json: Path) -> gpd.GeoDataFrame:
    gdf = gpd.read_file(geojson)
    if gdf.crs is None:
        # A API de malhas do IBGE entrega SIRGAS 2000 geográfico sem membro "crs"
        # (GeoJSON RFC 7946). Rotulamos explicitamente: set_crs só rotula, não transforma.
        gdf = gdf.set_crs(config.SOURCE_CRS_IBGE)
    key = "codarea" if "codarea" in gdf.columns else "cod_mun"
    gdf = gdf.rename(columns={key: "cod_mun"})
    gdf["cod_mun"] = gdf["cod_mun"].astype(str)
    names = {str(m["id"]): m["nome"] for m in json.loads(Path(names_json).read_text())}
    gdf["nome"] = gdf["cod_mun"].map(names)
    if gdf["nome"].isna().any():
        missing = gdf.loc[gdf["nome"].isna(), "cod_mun"].tolist()
        raise ValueError(f"municípios sem nome no índice IBGE: {missing[:5]}")
    if gdf["cod_mun"].duplicated().any():
        raise ValueError("códigos de município duplicados na malha")
    invalid = (~gdf.geometry.is_valid).sum()
    if invalid:
        gdf["geometry"] = gdf.geometry.make_valid()
    return gdf[["cod_mun", "nome", "geometry"]].sort_values("cod_mun").reset_index(drop=True)


def to_grid_crs(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    return gdf.to_crs(config.GRID_CRS)


def points_frame(df: pd.DataFrame) -> gpd.GeoDataFrame:
    """Detecções como pontos, já transformadas para o CRS da grade."""
    pts = gpd.GeoDataFrame(
        df, geometry=gpd.points_from_xy(df["longitude"], df["latitude"]),
        crs=config.SOURCE_CRS_FIRMS)
    return pts.to_crs(config.GRID_CRS)


def assign_municipality(points: gpd.GeoDataFrame, munis_grid: gpd.GeoDataFrame) -> tuple[pd.Series, dict]:
    """Retorna o código do município de cada ponto (NA fora da região) e uma auditoria de cardinalidade."""
    joined = gpd.sjoin(points[["geometry"]], munis_grid[["cod_mun", "geometry"]],
                       predicate="intersects", how="left")
    n_multi = int(joined.index.duplicated(keep=False).sum())
    joined = joined.sort_values("cod_mun").loc[~joined.sort_values("cod_mun").index.duplicated(keep="first")]
    cod = joined["cod_mun"].reindex(points.index)
    audit = {
        "predicado": "intersects (inclui borda)",
        "pontos": int(len(points)),
        "pontos_na_regiao": int(cod.notna().sum()),
        "pontos_fora": int(cod.isna().sum()),
        "linhas_extras_em_divisa": n_multi,
        "regra_divisa": "ponto em divisa fica com o menor código IBGE",
    }
    return cod, audit


def cell_index(x: np.ndarray, y: np.ndarray, size_m: int) -> tuple[np.ndarray, np.ndarray]:
    return np.floor(np.asarray(x) / size_m).astype(np.int64), np.floor(np.asarray(y) / size_m).astype(np.int64)


def cell_ids(ix: np.ndarray, iy: np.ndarray, size_m: int) -> np.ndarray:
    k = size_m // 1000
    return np.char.add(np.char.add(np.char.add(f"{k}k_", ix.astype(str)), "_"), iy.astype(str))


def build_fragments(munis_grid: gpd.GeoDataFrame, size_m: int) -> pd.DataFrame:
    """Lista todos os fragmentos (célula ∩ município), inclusive os sem nenhuma detecção."""
    minx, miny, maxx, maxy = munis_grid.total_bounds
    ix0, iy0 = int(np.floor(minx / size_m)), int(np.floor(miny / size_m))
    ix1, iy1 = int(np.floor(maxx / size_m)), int(np.floor(maxy / size_m))
    gx, gy = np.meshgrid(np.arange(ix0, ix1 + 1), np.arange(iy0, iy1 + 1))
    gx, gy = gx.ravel(), gy.ravel()
    cells = gpd.GeoDataFrame(
        {"ix": gx, "iy": gy},
        geometry=[box(i * size_m, j * size_m, (i + 1) * size_m, (j + 1) * size_m) for i, j in zip(gx, gy)],
        crs=munis_grid.crs)
    inter = gpd.overlay(cells, munis_grid[["cod_mun", "geometry"]], how="intersection", keep_geom_type=True)
    inter["area_frac"] = inter.geometry.area / float(size_m * size_m)
    inter = inter[inter["area_frac"] > 1e-6]
    inter["cell_id"] = cell_ids(inter["ix"].to_numpy(), inter["iy"].to_numpy(), size_m)
    return pd.DataFrame(inter[["cell_id", "cod_mun", "area_frac"]]).reset_index(drop=True)
