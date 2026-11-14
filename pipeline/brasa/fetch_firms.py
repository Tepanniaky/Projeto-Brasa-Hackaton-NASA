"""Aquisição dos arquivos anuais por país do NASA FIRMS (sem MAP_KEY).

Uso (somente biblioteca padrão, pode rodar antes do ambiente virtual):

    python -m brasa.fetch_firms --years 2020-2025 --products modis viirs-jpss1 \
        --out ../data/raw/firms

O arquivo nacional (Brasil) é lido em streaming. O script:
  1. calcula o SHA-256 do arquivo COMPLETO e compara com o cabeçalho
     ``x-amz-meta-sha256`` publicado pelo servidor;
  2. grava apenas as linhas dentro de um retângulo envolvente (bbox) da região
     piloto, sem alterar nenhum campo (recorte bruto, não filtrado por qualidade);
  3. registra um manifesto JSON com URL, datas, hashes e contagens.

O recorte espacial fino (polígonos do IBGE) e os critérios de qualidade são
aplicados depois, em ``brasa.ingest``. Assim o arquivo bruto continua auditável.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import io
import json
import sys
import urllib.request
from pathlib import Path

BASE_URL = "https://firms.modaps.eosdis.nasa.gov/data/country"
COUNTRY = "Brazil"
# bbox da Mesorregião Extremo Oeste Baiano (IBGE 2901) com margem de 0,1°.
DEFAULT_BBOX = (-46.68, -15.37, -43.34, -10.00)  # (lon_min, lat_min, lon_max, lat_max)
USER_AGENT = "brasa-pipeline/0.1 (research prototype)"


def country_url(product: str, year: int, country: str = COUNTRY) -> str:
    return f"{BASE_URL}/{product}/{year}/{product}_{year}_{country}.csv"


def parse_years(spec: str) -> list[int]:
    if "-" in spec:
        a, b = spec.split("-", 1)
        return list(range(int(a), int(b) + 1))
    return [int(y) for y in spec.split(",")]


def in_bbox(lon: float, lat: float, bbox: tuple[float, float, float, float]) -> bool:
    return bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3]


def fetch_one(product: str, year: int, out_dir: Path, bbox, chunk: int = 1 << 20) -> dict:
    url = country_url(product, year)
    out_dir.mkdir(parents=True, exist_ok=True)
    subset_path = out_dir / f"{product}_{year}_{COUNTRY}_bbox.csv"
    tmp_path = subset_path.with_suffix(".csv.part")

    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    sha = hashlib.sha256()
    n_total = n_kept = 0
    size = 0
    with urllib.request.urlopen(req, timeout=120) as resp:
        headers = {k.lower(): v for k, v in resp.headers.items()}

        def chunks():
            nonlocal size
            while True:
                block = resp.read(chunk)
                if not block:
                    return
                size += len(block)
                sha.update(block)
                yield block

        # Decodifica em streaming linha a linha sem carregar o arquivo inteiro.
        raw = _ChunkReader(chunks())
        text = io.TextIOWrapper(raw, encoding="utf-8", newline="")
        reader = csv.reader(text)
        header = next(reader)
        i_lat, i_lon = header.index("latitude"), header.index("longitude")
        with tmp_path.open("w", encoding="utf-8", newline="") as fh:
            writer = csv.writer(fh, lineterminator="\n")
            writer.writerow(header)
            for row in reader:
                if not row:
                    continue
                n_total += 1
                if in_bbox(float(row[i_lon]), float(row[i_lat]), bbox):
                    writer.writerow(row)
                    n_kept += 1
    tmp_path.replace(subset_path)

    computed = sha.hexdigest()
    server_sha = headers.get("x-amz-meta-sha256")
    subset_sha = hashlib.sha256(subset_path.read_bytes()).hexdigest()
    return {
        "product": product,
        "year": year,
        "source_url": url,
        "retrieved_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "http_last_modified": headers.get("last-modified"),
        "http_etag": headers.get("etag"),
        "source_bytes": size,
        "source_sha256": computed,
        "server_sha256": server_sha,
        "sha256_verified": server_sha is not None and server_sha == computed,
        "source_rows": n_total,
        "bbox": list(bbox),
        "subset_file": subset_path.name,
        "subset_rows": n_kept,
        "subset_sha256": subset_sha,
    }


class _ChunkReader(io.RawIOBase):
    """Adapta um gerador de blocos de bytes para a interface de arquivo binário."""

    def __init__(self, gen):
        self._gen = gen
        self._buf = b""

    def readable(self) -> bool:  # pragma: no cover - interface
        return True

    def readinto(self, b) -> int:
        while not self._buf:
            try:
                self._buf = next(self._gen)
            except StopIteration:
                return 0
        n = min(len(b), len(self._buf))
        b[:n] = self._buf[:n]
        self._buf = self._buf[n:]
        return n


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--years", default="2020-2025")
    ap.add_argument("--products", nargs="+", default=["modis", "viirs-jpss1"])
    ap.add_argument("--out", type=Path, default=Path("../data/raw/firms"))
    ap.add_argument("--bbox", type=float, nargs=4, default=DEFAULT_BBOX,
                    metavar=("LON_MIN", "LAT_MIN", "LON_MAX", "LAT_MAX"))
    ap.add_argument("--skip-existing", action="store_true")
    args = ap.parse_args(argv)

    manifest_path = args.out / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"files": []}
    done = {(f["product"], f["year"]) for f in manifest["files"]}
    for product in args.products:
        for year in parse_years(args.years):
            if args.skip_existing and (product, year) in done:
                print(f"[skip] {product} {year}")
                continue
            print(f"[fetch] {product} {year} ...", flush=True)
            info = fetch_one(product, year, args.out / product, tuple(args.bbox))
            print(f"   rows {info['source_rows']:,} -> bbox {info['subset_rows']:,}; "
                  f"sha256 verified={info['sha256_verified']}", flush=True)
            manifest["files"] = [f for f in manifest["files"]
                                 if (f["product"], f["year"]) != (product, year)] + [info]
            manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
            if not info["sha256_verified"]:
                print("   AVISO: hash do servidor ausente ou divergente", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
