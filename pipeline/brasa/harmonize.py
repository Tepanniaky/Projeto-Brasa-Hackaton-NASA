"""Harmonização experimental MODIS/Aqua <- VIIRS/NOAA-20 em dias-célula.

Referência (variável-alvo): dias com detecção MODIS/Aqua por fragmento-mês.
Preditor: dias com detecção VIIRS/NOAA-20 no mesmo fragmento-mês.

Métodos comparados, todos ajustados SÓ com os anos de treino:
  * ``sem_ajuste``: usa o valor VIIRS diretamente como estimativa do MODIS;
  * ``razao``: multiplica o VIIRS por k = soma(MODIS)/soma(VIIRS) do treino;
  * ``binomial_negativa``: NB2 com log μ = log(área) + β0 + β1·log1p(VIIRS) + γ_mês.

Isto aproxima a escala de detecção entre sensores. Não estima o número real de
incêndios, nem área queimada.
"""

from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy import stats
from statsmodels.discrete.discrete_model import NegativeBinomial, Poisson
from statsmodels.stats.diagnostic import acorr_ljungbox

from . import config

MIN_TRAIN_POSITIVE = 30  # mínimo de fragmentos-mês com MODIS > 0 para tentar o ajuste
Z90 = stats.norm.ppf(0.95)


def split_mask(panel: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    """Máscaras de treino e avaliação. Anos disjuntos por construção."""
    if set(config.TRAIN_YEARS) & set(config.EVAL_YEARS):
        raise ValueError("anos de treino e avaliação se sobrepõem")
    train = panel["year"].isin(config.TRAIN_YEARS) & ~panel["month"].isin(config.EXCLUDE_FROM_FIT_MONTHS)
    evaluation = panel["year"].isin(config.EVAL_YEARS)
    return train, evaluation


def design(panel: pd.DataFrame) -> pd.DataFrame:
    """Matriz de projeto fixa: constante, log1p(VIIRS) e 11 dummies de mês (janeiro = base)."""
    X = pd.DataFrame({"const": 1.0, "log1p_viirs": np.log1p(panel["pred_days"].to_numpy(float))},
                     index=panel.index)
    for m in range(2, 13):
        X[f"mes_{m:02d}"] = (panel["moy"].to_numpy() == m).astype(float)
    return X


def offset(panel: pd.DataFrame) -> np.ndarray:
    return np.log(panel["area_frac"].to_numpy(float))


def predict_nb(params: dict, panel: pd.DataFrame) -> np.ndarray:
    """Aplica os coeficientes exportados. É a mesma fórmula documentada no contrato."""
    X = design(panel)
    beta = np.array([params[c] for c in X.columns])
    return np.exp(X.to_numpy() @ beta + offset(panel))


def fit(panel: pd.DataFrame) -> dict:
    """Ajusta os três métodos só no treino e devolve parâmetros e diagnósticos."""
    train, _ = split_mask(panel)
    tr = panel.loc[train]
    result: dict = {"status": "ok", "n_treino": int(len(tr)),
                    "n_treino_modis_positivo": int((tr["ref_days"] > 0).sum())}
    if result["n_treino_modis_positivo"] < MIN_TRAIN_POSITIVE or tr["pred_days"].sum() == 0:
        result["status"] = "dados_insuficientes"
        result["motivo"] = (f"menos de {MIN_TRAIN_POSITIVE} fragmentos-mês com detecção MODIS no treino, "
                            "ou nenhuma detecção VIIRS")
        return result

    result["razao_k"] = float(tr["ref_days"].sum() / tr["pred_days"].sum())

    X = design(tr)
    y = tr["ref_days"].to_numpy(float)
    off = offset(tr)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        pois = Poisson(y, X, offset=off).fit(disp=0, maxiter=200)
        mu_p = pois.predict(X, offset=off)
        pearson_disp = float(np.sum((y - mu_p) ** 2 / mu_p) / pois.df_resid)
        nb_model = NegativeBinomial(y, X, loglike_method="nb2", offset=off)
        start = np.append(pois.params.to_numpy(), 0.5)
        nb = nb_model.fit(start_params=start, method="bfgs", maxiter=500, disp=0)
    converged = bool(nb.mle_retvals.get("converged", False))
    params = {k: float(v) for k, v in nb.params.items() if k != "alpha"}
    alpha = float(nb.params["alpha"])
    ci = nb.conf_int()
    result["binomial_negativa"] = {
        "familia": "NegativeBinomial NB2 (statsmodels.discrete)",
        "formula": "log μ = log(area_frac) + const + β·log1p(viirs_dias) + Σ γ_mes",
        "params": params,
        "alpha": alpha,
        "ic95": {k: [float(ci.loc[k, 0]), float(ci.loc[k, 1])] for k in ci.index},
        "convergiu": converged,
        "aic": float(nb.aic),
        "aic_poisson": float(pois.aic),
        "lr_estatistica_fronteira": float(2 * (nb.llf - pois.llf)),
        "nota_lr": "α = 0 está na fronteira; não reportamos p-valor qui-quadrado ingênuo.",
        "dispersao_pearson_poisson": pearson_disp,
    }
    # Verificação: nossa fórmula reproduz o predict do statsmodels.
    mu_check = predict_nb(params, tr.iloc[:500])
    mu_sm = nb.predict(X.iloc[:500], offset=off[:500])
    result["binomial_negativa"]["formula_confere_predict"] = bool(np.allclose(mu_check, mu_sm, rtol=1e-9))
    return result


def predictions(panel: pd.DataFrame, fitted: dict) -> pd.DataFrame:
    """Previsões dos três métodos e a variância NB por fragmento-mês."""
    out = panel[["cell_id", "cod_mun", "month", "year", "ref_days", "pred_days"]].copy()
    out["sem_ajuste"] = panel["pred_days"].astype(float)
    if fitted.get("status") != "ok":
        return out
    out["razao"] = fitted["razao_k"] * panel["pred_days"].astype(float)
    mu = predict_nb(fitted["binomial_negativa"]["params"], panel)
    out["binomial_negativa"] = mu
    out["nb_var"] = mu + fitted["binomial_negativa"]["alpha"] * mu ** 2
    return out


METHODS = ("sem_ajuste", "razao", "binomial_negativa")
LEVEL_LABEL = {"estado_mes": "total mensal do estado", "municipio_ano": "total anual por município",
               "municipio_mes": "total mensal por município"}


def _metrics(obs: np.ndarray, pred: np.ndarray) -> dict:
    err = pred - obs
    tot_obs = float(obs.sum())
    return {
        "n": int(len(obs)),
        "mae": float(np.mean(np.abs(err))),
        "vies_medio": float(np.mean(err)),
        "erro_relativo_total": float((pred.sum() - tot_obs) / tot_obs) if tot_obs > 0 else None,
        "spearman": float(stats.spearmanr(obs, pred).statistic) if len(obs) > 2 and np.std(obs) > 0 and np.std(pred) > 0 else None,
    }


def evaluate(pred: pd.DataFrame, fitted: dict, gid: str) -> dict:
    """Métricas por divisão (treino/avaliação), ano e nível de agregação, com marcações."""
    if fitted.get("status") != "ok":
        return {"status": fitted.get("status"), "metricas": [], "marcacoes": [], "cobertura": []}
    train, evaluation = split_mask(pred.assign(moy=0))
    pred = pred.assign(divisao=np.where(train, "ajuste", np.where(evaluation, "avaliacao", "excluido")))
    rows, flags, coverage = [], [], []
    levels = {
        "estado_mes": ["month"],
        "municipio_ano": ["cod_mun", "year"],
        "municipio_mes": ["cod_mun", "month"],
    }
    for level, keys in levels.items():
        cols = ["ref_days", *METHODS, "nb_var"]
        group_keys = keys + ["divisao"] + ([] if "year" in keys else ["year"])
        agg = pred.groupby(group_keys)[cols].sum().reset_index()
        for (year, divisao), sub in agg.groupby(["year", "divisao"]):
            if divisao == "excluido":
                continue
            obs = sub["ref_days"].to_numpy(float)
            for m in METHODS:
                rows.append({"grade": gid, "nivel": level, "ano": int(year), "divisao": divisao,
                             "metodo": m, **_metrics(obs, sub[m].to_numpy(float))})
            sd = np.sqrt(sub["nb_var"].to_numpy(float))
            mu = sub["binomial_negativa"].to_numpy(float)
            inside = (obs >= mu - Z90 * sd) & (obs <= mu + Z90 * sd)
            coverage.append({"grade": gid, "nivel": level, "ano": int(year), "divisao": divisao,
                             "cobertura_ic90_nominal": 0.90, "cobertura_observada": float(inside.mean())})
    # Marcações automáticas: só anos de avaliação e níveis exibidos ao usuário.
    met = pd.DataFrame(rows)
    for (level, year), grp in met[met["divisao"] == "avaliacao"].groupby(["nivel", "ano"]):
        by = grp.set_index("metodo")["mae"]
        best_base = min(by["sem_ajuste"], by["razao"])
        if by["binomial_negativa"] >= best_base:
            which = "razão simples" if by["razao"] <= by["sem_ajuste"] else "sem ajuste"
            flags.append({"grade": gid, "nivel": level, "ano": int(year), "tipo": "ajuste_nao_melhora",
                          "mensagem": (f"Em {year} ({LEVEL_LABEL[level]}), o modelo não reduziu o erro "
                                       f"em relação a '{which}' (MAE {by['binomial_negativa']:.2f} × {best_base:.2f}).")})
    train_mae = met[(met["divisao"] == "ajuste") & (met["metodo"] == "binomial_negativa")].groupby("nivel")["mae"].mean()
    for (level, year), grp in met[(met["divisao"] == "avaliacao") & (met["metodo"] == "binomial_negativa")].groupby(["nivel", "ano"]):
        if level in train_mae and train_mae[level] > 0 and grp["mae"].iloc[0] > 1.5 * train_mae[level]:
            flags.append({"grade": gid, "nivel": level, "ano": int(year), "tipo": "degrada_fora_do_ajuste",
                          "mensagem": (f"Em {year} ({LEVEL_LABEL[level]}), o erro do modelo é "
                                       f"{grp['mae'].iloc[0] / train_mae[level]:.1f}× o erro médio dos anos de ajuste.")})
    for c in coverage:
        if c["divisao"] == "avaliacao" and c["cobertura_observada"] < 0.75:
            flags.append({"grade": gid, "nivel": c["nivel"], "ano": c["ano"], "tipo": "incerteza_subestimada",
                          "mensagem": (f"Em {c['ano']} ({LEVEL_LABEL[c['nivel']]}), só "
                                       f"{c['cobertura_observada']:.0%} dos valores observados caíram no intervalo de 90 %.")})
    return {"status": "ok", "metricas": rows, "marcacoes": flags, "cobertura": coverage}


def residual_diagnostics(pred: pd.DataFrame) -> dict:
    """Ljung-Box nos resíduos de Pearson mensais do estado, só no treino."""
    if "binomial_negativa" not in pred:
        return {}
    train, _ = split_mask(pred.assign(moy=0))
    s = pred.loc[train].groupby("month")[["ref_days", "binomial_negativa", "nb_var"]].sum()
    resid = (s["ref_days"] - s["binomial_negativa"]) / np.sqrt(s["nb_var"])
    lags = min(12, max(1, len(resid) // 3))
    lb = acorr_ljungbox(resid.to_numpy(), lags=[lags], return_df=True)
    return {"ljung_box_lag": int(lags), "ljung_box_p": float(lb["lb_pvalue"].iloc[0]),
            "nota": "Resíduos de Pearson da soma estadual mensal nos meses de ajuste; p < 0,05 indica autocorrelação não modelada."}


def _finite_or_none(v) -> float | None:
    return float(v) if v is not None and np.isfinite(v) else None


def _spearman(a, b) -> float | None:
    a, b = np.asarray(a, float), np.asarray(b, float)
    if len(a) < 3 or np.std(a) == 0 or np.std(b) == 0:
        return None
    return _finite_or_none(stats.spearmanr(a, b).statistic)


def sensor_comparability(monthly: pd.DataFrame) -> list[dict]:
    """H2: em qual unidade os dois sensores ficam mais próximos e mais estáveis entre anos?"""
    out = []
    st = monthly[monthly["cod_mun"] == config.STATE_CODE].assign(year=lambda d: d["month"].str[:4].astype(int))
    mun = monthly[monthly["cod_mun"] != config.STATE_CODE].assign(year=lambda d: d["month"].str[:4].astype(int))
    for metric in ("deteccoes", "dias_com_deteccao", "dias_celula_g5", "dias_celula_g10"):
        w = st.pivot_table(index="month", columns="sensor", values=metric, aggfunc="sum")
        y = st.pivot_table(index="year", columns="sensor", values=metric, aggfunc="sum")
        ratio_y = (y[config.PREDICTOR_SENSOR] / y[config.REFERENCE_SENSOR]).replace([np.inf], np.nan)
        my = mun.pivot_table(index=["cod_mun", "year"], columns="sensor", values=metric, aggfunc="sum")
        keep = (my[config.REFERENCE_SENSOR] > 0) | (my[config.PREDICTOR_SENSOR] > 0)
        out.append({
            "metrica": metric,
            "razao_viirs_modis_por_ano": {int(k): _finite_or_none(v) for k, v in ratio_y.items()},
            "cv_razao_anual": _finite_or_none(ratio_y.std() / ratio_y.mean()) if len(ratio_y.dropna()) > 1 else None,
            "spearman_estado_mes": _spearman(w[config.REFERENCE_SENSOR], w[config.PREDICTOR_SENSOR]),
            "spearman_municipio_ano": _spearman(my.loc[keep, config.REFERENCE_SENSOR], my.loc[keep, config.PREDICTOR_SENSOR]),
        })
    return out
