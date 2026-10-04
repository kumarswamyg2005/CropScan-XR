"""Hand-written content: disease info and its translations.

Loaded once from data/, which is shared with ml/ and the web app. These are the
two files the deletion commit deliberately kept -- they are hand-written, and
they are what makes a diagnosis into advice.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from app.config import get_settings


def _data_dir() -> Path:
    return Path(get_settings().data_dir)


@lru_cache(maxsize=1)
def disease_info() -> dict[str, dict]:
    return json.loads((_data_dir() / "disease_info.json").read_text())


# English plus the four Indian languages the web app speaks.
LANGS = ("en", "te", "hi", "ta", "kn")
LANG_PATTERN = f"^({'|'.join(LANGS)})$"


@lru_cache(maxsize=len(LANGS))
def translations(lang: str) -> dict[str, dict]:
    """data/translations_<lang>.json: name, symptoms and treatment text per class."""
    return json.loads((_data_dir() / f"translations_{lang}.json").read_text())


def info_for(disease_id: str, lang: str = "en") -> dict | None:
    base = disease_info().get(disease_id)
    if base is None:
        return None
    if lang == "en":
        return base
    # A translation overlays the English base rather than replacing it, so a
    # missing string degrades to English instead of to a blank card.
    return {**base, **translations(lang).get(disease_id, {})}
