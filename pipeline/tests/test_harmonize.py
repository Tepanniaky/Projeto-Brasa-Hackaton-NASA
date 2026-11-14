import numpy as np
import pandas as pd

from brasa import config, harmonize
from conftest import make_panel


def test_train_and_eval_years_are_disjoint_and_exclusions_respected():
    p = make_panel()
    train, ev = harmonize.split_mask(p)
    assert not (train & ev).any()
    assert set(p.loc[train, "year"]) == set(config.TRAIN_YEARS)
    assert set(p.loc[ev, "year"]) == set(config.EVAL_YEARS)
    assert not p.loc[train, "month"].isin(config.EXCLUDE_FROM_FIT_MONTHS).any()


def test_fit_has_no_leakage_from_evaluation_years():
    p = make_panel()
    fitted_a = harmonize.fit(p)
    corrupted = p.copy()
    ev = corrupted["year"].isin(config.EVAL_YEARS)
    corrupted.loc[ev, "ref_days"] = corrupted.loc[ev, "ref_days"] * 50 + 7  # valores absurdos
    fitted_b = harmonize.fit(corrupted)
    assert fitted_a["status"] == fitted_b["status"] == "ok"
    assert fitted_a["razao_k"] == fitted_b["razao_k"]
    pa, pb = fitted_a["binomial_negativa"]["params"], fitted_b["binomial_negativa"]["params"]
    assert all(np.isclose(pa[k], pb[k]) for k in pa)


def test_exported_formula_matches_statsmodels_and_recovers_slope_direction():
    fitted = harmonize.fit(make_panel())
    nb = fitted["binomial_negativa"]
    assert nb["formula_confere_predict"] is True
    assert nb["params"]["log1p_viirs"] > 0
    assert 0.2 < fitted["razao_k"] < 0.7


def test_insufficient_data_is_reported_not_faked():
    p = make_panel(n_frag=2)
    p["ref_days"] = 0
    fitted = harmonize.fit(p)
    assert fitted["status"] == "dados_insuficientes"
    pred = harmonize.predictions(p, fitted)
    assert "binomial_negativa" not in pred
    ev = harmonize.evaluate(pred, fitted, "g10")
    assert ev["metricas"] == [] and ev["status"] == "dados_insuficientes"


def test_flags_when_model_does_not_beat_baselines():
    p = make_panel()
    fitted = harmonize.fit(p)
    pred = harmonize.predictions(p, fitted)
    # força um modelo ruim nos anos de avaliação
    ev = pred["year"].isin(config.EVAL_YEARS)
    pred.loc[ev, "binomial_negativa"] = pred.loc[ev, "ref_days"] * 3 + 5
    out = harmonize.evaluate(pred, fitted, "g10")
    tipos = {(f["tipo"], f["ano"]) for f in out["marcacoes"]}
    for y in config.EVAL_YEARS:
        assert ("ajuste_nao_melhora", y) in tipos
    # métricas de treino e avaliação separadas e rotuladas
    divs = {m["divisao"] for m in out["metricas"]}
    assert divs == {"ajuste", "avaliacao"}
    assert all(m["divisao"] == ("ajuste" if m["ano"] in config.TRAIN_YEARS else "avaliacao")
               for m in out["metricas"])
