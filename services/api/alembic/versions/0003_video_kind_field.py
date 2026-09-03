"""Allow a 'field' video kind.

Revision ID: 0003
Revises: 0002

'field' is flat field or orchard footage. 'field360' stays reserved for
equirectangular capture, because the UI labels them differently and folding
them together would make the badge lie about what the viewer is getting.
"""
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

KINDS = "'treatment','field','field360','symptom_closeup'"
OLD_KINDS = "'treatment','field360','symptom_closeup'"


def upgrade() -> None:
    op.drop_constraint("video_kind_valid", "video", type_="check")
    op.create_check_constraint("video_kind_valid", "video", f"kind in ({KINDS})")


def downgrade() -> None:
    op.execute("DELETE FROM video WHERE kind = 'field'")
    op.drop_constraint("video_kind_valid", "video", type_="check")
    op.create_check_constraint("video_kind_valid", "video", f"kind in ({OLD_KINDS})")
