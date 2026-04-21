#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus

import duckdb
import httpx
from slugify import slugify
from supabase import create_client


CITIES: dict[str, tuple[float, float, float, float]] = {
    # North America
    "sf_bay_area": (-123.35585, 36.78850, -121.35585, 38.78850),
    "new_york": (-74.25884, 40.47658, -73.70023, 40.91763),
    "seattle": (-122.55, 47.35, -121.95, 47.85),
    "austin": (-97.93677, 30.09851, -97.56053, 30.51663),
    "boston": (-71.19124, 42.22791, -70.80449, 42.39698),
    "los_angeles": (-118.70, 33.55, -117.65, 34.25),
    "san_diego": (-117.30982, 32.53480, -116.90574, 33.11419),
    "chicago": (-87.94009, 41.64453, -87.52408, 42.02305),
    "washington_dc": (-77.11979, 38.79163, -76.90937, 38.99597),
    "miami": (-80.45, 25.55, -80.05, 26.20),
    "denver": (-105.10988, 39.61430, -104.59970, 39.91421),
    "portland": (-122.83675, 45.43254, -122.47203, 45.65288),
    "toronto": (-79.90, 43.57, -79.11, 43.86),
    "vancouver": (-123.25, 49.00, -122.60, 49.40),
    "mexico_city": (-99.36492, 19.04872, -98.94030, 19.59276),
    # South America
    "sao_paulo": (-46.82627, -24.00790, -46.36509, -23.35776),
    "medellin": (-75.71943, 6.16331, -75.47364, 6.37642),
    # Europe
    "london": (-0.51038, 51.28676, 0.33402, 51.69187),
    "berlin": (13.08835, 52.33824, 13.76116, 52.67551),
    "amsterdam": (4.72878, 52.27817, 5.07916, 52.43106),
    "lisbon": (-9.22984, 38.69140, -9.08633, 38.79676),
    "barcelona": (2.05250, 41.31704, 2.22836, 41.46791),
    "paris": (2.15, 48.72, 2.65, 49.05),
    "tbilisi": (44.59620, 41.61779, 45.01729, 41.84388),
    # Middle East
    "tel_aviv": (34.72875, 31.98872, 34.87574, 32.20292),
    "dubai": (55.05, 25.05, 55.50, 25.40),
    # Africa
    "nairobi": (36.66470, -1.44488, 37.10487, -1.16067),
    # South Asia
    "bangalore": (77.32553, 12.65849, 77.83696, 13.23468),
    "hyderabad": (78.30, 17.25, 78.65, 17.60),
    "mumbai": (72.75, 18.85, 73.10, 19.30),
    "chennai": (80.05, 12.75, 80.45, 13.35),
    "delhi": (76.85, 28.30, 77.55, 28.90),
    "pune": (73.72, 18.40, 74.05, 18.68),
    "coimbatore": (76.85, 10.90, 77.15, 11.15),
    # Southeast Asia
    "singapore": (103.56552, 1.13036, 104.57123, 1.51432),
    "bangkok": (99.81671, 13.21895, 100.96390, 14.27604),
    "chiang_mai": (98.94265, 18.75672, 99.02981, 18.84417),
    "bali": (115.08, -8.82, 115.35, -8.58),
    "ho_chi_minh": (106.60, 10.70, 106.82, 10.88),
    "kuala_lumpur": (101.45, 2.85, 101.85, 3.35),
    # East Asia
    "tokyo": (139.30, 35.35, 140.00, 35.90),
    "seoul": (126.65, 37.25, 127.35, 37.75),
    "taipei": (121.45714, 24.96052, 121.66594, 25.21024),
    # Oceania
    "melbourne": (144.44, -38.20, 145.60, -37.60),
    "sydney": (150.65, -34.20, 151.35, -33.55),
}

OVERTURE_CATEGORIES = (
    "cafe",
    "coffee_shop",
    "coffee_roastery",
    "tea_room",
    "library",
    "shared_office_space",
)

COWORKING_WHERE_CLAUSE = """
(
  taxonomy.primary = 'coworking_space'

  -- Global brands
  OR names.primary ILIKE '%wework%'
  OR names.primary ILIKE '%regus%'
  OR names.primary ILIKE '%industrious%'
  OR names.primary ILIKE '%mindspace%'
  OR names.primary ILIKE '%servcorp%'
  OR names.primary ILIKE '%impact hub%'
  OR names.primary ILIKE '%selina%'
  OR names.primary ILIKE '%coworking%'
  OR names.primary ILIKE '%co-working%'

  -- IWG brands
  OR names.primary ILIKE '%spaces by iwg%'
  OR names.primary ILIKE '%hq by iwg%'

  -- North America
  OR names.primary ILIKE '%convene%'
  OR names.primary ILIKE '%bond collective%'
  OR names.primary ILIKE '%serendipity labs%'
  OR names.primary ILIKE '%novel coworking%'
  OR names.primary ILIKE '%neuehouse%'
  OR names.primary ILIKE '%common desk%'

  -- India
  OR names.primary ILIKE '%awfis%'
  OR names.primary ILIKE '%91springboard%'
  OR names.primary ILIKE '%indiqube%'
  OR names.primary ILIKE '%cowrks%'
  OR names.primary ILIKE '%bhive%'
  OR names.primary ILIKE '%innov8%'
  OR names.primary ILIKE '%smartworks%'
  OR names.primary ILIKE '%workafella%'
  OR names.primary ILIKE '%spring house%'
  OR names.primary ILIKE '%myhq%'
  OR names.primary ILIKE '%incuspaze%'
  OR names.primary ILIKE '%devx%'
  OR names.primary ILIKE '%instaoffice%'
  OR names.primary ILIKE '%goodworks%'
  OR names.primary ILIKE '%nextspace%'

  -- Southeast Asia
  OR names.primary ILIKE '%justco%'
  OR names.primary ILIKE '%the executive centre%'
  OR names.primary ILIKE '%the hive%'
  OR names.primary ILIKE '%common ground%'
  OR names.primary ILIKE '%colony%cowork%'
  OR names.primary ILIKE '%worq%'
  OR names.primary ILIKE '%outpost%'
  OR names.primary ILIKE '%hubud%'

  -- China/East Asia
  OR names.primary ILIKE '%ucommune%'

  -- Australia
  OR names.primary ILIKE '%hub australia%'

  -- Latin America
  OR names.primary ILIKE '%urban station%'
)
"""

TYPE_BY_CATEGORY = {
    "cafe": "cafe",
    "coffee_shop": "cafe",
    "coffee_roastery": "cafe",
    "tea_room": "cafe",
    "library": "library",
    "shared_office_space": "coworking",
}

BATCH_SIZE = 250


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_bbox(value: str) -> tuple[float, float, float, float]:
    parts = [part.strip() for part in value.split(",")]
    if len(parts) != 4:
        raise ValueError("bbox must be minx,miny,maxx,maxy")

    minx, miny, maxx, maxy = (float(part) for part in parts)
    if minx >= maxx or miny >= maxy:
        raise ValueError("bbox minimums must be less than maximums")
    return minx, miny, maxx, maxy


def format_city_bbox(bbox: tuple[float, float, float, float]) -> str:
    return ",".join(f"{value:.2f}" for value in bbox)


def get_supabase_client():
    env_path = Path(__file__).resolve().parents[1] / ".env.local"
    local_env: dict[str, str] = {}
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            local_env[key] = value.strip().strip("\"'")

    url = local_env.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = local_env.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    return create_client(url, key)


def get_latest_release() -> str:
    response = httpx.get("https://stac.overturemaps.org/catalog.json", timeout=30)
    response.raise_for_status()
    latest = response.json().get("latest")
    if not isinstance(latest, str) or not latest:
        raise RuntimeError("Unable to read latest Overture release from STAC catalog")
    return latest


def connect_duckdb() -> duckdb.DuckDBPyConnection:
    connection = duckdb.connect()
    connection.execute("INSTALL spatial;")
    connection.execute("INSTALL httpfs;")
    connection.execute("LOAD spatial;")
    connection.execute("LOAD httpfs;")
    connection.execute("SET s3_region = 'us-west-2';")
    return connection


def query_overture(
    connection: duckdb.DuckDBPyConnection,
    release: str,
    bbox: tuple[float, float, float, float],
) -> list[dict[str, Any]]:
    minx, miny, maxx, maxy = bbox
    s3_path = f"s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*"
    category_list = ", ".join(f"'{category}'" for category in OVERTURE_CATEGORIES)
    query = f"""
        SELECT
          id AS overture_id,
          names.primary AS name,
          ST_Y(geometry) AS lat,
          ST_X(geometry) AS lng,
          addresses[1].freeform AS address,
          addresses[1].locality AS city,
          addresses[1].region AS region,
          addresses[1].country AS country,
          websites[1] AS website,
          phones[1] AS phone,
          socials[1] AS social,
          emails[1] AS email,
          brand.names.primary AS brand_name,
          confidence,
          operating_status,
          basic_category,
          {COWORKING_WHERE_CLAUSE} AS is_coworking
        FROM read_parquet(?, filename = true, hive_partitioning = 1)
        WHERE (basic_category IN ({category_list}) OR {COWORKING_WHERE_CLAUSE})
          AND names.primary IS NOT NULL
          AND trim(names.primary) <> ''
          AND coalesce(operating_status, '') != 'permanently_closed'
          AND confidence >= 0.65
          AND NOT (
            (addresses[1].freeform IS NULL OR trim(addresses[1].freeform) = '')
            AND confidence < 0.8
          )
          AND bbox.xmin BETWEEN ? AND ?
          AND bbox.ymin BETWEEN ? AND ?
    """
    result = connection.execute(query, [s3_path, minx, maxx, miny, maxy])
    columns = [column[0] for column in result.description]
    return [dict(zip(columns, row, strict=True)) for row in result.fetchall()]


def choose_slug(row: dict[str, Any]) -> str:
    overture_id = str(row["overture_id"])
    suffix = overture_id[-4:] if len(overture_id) >= 4 else overture_id
    name_slug = slugify(str(row.get("name") or ""))
    city_slug = slugify(str(row.get("city") or row.get("country") or ""))
    base = name_slug if name_slug else city_slug if city_slug else "nook"
    if city_slug and base != city_slug:
        return f"{base}-{city_slug}-{suffix}"
    return f"{base}-{suffix}"


def google_maps_url(name: str, address: str | None) -> str:
    query = " ".join(part.strip() for part in [name, address or ""] if part.strip())
    return f"https://www.google.com/maps/search/{quote_plus(query)}"


def build_nook_rows(
    rows: list[dict[str, Any]],
    release: str,
    seed_run_id: str,
) -> list[dict[str, Any]]:
    nook_rows: list[dict[str, Any]] = []
    for row in rows:
        overture_id = row.get("overture_id")
        name = row.get("name")
        lat = row.get("lat")
        lng = row.get("lng")
        category = row.get("basic_category")
        nook_type = "coworking" if row.get("is_coworking") else TYPE_BY_CATEGORY.get(str(category))

        if not overture_id or not name or lat is None or lng is None or not nook_type:
            continue

        normalized = {
            "overture_id": str(overture_id),
            "name": str(name),
            "lat": float(lat),
            "lng": float(lng),
            "address": row.get("address"),
            "type": nook_type,
            "location": f"SRID=4326;POINT({float(lng)} {float(lat)})",
            "website": row.get("website"),
            "phone": row.get("phone"),
            "social": row.get("social"),
            "email": row.get("email"),
            "brand_name": row.get("brand_name"),
            "confidence": row.get("confidence"),
            "operating_status": row.get("operating_status") or "active",
            "neighborhood": None,
            "city": row.get("city"),
            "region": row.get("region"),
            "country": row.get("country"),
            "country_code": None,
            "source_release": release,
            "seed_run_id": seed_run_id,
            "last_seed_run_id": seed_run_id,
            "seeded_at": utc_now(),
        }
        normalized["slug"] = choose_slug(normalized)
        nook_rows.append(normalized)

    return nook_rows


def chunked(values: list[dict[str, Any]], size: int):
    for index in range(0, len(values), size):
        yield values[index : index + size]


def without_insert_only_seed_fields(row: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in row.items() if key != "seed_run_id"}


def is_unique_violation(error: Exception) -> bool:
    code = getattr(error, "code", None)
    if code == "23505":
        return True

    for arg in getattr(error, "args", ()):
        if isinstance(arg, dict) and arg.get("code") == "23505":
            return True

    text = str(error).lower()
    return "23505" in text or "duplicate key value violates unique constraint" in text


def upsert_nooks(supabase, nook_rows: list[dict[str, Any]]) -> dict[str, str]:
    overture_to_nook_id: dict[str, str] = {}
    for batch in chunked(nook_rows, BATCH_SIZE):
        rows_to_map = []
        overture_ids = [row["overture_id"] for row in batch]
        existing_rows = (
            supabase.table("nooks")
            .select("id,overture_id")
            .in_("overture_id", overture_ids)
            .execute()
        )
        existing_overture_ids = {
            row["overture_id"]
            for row in (existing_rows.data or [])
            if isinstance(row.get("overture_id"), str)
        }

        insert_rows = [row for row in batch if row["overture_id"] not in existing_overture_ids]
        update_rows = [without_insert_only_seed_fields(row) for row in batch if row["overture_id"] in existing_overture_ids]

        if update_rows:
            try:
                response = (
                    supabase.table("nooks")
                    .upsert(update_rows, on_conflict="overture_id")
                    .execute()
                )
                rows_to_map.extend(response.data or [])
            except Exception as error:
                if not is_unique_violation(error):
                    raise

                for row in update_rows:
                    try:
                        response = (
                            supabase.table("nooks")
                            .upsert(row, on_conflict="overture_id")
                            .execute()
                        )
                        rows_to_map.extend(response.data or [])
                    except Exception as single_error:
                        if is_unique_violation(single_error):
                            print(
                                f"Warning: skipping row with duplicate unique key "
                                f"(overture_id={row.get('overture_id')}, slug={row.get('slug')})",
                                file=sys.stderr,
                            )
                            continue
                        raise

        if insert_rows:
            try:
                response = supabase.table("nooks").insert(insert_rows).execute()
                rows_to_map.extend(response.data or [])
            except Exception as error:
                if not is_unique_violation(error):
                    raise

                for row in insert_rows:
                    try:
                        response = supabase.table("nooks").insert(row).execute()
                        rows_to_map.extend(response.data or [])
                    except Exception as single_error:
                        if not is_unique_violation(single_error):
                            raise

                        try:
                            response = (
                                supabase.table("nooks")
                                .upsert(without_insert_only_seed_fields(row), on_conflict="overture_id")
                                .execute()
                            )
                            rows_to_map.extend(response.data or [])
                        except Exception as conflict_error:
                            if is_unique_violation(conflict_error):
                                print(
                                    f"Warning: skipping row with duplicate unique key "
                                    f"(overture_id={row.get('overture_id')}, slug={row.get('slug')})",
                                    file=sys.stderr,
                                )
                                continue
                            raise

        for row in rows_to_map:
            overture_id = row.get("overture_id")
            nook_id = row.get("id")
            if isinstance(overture_id, str) and isinstance(nook_id, str):
                overture_to_nook_id[overture_id] = nook_id

        if not rows_to_map:
            lookup = (
                supabase.table("nooks")
                .select("id,overture_id")
                .in_("overture_id", overture_ids)
                .execute()
            )
            for row in lookup.data or []:
                overture_id = row.get("overture_id")
                nook_id = row.get("id")
                if isinstance(overture_id, str) and isinstance(nook_id, str):
                    overture_to_nook_id[overture_id] = nook_id
    return overture_to_nook_id


def upsert_nook_details(
    supabase,
    nook_rows: list[dict[str, Any]],
    overture_to_nook_id: dict[str, str],
) -> None:
    details_rows = []
    for row in nook_rows:
        nook_id = overture_to_nook_id.get(row["overture_id"])
        if not nook_id:
            continue
        details_rows.append(
            {
                "nook_id": nook_id,
                "google_maps_url": google_maps_url(row["name"], row.get("address")),
            }
        )

    for batch in chunked(details_rows, BATCH_SIZE):
        supabase.table("nook_details").upsert(batch, on_conflict="nook_id").execute()


def mark_region(
    supabase,
    bbox_key: str,
    status: str,
    city_name: str | None,
    venue_count: int = 0,
) -> None:
    payload: dict[str, Any] = {
        "bbox_key": bbox_key,
        "city_name": city_name,
        "status": status,
        "venue_count": venue_count,
    }
    if status == "seeding":
        payload["completed_at"] = None
    if status in {"complete", "failed"}:
        payload["completed_at"] = utc_now()

    supabase.table("seeded_regions").upsert(payload, on_conflict="bbox_key").execute()


def seed_region(
    supabase,
    connection: duckdb.DuckDBPyConnection,
    release: str,
    bbox_key: str,
    bbox: tuple[float, float, float, float],
    city_name: str | None,
) -> int:
    print(f"Seeding {city_name or bbox_key} from Overture {release}")
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    seed_run_id = f"{city_name or bbox_key}-{timestamp}"
    mark_region(supabase, bbox_key, "seeding", city_name)

    try:
        rows = query_overture(connection, release, bbox)
        print(f"Found {len(rows)} candidate venues")

        nook_rows = build_nook_rows(rows, release, seed_run_id)
        print(f"Prepared {len(nook_rows)} nooks after normalization")

        overture_to_nook_id = upsert_nooks(supabase, nook_rows)
        upsert_nook_details(supabase, nook_rows, overture_to_nook_id)

        venue_count = len(overture_to_nook_id)
        mark_region(supabase, bbox_key, "complete", city_name, venue_count)
        print(f"Completed {city_name or bbox_key}: upserted {venue_count} venues")
        return venue_count
    except Exception:
        mark_region(supabase, bbox_key, "failed", city_name)
        raise


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed Nook venues from Overture Maps places.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--cities", help="Comma-separated list of predefined city keys")
    group.add_argument("--bbox", help="Manual bbox as minx,miny,maxx,maxy")
    group.add_argument("--all", action="store_true", help="Seed all predefined cities")
    parser.add_argument("--city-name", help="Optional display label for manual bbox seeding")
    return parser.parse_args()


def resolve_targets(args: argparse.Namespace) -> list[tuple[str, tuple[float, float, float, float], str | None]]:
    if args.all:
        return [(format_city_bbox(bbox), bbox, city_name) for city_name, bbox in CITIES.items()]

    if args.cities:
        city_names = [city.strip() for city in args.cities.split(",") if city.strip()]
        unknown = [city for city in city_names if city not in CITIES]
        if unknown:
            raise ValueError(f"Unknown cities: {', '.join(unknown)}")
        return [(format_city_bbox(CITIES[city]), CITIES[city], city) for city in city_names]

    bbox = parse_bbox(args.bbox.strip())
    return [(format_city_bbox(bbox), bbox, args.city_name)]


def main() -> int:
    args = parse_args()
    targets = resolve_targets(args)
    supabase = get_supabase_client()
    release = get_latest_release()
    connection = connect_duckdb()

    total = 0
    for bbox_key, bbox, city_name in targets:
        total += seed_region(supabase, connection, release, bbox_key, bbox, city_name)

    print(f"Seed complete. Regions: {len(targets)}. Total venues upserted: {total}.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Seed failed: {error}", file=sys.stderr)
        raise
