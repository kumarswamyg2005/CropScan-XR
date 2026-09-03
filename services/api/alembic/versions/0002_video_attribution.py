"""Video licence, attribution and cycle-stage link.

Revision ID: 0002
Revises: 0001

Most curated footage is CC BY or CC BY-SA, both of which require attribution.
Storing it on the row is what makes the requirement enforceable -- the ingest
script refuses a clip without it and the player renders it.
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("video", sa.Column("caption", sa.String(2048)))
    op.add_column("video", sa.Column("license", sa.String(64)))
    op.add_column("video", sa.Column("attribution", sa.String(512)))
    op.add_column("video", sa.Column("source_url", sa.String(1024)))
    op.add_column("video", sa.Column("stage_id", sa.String(32)))
    op.create_index("ix_video_stage_id", "video", ["stage_id"])


def downgrade() -> None:
    op.drop_index("ix_video_stage_id", table_name="video")
    for column in ("stage_id", "source_url", "attribution", "license", "caption"):
        op.drop_column("video", column)
