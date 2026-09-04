"""Store the source pixel dimensions of a video.

Revision ID: 0004
Revises: 0003

transcode.sh already wrote width and height into video.json, but nothing read
them: the registration code built the row from an explicit field list that
omitted both, and there were no columns. The player sizes its panel from these
before the video loads, so the panel no longer jumps when metadata arrives.
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("video", sa.Column("width", sa.Integer()))
    op.add_column("video", sa.Column("height", sa.Integer()))


def downgrade() -> None:
    op.drop_column("video", "height")
    op.drop_column("video", "width")
