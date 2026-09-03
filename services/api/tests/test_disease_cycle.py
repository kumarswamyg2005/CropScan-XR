"""The knowledge base is agronomic advice. A wrong fungicide timing is a real
cost to a real person, so the structural guarantees are tested and the content
is reviewed by a human at Gate 2.

Scope note: Phase 3 ships apple, tomato and potato properly rather than all 38
shallowly. The completeness test therefore asserts coverage of those three crops
and lists what is still missing, instead of failing on classes nobody has
written up yet.
"""

import json
from pathlib import Path

import pytest

from app.cycle import STAGE_ORDER, DiseaseCycle, get_cycle, load_cycles

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "data"
SHIPPED_CROPS = ("Apple", "Potato", "Tomato")


@pytest.fixture(scope="module")
def cycles():
    return load_cycles()


@pytest.fixture(scope="module")
def disease_info():
    return json.loads((DATA / "disease_info.json").read_text())


def test_every_entry_validates(cycles):
    assert cycles
    for name, cycle in cycles.items():
        assert isinstance(cycle, DiseaseCycle), name


def test_every_shipped_crop_disease_has_a_cycle(cycles, disease_info):
    """Every non-healthy apple, tomato or potato class must be covered."""
    expected = {
        k for k, v in disease_info.items()
        if not v["is_healthy"] and k.split("___")[0].split("_(")[0] in SHIPPED_CROPS
    }
    missing = sorted(expected - set(cycles))
    assert not missing, f"shipped crop classes with no cycle entry: {missing}"


def test_healthy_classes_have_no_cycle(disease_info):
    """The API returns cycle: null for healthy, and the UI switches to browse
    mode. A healthy plant with an infection cycle would be nonsense."""
    for name, info in disease_info.items():
        if info["is_healthy"]:
            assert get_cycle(name) is None, name


def test_cycle_keys_are_real_disease_ids(cycles, disease_info):
    """A typo'd key silently produces a disease the UI can never reach."""
    unknown = sorted(set(cycles) - set(disease_info))
    assert not unknown, f"cycle keys with no disease_info entry: {unknown}"


def test_keys_never_point_at_a_healthy_class(cycles, disease_info):
    for name in cycles:
        assert not disease_info[name]["is_healthy"], name


def test_stages_are_canonical_and_ordered(cycles):
    for name, cycle in cycles.items():
        ids = [s.id for s in cycle.stages]
        assert ids == sorted(ids, key=STAGE_ORDER.index), name
        assert len(ids) == len(set(ids)), name


def test_every_intervention_targets_a_real_stage(cycles):
    """A dangling stage_id renders as an intervention marker attached to
    nothing in the Infection Theatre."""
    for name, cycle in cycles.items():
        stage_ids = {s.id for s in cycle.stages}
        for iv in cycle.interventions:
            assert iv.stage_id in stage_ids, f"{name}: {iv.stage_id}"


def test_every_entry_is_sourced(cycles):
    """Every field is sourced. This is the rule that makes the content usable."""
    for name, cycle in cycles.items():
        assert cycle.sources, name
        for src in cycle.sources:
            assert len(src) > 20, f"{name}: stub citation {src!r}"


def test_every_stage_has_telugu(cycles):
    """Telugu is a real feature for this audience, not a demo toggle."""
    for name, cycle in cycles.items():
        for stage in cycle.stages:
            assert stage.label_te.strip(), f"{name}/{stage.id}"
            assert stage.label_te != stage.label, f"{name}/{stage.id} not translated"


def test_localized_swaps_stage_labels(cycles):
    cycle = cycles["Apple___Apple_scab"]
    te = cycle.localized("te")
    en = cycle.localized("en")
    assert te["stages"][0]["label"] == cycle.stages[0].label_te
    assert en["stages"][0]["label"] == cycle.stages[0].label


def test_at_least_one_stage_is_environment_gated(cycles):
    """The simulator is the disease triangle as three dials. A disease with no
    gated stage anywhere would render a cycle that can never be broken --
    except for the two viruses, which genuinely are not weather-driven and say
    so in their note field."""
    for name, cycle in cycles.items():
        gated = any(
            s.requires.temp_c or s.requires.leaf_wetness_hr or s.requires.rh_pct
            for s in cycle.stages
        )
        if not gated:
            assert cycle.note, f"{name} has no gated stage and no note explaining why"


def test_unmet_reports_plain_language(cycles):
    """The halt message a farmer or student reads in the headset."""
    scab = cycles["Apple___Apple_scab"].stage("prepenetration")
    assert scab.requires.unmet(17, 18, 95) == []
    dry = scab.requires.unmet(17, 2, 95)
    assert len(dry) == 1 and "leaf wetness" in dry[0] and "below" in dry[0]


def test_leaf_mold_is_gated_on_humidity_alone(cycles):
    """The teaching case: ventilate below 85% RH and the disease stops outright."""
    stage = cycles["Tomato___Leaf_Mold"].stage("prepenetration")
    assert stage.requires.unmet(23, 0, 90) == []
    assert stage.requires.unmet(23, 0, 70)


def test_spider_mites_invert_the_humidity_requirement(cycles):
    """Contrast case: every fungus here needs moisture, the mite needs dry air.
    If this ever starts behaving like the fungi, the dials are wired wrong."""
    stage = cycles["Tomato___Spider_mites Two-spotted_spider_mite"].stage("prepenetration")
    assert stage.requires.unmet(30, 0, 30) == []
    assert stage.requires.unmet(30, 0, 90)


def test_cedar_apple_rust_is_monocyclic_with_an_alternate_host(cycles):
    """It cannot spread apple to apple. Removing the juniper breaks the cycle,
    and the simulator must be able to say so."""
    rust = cycles["Apple___Cedar_apple_rust"]
    assert rust.cycle_type == "monocyclic"
    assert rust.alternate_host
    assert any(iv.effect == "blocks" and iv.stage_id == "survival"
               for iv in rust.interventions)


def test_vectored_virus_names_its_vector(cycles):
    tylcv = cycles["Tomato___Tomato_Yellow_Leaf_Curl_Virus"]
    assert tylcv.vector is not None
    assert "insect_vector" in tylcv.dispersal


def test_coverage_gap_is_visible(cycles, disease_info):
    """Not an assertion -- a printed reminder of what Phase 3 deliberately
    left for later, so 'a rigorous 3' does not quietly become 'a shallow 38'."""
    remaining = sorted(
        k for k, v in disease_info.items()
        if not v["is_healthy"] and k not in cycles
    )
    print(f"\n{len(cycles)} written, {len(remaining)} classes still without a cycle:")
    for r in remaining:
        print(f"  - {r}")
