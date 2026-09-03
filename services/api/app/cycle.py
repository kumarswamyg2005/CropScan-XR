"""The disease-cycle knowledge base: schema, loader and language resolution.

data/disease_cycle.json is content, and content rots. The Pydantic model below
is what stops a typo in a stage id or a dangling intervention reaching the XR
module, where it would show up as a stage that never fires or an intervention
marker attached to nothing.

The nine canonical stages come from plant pathology (Agrios; CABI; the disease
triangle literature) and are fixed. A disease may omit stages it does not have,
but it may not invent one.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

StageId = Literal[
    "survival",              # 1 spores, sclerotia, mycelium, seed, residue, alternate host
    "inoculum_production",   # 2 primary inoculum forms
    "deposition",            # 3 inoculum lands on host
    "prepenetration",        # 4 germination; appressorium; needs leaf wetness
    "penetration",           # 5 stomata / wounds / direct cuticle breach
    "infection",             # 6 defences suppressed; latent period; nothing visible
    "colonization",          # 7 spread through tissue; visible lesion
    "reproduction",          # 8 new infectious units
    "dispersal",             # 9 wind, splash, vector, tools -> back to 3 or to 1
]

STAGE_ORDER: list[str] = list(StageId.__args__)

PathogenType = Literal["fungus", "oomycete", "bacterium", "virus", "arthropod", "nematode"]
CycleType = Literal["polycyclic", "monocyclic"]
InterventionEffect = Literal["blocks", "reduces_inoculum", "slows"]
InterventionKind = Literal["cultural", "chemical", "biological", "resistant_variety"]


class Pathogen(BaseModel):
    name: str
    type: PathogenType


class Vector(BaseModel):
    name: str
    transmission: str


class Requires(BaseModel):
    """Thresholds that gate a stage. None means unconstrained.

    The simulator checks the user's dial values against these. If a stage's
    requirement is unmet the stage fails visibly and the run halts -- that
    failure is the pedagogy, so these numbers have to be right.
    """

    temp_c: tuple[float, float] | None = None
    leaf_wetness_hr: tuple[float, float] | None = None
    rh_pct: tuple[float, float] | None = None

    @field_validator("temp_c", "leaf_wetness_hr", "rh_pct")
    @classmethod
    def _low_before_high(cls, v):
        if v is not None and v[0] > v[1]:
            raise ValueError(f"range is inverted: {v}")
        return v

    def unmet(self, temp_c: float, leaf_wetness_hr: float, rh_pct: float) -> list[str]:
        """Which conditions fail, in plain language for the XR panel."""
        failures = []
        for label, value, bounds, unit in (
            ("temperature", temp_c, self.temp_c, "°C"),
            ("leaf wetness", leaf_wetness_hr, self.leaf_wetness_hr, " h"),
            ("humidity", rh_pct, self.rh_pct, "%"),
        ):
            if bounds is None:
                continue
            lo, hi = bounds
            if value < lo:
                failures.append(f"{label} is {value:g}{unit}, below the {lo:g}{unit} this stage needs")
            elif value > hi:
                failures.append(f"{label} is {value:g}{unit}, above the {hi:g}{unit} this stage tolerates")
        return failures


class Stage(BaseModel):
    id: StageId
    label: str
    label_te: str
    what_happens: str
    duration_hint: str
    requires: Requires
    visible: bool = False
    vfx: str

    @field_validator("what_happens")
    @classmethod
    def _farmer_readable(cls, v: str) -> str:
        if len(v) < 20:
            raise ValueError("what_happens must be a real sentence, not a stub")
        return v


class EnvBand(BaseModel):
    min: float | None = None
    optimal: float | None = None
    max: float | None = None


class Environment(BaseModel):
    """Dial ranges for the simulator. None means this dial does not gate the
    disease at all -- true for the two viruses, where sanitation is the lever
    and weather is not."""

    temp_c: EnvBand | None = None
    leaf_wetness_hr: EnvBand | None = None
    rh_pct: EnvBand | None = None


class Intervention(BaseModel):
    stage_id: StageId
    action: str
    effect: InterventionEffect
    kind: InterventionKind


class DiseaseCycle(BaseModel):
    pathogen: Pathogen
    primary_inoculum: str
    overseasoning: str
    cycle_type: CycleType
    dispersal: list[str] = Field(min_length=1)
    stages: list[Stage] = Field(min_length=1)
    environment: Environment
    interventions: list[Intervention] = Field(min_length=1)
    sources: list[str] = Field(min_length=1)
    vector: Vector | None = None
    alternate_host: str | None = None
    note: str | None = None

    @model_validator(mode="after")
    def _check_internal_references(self):
        ids = [s.id for s in self.stages]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate stage id")
        if ids != sorted(ids, key=STAGE_ORDER.index):
            raise ValueError("stages must be in canonical order")

        # An intervention pointing at a stage this disease does not have would
        # render as a marker floating next to nothing in the Infection Theatre.
        for iv in self.interventions:
            if iv.stage_id not in ids:
                raise ValueError(
                    f"intervention targets stage {iv.stage_id!r}, which this "
                    f"disease does not have"
                )

        if self.pathogen.type == "virus" and self.vector is None and "insect_vector" in self.dispersal:
            raise ValueError("vector-dispersed virus must name its vector")
        return self

    def stage(self, stage_id: str) -> Stage | None:
        return next((s for s in self.stages if s.id == stage_id), None)

    def localized(self, lang: str) -> dict:
        """Resolve for a language. Telugu is a real feature for this audience,
        so 'te' swaps the stage labels rather than appending them."""
        data = self.model_dump()
        if lang == "te":
            for stage in data["stages"]:
                stage["label"] = stage["label_te"]
        return data


def _data_dir() -> Path:
    return Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data"))


@lru_cache(maxsize=1)
def load_cycles() -> dict[str, DiseaseCycle]:
    """Parsed once. Raises at import time if the content is malformed, which is
    what we want -- a broken knowledge base should stop the deploy, not surface
    as a blank panel in a headset."""
    raw = json.loads((_data_dir() / "disease_cycle.json").read_text())
    return {k: DiseaseCycle.model_validate(v) for k, v in raw.items()}


def get_cycle(disease_id: str) -> DiseaseCycle | None:
    """None for healthy classes and for diseases not yet written up. The API
    returns cycle: null and the UI offers browse mode instead of diagnosis mode."""
    return load_cycles().get(disease_id)
