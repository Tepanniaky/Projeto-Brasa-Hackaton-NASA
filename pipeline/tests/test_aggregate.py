import numpy as np
import pandas as pd

from brasa import aggregate, spatial


def test_5km_cells_nest_in_10km_cells():
    rng = np.random.default_rng(1)
    x = rng.uniform(-2e6, 8e6, 5000)
    y = rng.uniform(-1e6, 1.2e7, 5000)
    ix5, iy5 = spatial.cell_index(x, y, 5000)
    ix10, iy10 = spatial.cell_index(x, y, 10000)
    assert np.array_equal(ix5 // 2, ix10)
    assert np.array_equal(iy5 // 2, iy10)


def _det(rows):
    d = pd.DataFrame(rows, columns=["sensor", "cod_mun", "date_local", "x", "y"])
    return aggregate.add_cells(d)


def test_cell_days_count_each_cell_day_once_and_never_mix_sensors():
    det = _det([
        ("MODIS_AQUA", "2900001", "2024-09-01", 100.0, 100.0),
        ("MODIS_AQUA", "2900001", "2024-09-01", 200.0, 300.0),     # mesma célula e dia
        ("MODIS_AQUA", "2900001", "2024-09-01", 12_000.0, 100.0),  # outra célula de 10 km
        ("MODIS_AQUA", "2900001", "2024-09-02", 100.0, 100.0),     # outro dia
        ("VIIRS_NOAA20", "2900001", "2024-09-01", 100.0, 100.0),
        ("VIIRS_NOAA20", "2900001", "2024-09-01", 150.0, 150.0),
    ])
    out = aggregate.monthly_by_municipality(det, ["2900001", "2900002"], ["2024-09", "2024-10"],
                                            ["MODIS_AQUA", "VIIRS_NOAA20"])
    m = out[(out.cod_mun == "2900001") & (out.month == "2024-09") & (out.sensor == "MODIS_AQUA")].iloc[0]
    v = out[(out.cod_mun == "2900001") & (out.month == "2024-09") & (out.sensor == "VIIRS_NOAA20")].iloc[0]
    assert m["deteccoes"] == 4
    assert m["dias_com_deteccao"] == 2
    assert m["dias_celula_g10"] == 3   # (c1,d1), (c2,d1), (c1,d2)
    assert v["deteccoes"] == 2 and v["dias_celula_g10"] == 1
    # tabela completa com zeros: 2 municípios × 2 meses × 2 sensores
    assert len(out) == 8
    assert out[out.cod_mun == "2900002"]["deteccoes"].sum() == 0
    # não existe nenhuma linha "somada" entre sensores
    assert set(out["sensor"]) == {"MODIS_AQUA", "VIIRS_NOAA20"}


def test_state_is_sum_of_municipalities_for_additive_metrics_only():
    det = _det([
        ("MODIS_AQUA", "2900001", "2024-09-01", 100.0, 100.0),
        ("MODIS_AQUA", "2900002", "2024-09-01", 50_000.0, 100.0),
    ])
    months, sensors = ["2024-09"], ["MODIS_AQUA", "VIIRS_NOAA20"]
    by_mun = aggregate.monthly_by_municipality(det, ["2900001", "2900002"], months, sensors)
    st = aggregate.monthly_state(det, by_mun, months, sensors)
    row = st[st.sensor == "MODIS_AQUA"].iloc[0]
    assert row["deteccoes"] == 2 and row["dias_celula_g10"] == 2
    # o mesmo dia em dois municípios conta UMA vez no estado
    assert row["dias_com_deteccao"] == 1
    assert by_mun[by_mun.sensor == "MODIS_AQUA"]["dias_com_deteccao"].sum() == 2


def test_team_week_convention():
    dates = pd.Series(["2021-01-01", "2021-01-07", "2021-01-08", "2021-12-23", "2021-12-24",
                       "2021-12-31", "2020-12-31"])
    # a semana 51 começa no dia 358 (índice 357) e absorve os 8–9 dias finais do ano
    assert aggregate.team_week_index(dates).tolist() == [0, 0, 1, 50, 51, 51, 51]


def test_month_range_inclusive():
    assert aggregate.month_range("2020-11", "2021-02") == ["2020-11", "2020-12", "2021-01", "2021-02"]
