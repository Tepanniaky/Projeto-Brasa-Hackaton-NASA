"""Gera o registro "afirmação → evidência" da metodologia de harmonização.

Os números vêm direto dos JSONs gerados pelo pipeline (nada é digitado à mão).
Formato compatível com o auditor da skill scientific-writing:

    python .claude/skills/scientific-writing/scripts/audit_claims.py \
        docs/evidencia/harmonizacao.md docs/evidencia/afirmacoes.csv docs/evidencia/fontes.json

Uso: python -m brasa.evidence
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
from pathlib import Path

from . import config

OUT = config.ROOT / "docs" / "evidencia"
DATA = config.WEB_DATA_DIR / "real"
TODAY = "2026-11-14"
VERIFIER = "agente de IA (Claude) na sessão de 2026-11-14; requer revisão humana da OPP Team"

_MARK = re.compile(r"\[(?:claim:C[0-9]+|evidence:[E0-9, ]+|@E[0-9]+)\]")


def _hash(line: str) -> str:
    return hashlib.sha256(" ".join(_MARK.sub("", line).split()).encode("utf-8")).hexdigest()


def _sha_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def pct(v: float) -> str:
    return f"{v * 100:+.0f} %".replace("+-", "−").replace("-", "−")


def hour(h: float) -> str:
    return f"{int(h)}h{round((h - int(h)) * 60):02d}"


def sources() -> list[dict]:
    def src(eid, title, authors, year, stype, url, locator, conf="public"):
        return {"authors": authors, "confidentiality": conf, "evidence_id": eid,
                "identifiers": {"doi": "", "isbn": "", "pmcid": "", "pmid": "", "url": url},
                "locator": locator, "source_type": stype, "title": title,
                "verification": {"source_opened": True, "status": "verified", "verified_by": VERIFIER,
                                 "verified_on": TODAY}, "year": year}
    return [
        src("E001", "MODIS Collection 6 and Collection 6.1 Active Fire Product User's Guide, Version 1.0",
            ["Louis Giglio", "Wilfrid Schroeder", "Joanne V. Hall", "Christopher O. Justice"], 2021, "report",
            "https://earthdata.nasa.gov/s3fs-public/2023-09/MODIS_C6_C6.1_Fire_User_Guide_1.0.pdf",
            "Tabela 11 e §8.4.2 (classes de confiança); §5.5.1 (nome CCC.VV); §7.1.1 (vieses < 8 dias); §7.2.4 (falha do Aqua, ago/2020)"),
        src("E002", "Collection 2 VIIRS 375-m Active Fire Product User's Guide, Version 1.2",
            ["Wilfrid Schroeder", "Louis Giglio", "Joanne Hall"], 2025, "report",
            "https://earthdata.nasa.gov/s3fs-public/2025-06/VIIRS_C2_AF-375m_User_Guide_1.2.pdf",
            "§2, classes 7–9 (confiança baixa: reflexo solar e Anomalia Magnética do Atlântico Sul); §6.1 (erro no campo Type)"),
        src("E003", "FIRMS: active fire data attributes (MODIS e VIIRS)", ["NASA Earthdata"], None, "webpage",
            "https://www.earthdata.nasa.gov/data/tools/firms/active-fire-data-attributes-modis-viirs",
            "atributos acq_time (UTC), confidence, version, type"),
        src("E004", "BRASA: manifesto do processamento (manifest.json)", ["OPP Team"], 2026, "dataset",
            "web/public/data/real/manifest.json", f"campos qualidade, deriva_passagem; sha256 {_sha_file(DATA / 'manifest.json')}"),
        src("E005", "BRASA: harmonização experimental e avaliação (harmonizacao.json)", ["OPP Team"], 2026, "dataset",
            "web/public/data/real/harmonizacao.json", f"grades.*.avaliacao, comparabilidade; sha256 {_sha_file(DATA / 'harmonizacao.json')}"),
        src("E006", "BRASA: auditoria da série da equipe (auditoria_equipe.json)", ["OPP Team"], 2026, "dataset",
            "web/public/data/real/auditoria_equipe.json", f"sintese_2022_2025_municipios_com_50_ou_mais; sha256 {_sha_file(DATA / 'auditoria_equipe.json')}"),
        src("E007", "Aqua mission page", ["NASA Science"], None, "webpage", "https://science.nasa.gov/mission/aqua",
            "texto sobre o fim das manobras de compensação de arrasto (dez/2021) e a deriva para passagens mais tarde"),
        src("E008", "Roteiro do front-end: Calendário de Queimadas da Bahia", ["OPP Team"], 2026, "other",
            "roteiro e dados para o projeto/Roteiro do front-end Calendário de Queimadas da Bahia.pdf",
            "seção Resumo (afirmação de validação com erro médio de 2,2 %)", conf="restricted"),
    ]


def build() -> tuple[str, list[dict]]:
    man = json.loads((DATA / "manifest.json").read_text())
    harm = json.loads((DATA / "harmonizacao.json").read_text())
    aud = json.loads((DATA / "auditoria_equipe.json").read_text())

    kept = {}
    for q in man["qualidade"]:
        kept[q["sensor"]] = kept.get(q["sensor"], 0) + q["mantidos"]
    versions = {(q["sensor"], q["ano"]): ",".join(q["versoes"]) for q in man["qualidade"]}
    drift = {(d["satelite"], d["ano"]): d["hora_local_mediana"] for d in man["deriva_passagem"]}

    def wins(gid, level):
        rows = [m for m in harm["grades"][gid]["avaliacao"]["metricas"] if m["nivel"] == level and m["divisao"] == "avaliacao"]
        years = sorted({r["ano"] for r in rows})
        n = 0
        for y in years:
            by = {r["metodo"]: r["mae"] for r in rows if r["ano"] == y}
            n += by["binomial_negativa"] < min(by["sem_ajuste"], by["razao"])
        return n, len(years)

    comp = {c["metrica"]: c for c in harm["comparabilidade"]}
    def ratio_range(m):
        v = [x for x in comp[m]["razao_viirs_modis_por_ano"].values() if x is not None]
        return f"{min(v):.1f}× a {max(v):.1f}×".replace(".", ",")
    cov = [c["cobertura_observada"] for c in harm["grades"]["g10"]["avaliacao"]["cobertura"]
           if c["nivel"] == "estado_mes" and c["divisao"] == "avaliacao"]
    sint = aud["sintese_2022_2025_municipios_com_50_ou_mais"]
    meds = ", ".join(f"{y}: {pct(v['mediana_diferenca_relativa'])}" for y, v in sorted(sint.items()))
    inband = [v["fracao_observado_dentro_da_faixa"] for v in sint.values()]
    g10_mes, g10_ano, g5_mes = wins("g10", "estado_mes"), wins("g10", "municipio_ano"), wins("g5", "estado_mes")

    lines: list[tuple[str, str, str, list[str], str, str]] = [
        # (texto, seção, tipo, evidências, incerteza, intenção)
        (f"A referência do ajuste é o MODIS/Aqua e o preditor é o VIIRS/NOAA-20, ambos em dias-célula.", "metodo", "method", ["E005"], "not_applicable", "not_applicable"),
        (f"O ajuste usa {', '.join(map(str, harm['anos_ajuste']))} sem {' e '.join(harm['meses_excluidos_do_ajuste'])} (falha do Aqua) e a avaliação usa {', '.join(map(str, harm['anos_avaliacao']))}.", "metodo", "method", ["E005", "E001"], "not_applicable", "not_applicable"),
        ("No MODIS, confiança abaixo de 30 % é classe baixa, de 30 % a 79 % é nominal e a partir de 80 % é alta; o BRASA mantém nominal e alta.", "qualidade", "factual", ["E001"], "not_applicable", "not_applicable"),
        ("No VIIRS 375 m, a confiança baixa está associada a reflexo solar e à Anomalia Magnética do Atlântico Sul; o BRASA mantém nominal e alta.", "qualidade", "factual", ["E002"], "not_applicable", "not_applicable"),
        ("Os campos acq_date e acq_time do FIRMS estão em UTC; o BRASA converte para a data local de America/Bahia.", "tempo", "factual", ["E003"], "not_applicable", "not_applicable"),
        (f"Ficaram {kept.get('MODIS_AQUA', 0):,} detecções MODIS/Aqua e {kept.get('VIIRS_NOAA20', 0):,} VIIRS/NOAA-20 na Bahia em 2020–2025 após os critérios de qualidade.".replace(",", "."), "dados", "numeric", ["E004"], "not_applicable", "descriptive"),
        (f"A versão MODIS é {versions.get(('MODIS_AQUA', 2020))} em 2020–2022 e {versions.get(('MODIS_AQUA', 2023))} em 2023–2025, isto é, Collection 6 e depois Collection 6.1.", "dados", "result", ["E004", "E001"], "not_applicable", "descriptive"),
        (f"O horário local mediano das detecções diurnas do Aqua passou de {hour(drift[('Aqua', 2020)])} em 2020 para {hour(drift[('Aqua', 2025)])} em 2025, enquanto o NOAA-20 ficou em {hour(drift[('N20', 2025)])}.", "deriva", "result", ["E004"], "not_estimated", "descriptive"),
        ("O Aqua encerrou as manobras de compensação de arrasto em dezembro de 2021 e deriva para passagens mais tarde.", "deriva", "factual", ["E007"], "not_applicable", "not_applicable"),
        (f"A razão anual VIIRS ÷ MODIS no estado variou de {ratio_range('deteccoes')} em detecções e de {ratio_range('dias_celula_g10')} em dias-célula de 10 km.", "comparabilidade", "result", ["E005"], "not_estimated", "exploratory"),
        (f"O coeficiente de variação anual dessa razão foi {comp['deteccoes']['cv_razao_anual']:.3f} em detecções e {comp['dias_celula_g10']['cv_razao_anual']:.3f} em dias-célula de 10 km, então a agregação em dias-célula não estabilizou a relação (H2 não confirmada).".replace("0.", "0,"), "comparabilidade", "result", ["E005"], "not_estimated", "exploratory"),
        (f"Na grade de 10 km a binomial negativa superou a melhor linha de base em {g10_mes[0]} de {g10_mes[1]} anos de avaliação no total mensal do estado e em {g10_ano[0]} de {g10_ano[1]} no total anual por município.", "avaliacao", "result", ["E005"], "not_estimated", "exploratory"),
        (f"Na grade de 5 km a binomial negativa superou a melhor linha de base em {g5_mes[0]} de {g5_mes[1]} anos de avaliação no total mensal do estado.", "avaliacao", "result", ["E005"], "not_estimated", "exploratory"),
        (f"O intervalo aproximado de 90 % cobriu de {min(cov) * 100:.0f} % a {max(cov) * 100:.0f} % dos meses estaduais nos anos de avaliação, então subestima a incerteza.", "avaliacao", "result", ["E005"], "not_estimated", "exploratory"),
        (f"A série semanal da equipe de 2020–2021 foi reproduzida exatamente em {aud['municipios_reproduzidos_2020_2021']} de {aud['municipios_auditados']} municípios como contagem MODIS Terra+Aqua sem filtro por data UTC.", "auditoria", "result", ["E006"], "not_applicable", "descriptive"),
        (f"Em municípios com ao menos 50 detecções MODIS no ano, a mediana da diferença entre a série da equipe e o MODIS observado foi {meds}.", "auditoria", "result", ["E006"], "not_estimated", "descriptive"),
        (f"O MODIS observado ficou dentro da faixa publicada pela equipe em {min(inband) * 100:.0f} % a {max(inband) * 100:.0f} % desses municípios, conforme o ano.", "auditoria", "result", ["E006"], "not_estimated", "descriptive"),
        ("A deriva do Aqua em direção ao pico vespertino de fogo é uma explicação plausível para o MODIS observado ficar acima da série convertida, mas não foi testada.", "interpretacao", "interpretive", ["E004", "E007"], "high", "exploratory"),
        ("A validação com erro médio de 2,2 % no total anual informada no roteiro da equipe não foi reproduzida, porque os scripts e o protocolo não estavam disponíveis.", "auditoria", "declaration", ["E008"], "not_applicable", "not_applicable"),
    ]
    md = ["# Harmonização MODIS × VIIRS: afirmações e evidências", "",
          "<!-- Gerado por `python -m brasa.evidence` a partir dos JSONs do pipeline. Não edite à mão. -->", "",
          "Cada linha abaixo é uma afirmação registrada em `afirmacoes.csv`, ligada às fontes de `fontes.json`.", ""]
    rows = []
    for i, (text, section, kind, ev, unc, intent) in enumerate(lines, start=1):
        cid = f"C{i:03d}"
        line = f"- {text} [claim:{cid}] [evidence:{', '.join(ev)}]"
        md.append(line)
        rows.append({"claim_id": cid, "section": section, "claim_kind": kind, "claim_text_sha256": _hash(line),
                     "evidence_ids": ";".join(ev), "verification_status": "verified", "uncertainty": unc,
                     "analysis_intent": intent})
    return "\n".join(md) + "\n", rows


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    md, rows = build()
    (OUT / "harmonizacao.md").write_text(md, encoding="utf-8")
    with (OUT / "afirmacoes.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    (OUT / "fontes.json").write_text(json.dumps({"schema_version": "1.0", "sources": sources()}, indent=2, ensure_ascii=False),
                                     encoding="utf-8")
    print(f"{len(rows)} afirmações -> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
