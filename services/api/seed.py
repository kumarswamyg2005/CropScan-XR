"""Seed the product catalogue and a couple of video rows.

Idempotent -- safe to re-run. Prices are integer paise and live here, in the
database, because the client is never allowed to send one.

    python services/api/seed.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sqlalchemy import select

from app.db import get_sessionmaker
from app.models import Product, Video

PRODUCTS = [
    ("kit-apple-scab", "kit", "Apple scab protectant kit (captan + sprayer)", 149900,
     "Apple___Apple_scab"),
    ("kit-late-blight", "kit", "Late blight response kit (mandipropamid)", 189900,
     "Tomato___Late_blight"),
    ("kit-leaf-mold", "kit", "Greenhouse humidity and leaf mould kit", 129900,
     "Tomato___Leaf_Mold"),
    ("consult-agronomist-30", "consult", "30-minute VR consult with an agronomist", 99900, None),
    ("module-treatment-bench", "module", "Treatment Bench training module", 49900, None),
]

VIDEOS = [
    ("Apple___Apple_scab", "field360", "Scab lesions in a wet orchard",
     "videos/apple-scab-360/index.m3u8", "equirect", "top_bottom", 96),
    ("Apple___Apple_scab", "treatment", "Timing a protectant spray before rain",
     "videos/apple-scab-spray/index.m3u8", "flat", "none", 141),
    ("Tomato___Late_blight", "field360", "Late blight moving through a field",
     "videos/late-blight-360/index.m3u8", "equirect", "none", 112),
]


def main() -> int:
    session = get_sessionmaker()()
    added = 0

    for sku, kind, title, price, disease_id in PRODUCTS:
        if session.execute(select(Product).where(Product.sku == sku)).scalar_one_or_none():
            continue
        session.add(Product(sku=sku, kind=kind, title=title,
                            price_paise=price, disease_id=disease_id))
        added += 1

    for disease_id, kind, title, key, projection, stereo, duration in VIDEOS:
        if session.execute(select(Video).where(Video.hls_key == key)).scalar_one_or_none():
            continue
        session.add(Video(disease_id=disease_id, kind=kind, title=title, hls_key=key,
                          poster_key=key.replace("index.m3u8", "poster.jpg"),
                          duration_s=duration, projection=projection, stereo=stereo))
        added += 1

    session.commit()
    print(f"seeded {added} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
