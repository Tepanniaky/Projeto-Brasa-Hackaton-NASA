"""CLI do pipeline BRASA.

    python -m brasa.cli build --dataset real          # FIRMS + IBGE -> web/public/data/real
    python -m brasa.cli import-firms --file X.csv --product modis --dest ../data/raw/firms_bahia
    python -m brasa.cli example --out /tmp/saida      # roda o exemplo pequeno de pipeline/examples

O contrato dos arquivos gerados está em docs/DATA_CONTRACTS.md.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import shutil
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

from . import aggregate, audit, config, harmonize, ingest, spatial

PERIOD = ("2020-01", "2025-12")
SENSOR_IDS = list(config.SENSORS)


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def _round(a, nd=2):
    return [round(float(v), nd) for v in a]


def build(raw_dir: Path, ibge_geojson: Path, ibge_names: Path, out_dir: Path, dataset_kind: str,
          team_dir: Path | None, period: tuple[str, str] = PERIOD) -> dict:
    t0 = time.time()
    months = aggregate.month_range(*period)
    log(f"lendo municípios: {ibge_geojson.name}")
    munis = spatial.load_municipalities(ibge_geojson, ibge_names)
    munis_g = spatial.to_grid_crs(munis)

    log(f"lendo FIRMS de {raw_dir}")
    std, sources = ingest.load_raw_directory(raw_dir)
    log(f"  {len(std):,} linhas no recorte bruto")

    pts = spatial.points_frame(std)
    cod_mun, muni_audit = spatial.assign_municipality(pts, munis_g)
    reason = ingest.assign_drop_reason(std, in_region=cod_mun.notna())
    # Fora do período de análise: não é descarte de qualidade, só recorte temporal.
    in_period = std["date_local"].str[:7].between(*period)

    kept = std.loc[reason.isna() & in_period].copy()
    kept["cod_mun"] = cod_mun[kept.index]
    kept["x"] = pts.geometry.x[kept.index]
    kept["y"] = pts.geometry.y[kept.index]
    kept = aggregate.add_cells(kept)
    log(f"  {len(kept):,} detecções mantidas ({', '.join(f'{s}: {(kept.sensor == s).sum():,}' for s in SENSOR_IDS)})")

    cods = munis["cod_mun"].tolist()
    by_mun = aggregate.monthly_by_municipality(kept, cods, months, SENSOR_IDS)
    state = aggregate.monthly_state(kept, by_mun, months, SENSOR_IDS)
    monthly = pd.concat([state, by_mun], ignore_index=True)

    # Harmonização experimental, por grade
    harm: dict = {"status": "ok", "grades": {}}
    harm_series: dict[str, dict[str, pd.DataFrame]] = {}
    for gid, size in config.GRID_SIZES_M.items():
        log(f"grade {gid}: fragmentos")
        frags = spatial.build_fragments(munis_g, size)
        panel = aggregate.fragment_month_panel(kept, frags, months, gid)
        log(f"grade {gid}: {len(frags):,} fragmentos, painel {len(panel):,} linhas; ajustando")
        fitted = harmonize.fit(panel)
        pred = harmonize.predictions(panel, fitted)
        ev = harmonize.evaluate(pred, fitted, gid)
        diag = harmonize.residual_diagnostics(pred)
        harm["grades"][gid] = {"tamanho_m": size, "fragmentos": int(len(frags)),
                               "dias_fora_de_fragmento": panel.attrs.get("dias_fora_de_fragmento", 0),
                               "ajuste": fitted, "avaliacao": ev, "diagnosticos": diag}
        if fitted.get("status") == "ok":
            mun_m = pred.groupby(["cod_mun", "month"])[["binomial_negativa", "nb_var"]].sum()
            st_m = pred.groupby("month")[["binomial_negativa", "nb_var"]].sum()
            harm_series[gid] = {"mun": mun_m, "estado": st_m}
        else:
            harm["status"] = fitted.get("status")
    harm["comparabilidade"] = harmonize.sensor_comparability(monthly)
    harm.update({
        "referencia": config.REFERENCE_SENSOR, "preditor": config.PREDICTOR_SENSOR,
        "unidade": "dias-célula (fragmento célula ∩ município × dia local com ≥ 1 detecção)",
        "anos_ajuste": list(config.TRAIN_YEARS), "anos_avaliacao": list(config.EVAL_YEARS),
        "meses_excluidos_do_ajuste": list(config.EXCLUDE_FROM_FIT_MONTHS),
        "intervalo": "90 % aproximado: μ ± 1,645·√Σ(μ + αμ²), supondo independência entre fragmentos",
        "aviso": ("Aproximação estatística entre escalas de detecção. Não estima o número real de "
                  "incêndios nem área queimada."),
    })
    harm["grade_padrao"] = _choose_grid(harm)

    # Auditoria da camada A
    team_audit = None
    if team_dir is not None:
        log("auditando a série da equipe")
        team_audit = audit.audit_team(team_dir, std, cod_mun, munis)

    # ---- exportação ----
    out_dir.mkdir(parents=True, exist_ok=True)
    names = dict(zip(munis["cod_mun"], munis["nome"]))
    names[config.STATE_CODE] = config.STATE_NAME
    areas = dict(zip(munis["cod_mun"], (munis_g.geometry.area / 1e6).round(1)))  # km², CRS de área igual
    areas[config.STATE_CODE] = round(float(sum(areas.values())), 1)
    ref_month = None
    if team_dir is not None:
        ref = audit.team_reference_counts(std, cod_mun)
        ref_month = ref.groupby(["cod_mun", "month_utc"]).size()
        ref_state = ref.groupby("month_utc").size()

    regioes = {}
    for cod in [config.STATE_CODE, *cods]:
        sub = monthly[monthly["cod_mun"] == cod]
        series = {}
        for s in SENSOR_IDS:
            ss = sub[sub["sensor"] == s].set_index("month").reindex(months)
            series[s] = {m: ss[m].astype(int).tolist() for m in aggregate.ALL_METRICS}
        h = {}
        for gid, hs in harm_series.items():
            src = hs["estado"] if cod == config.STATE_CODE else hs["mun"].xs(cod, level="cod_mun") \
                if cod in hs["mun"].index.get_level_values(0) else None
            if src is None:
                continue
            src = src.reindex(months).fillna(0)
            h[gid] = {"estimativa": _round(src["binomial_negativa"]), "dp": _round(np.sqrt(src["nb_var"]))}
        item = {"nome": names[cod], "area_km2": float(areas[cod]), "series": series, "harmonizado": h or None}
        if ref_month is not None:
            r = ref_state if cod == config.STATE_CODE else (ref_month.xs(cod, level=0) if cod in ref_month.index.get_level_values(0) else pd.Series(dtype=int))
            item["referencia_equipe_modis_ta"] = r.reindex(months, fill_value=0).astype(int).tolist()
        regioes[cod] = item

    files = {"serie_mensal": "serie_mensal.json", "harmonizacao": "harmonizacao.json"}
    _dump(out_dir / files["serie_mensal"], {"schema_version": config.SCHEMA_VERSION, "meses": months,
                                            "sensores": SENSOR_IDS, "regioes": regioes})
    _dump(out_dir / files["harmonizacao"], harm)
    if team_audit is not None:
        files["auditoria_equipe"] = "auditoria_equipe.json"
        _dump(out_dir / files["auditoria_equipe"], team_audit)

    manifest = {
        "schema_version": config.SCHEMA_VERSION,
        "pipeline_version": config.PIPELINE_VERSION,
        "dataset_kind": dataset_kind,
        "gerado_em_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "periodo": {"inicio": period[0], "fim": period[1]},
        "fuso": config.LOCAL_TZ,
        "definicao_dia": ("Data civil local (America/Bahia, UTC−3) obtida de acq_date + acq_time (UTC) "
                          "por conversão de fuso; as passagens noturnas (~01h30 local) contam no dia local em que ocorrem."),
        "sensores": [{"id": s.id, "rotulo": s.label, "instrumento": s.instrument, "satelite": s.satellite,
                      "produto": s.source_product, "pixel_nominal_m": s.nominal_pixel_m,
                      "regra_qualidade": s.quality_rule, "tipo_confianca": s.confidence_kind}
                     for s in config.SENSORS.values()],
        "grades": [{"id": g, "tamanho_m": size, "crs": config.GRID_CRS,
                    "fragmentos": harm["grades"][g]["fragmentos"]} for g, size in config.GRID_SIZES_M.items()],
        "grade_padrao": harm["grade_padrao"],
        "metricas": METRICS_DOC,
        "fontes_firms": [{k: f.get(k) for k in ("product", "year", "source_url", "http_last_modified",
                                                "source_sha256", "sha256_verified", "source_rows",
                                                "subset_rows", "retrieved_at_utc")} for f in sources],
        "fontes_ibge": {"malha": ibge_geojson.name, "sha256": ingest.sha256_file(ibge_geojson),
                        "nomes": ibge_names.name, "crs": config.SOURCE_CRS_IBGE},
        "indisponibilidades": config.KNOWN_GAPS,
        "qualidade": audit.quality_summary(std, reason.where(in_period | reason.notna(), "fora_do_periodo")),
        "deriva_passagem": audit.overpass_drift(std[std["satellite"].isin(["Aqua", "Terra", "N20"])]),
        "atribuicao_municipio": muni_audit,
        "arquivos": files,
        "duracao_s": round(time.time() - t0, 1),
    }
    _dump(out_dir / "manifest.json", manifest)
    log(f"concluído em {manifest['duracao_s']} s -> {out_dir}")
    return manifest


METRICS_DOC = [
    {"id": "deteccoes", "rotulo": "Detecções (focos)", "aditiva": True,
     "descricao": "Registros que passaram nos critérios de qualidade. Um foco é um pixel com fogo, não um incêndio."},
    {"id": "dias_com_deteccao", "rotulo": "Dias com detecção", "aditiva": False,
     "descricao": "Dias locais distintos com ao menos uma detecção na região. Não soma entre municípios."},
    {"id": "dias_celula_g5", "rotulo": "Dias-célula (5 km)", "aditiva": True,
     "descricao": "Pares (célula de 5 km ∩ município, dia local) com ao menos uma detecção."},
    {"id": "dias_celula_g10", "rotulo": "Dias-célula (10 km)", "aditiva": True,
     "descricao": "Pares (célula de 10 km ∩ município, dia local) com ao menos uma detecção."},
]


def _choose_grid(harm: dict) -> str:
    """Regra determinística: menor MAE estado-mês da NB nos anos de avaliação; empate -> 10 km."""
    scores = {}
    for gid, g in harm["grades"].items():
        rows = [m for m in g["avaliacao"].get("metricas", [])
                if m["nivel"] == "estado_mes" and m["divisao"] == "avaliacao" and m["metodo"] == "binomial_negativa"]
        if rows:
            # MAE relativo ao total observado, para comparar grades de escalas diferentes
            scores[gid] = float(np.mean([abs(r["erro_relativo_total"] or 0) for r in rows]))
    if not scores:
        return "g10"
    return min(scores, key=lambda k: (scores[k], 0 if k == "g10" else 1))


def _dump(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False))


def import_firms(file: Path, product: str, dest: Path) -> dict:
    """Registra um CSV oficial baixado manualmente do FIRMS (ex.: Archive Download)."""
    raw = ingest.read_firms_csv(file)
    years = sorted(raw["acq_date"].str[:4].unique())
    folder = dest / f"importado_{product}"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / file.name
    shutil.copyfile(file, target)
    digest = ingest.sha256_file(target)
    manifest_path = dest / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"files": []}
    entry = {"product": product, "year": int(years[0]) if len(years) == 1 else None, "anos": years,
             "folder": folder.name, "source_url": None, "origem": "importação manual de arquivo oficial FIRMS",
             "retrieved_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
             "source_sha256": digest, "server_sha256": None, "sha256_verified": False,
             "source_rows": int(len(raw)), "subset_file": target.name, "subset_rows": int(len(raw)),
             "subset_sha256": digest}
    manifest["files"] = [f for f in manifest["files"] if f.get("subset_file") != target.name] + [entry]
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    return entry


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="brasa")
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="processa FIRMS + IBGE e gera os JSON do frontend")
    b.add_argument("--dataset", choices=["real"], default="real")
    b.add_argument("--team-dir", type=Path, default=config.ROOT / "web" / "public" / "api",
                   help="pasta da camada A (api/ da equipe) para auditoria; ignorada se não existir")
    i = sub.add_parser("import-firms", help="registra um CSV oficial FIRMS baixado manualmente")
    i.add_argument("--file", type=Path, required=True)
    i.add_argument("--product", choices=["modis", "viirs-jpss1"], required=True)
    i.add_argument("--dest", type=Path, default=config.DATA_DIR / "raw" / "firms_bahia")
    e = sub.add_parser("example", help="roda o pipeline no exemplo pequeno de pipeline/examples")
    e.add_argument("--out", type=Path, required=True)
    args = ap.parse_args(argv)

    if args.cmd == "build":
        p = config.dataset_paths(args.dataset)
        team = args.team_dir if (args.team_dir / "estado.json").exists() else None
        build(p.raw_firms, p.ibge_municipios, p.ibge_nomes, p.out_dir, "real", team)
    elif args.cmd == "import-firms":
        print(json.dumps(import_firms(args.file, args.product, args.dest), indent=2, ensure_ascii=False))
    elif args.cmd == "example":
        ex = Path(__file__).resolve().parents[1] / "examples"
        p = config.dataset_paths("real")
        build(ex / "firms", p.ibge_municipios, p.ibge_nomes, args.out, "exemplo", None,
              period=("2024-09", "2024-09"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
