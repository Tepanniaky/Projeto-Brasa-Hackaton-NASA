import numpy as np
import pandas as pd

from brasa import aggregate, audit


def _ref(dates):
    d = pd.DataFrame({"acq_date_utc": dates})
    d["year"] = d["acq_date_utc"].str[:4].astype(int)
    d["semana"] = aggregate.team_week_index(d["acq_date_utc"]).to_numpy()
    return d


def test_audit_detects_exact_reproduction_and_band_misses():
    dates = ["2020-01-02"] * 3 + ["2020-12-31"] + ["2021-03-01"] * 2 + ["2022-09-01"] * 10
    ref = _ref(dates)
    w2020 = np.zeros(52); w2020[0] = 3; w2020[51] = 1
    w2021 = np.zeros(52); w2021[8] = 2
    team = {"calendario": {"anos": [2020, 2021, 2022], "valores": [w2020.tolist(), w2021.tolist(), [0] * 52]},
            "anual": [{"ano": 2020, "valor": 4, "min": 4, "max": 4},
                      {"ano": 2021, "valor": 2, "min": 2, "max": 2},
                      {"ano": 2022, "valor": 8.0, "min": 7.5, "max": 8.5}]}
    out = audit.audit_region(team, ref)
    assert out["reproduzida"] is True
    c2022 = [c for c in out["comparacao_anual"] if c["ano"] == 2022][0]
    assert c2022["modis_ta_observado"] == 10
    assert c2022["observado_dentro_da_faixa"] is False
    assert np.isclose(c2022["diferenca_relativa"], -0.2)
    assert c2022["origem_equipe"] == "VIIRS convertido"


def test_audit_flags_non_reproduction():
    ref = _ref(["2020-01-02"])
    team = {"calendario": {"anos": [2020], "valores": [[2] + [0] * 51]},
            "anual": [{"ano": 2020, "valor": 2, "min": 2, "max": 2}]}
    assert audit.audit_region(team, ref)["reproduzida"] is False
