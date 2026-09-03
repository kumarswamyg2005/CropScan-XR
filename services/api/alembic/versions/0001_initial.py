"""Initial schema: scans, ledger, merkle roots, products, orders, webhooks, videos.

Revision ID: 0001
Revises:
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

# The role the API connects as. It gets INSERT and SELECT on ledger_entry and
# nothing else -- see the note in upgrade().
APP_ROLE = "cropscan_app"


def upgrade() -> None:
    op.create_table(
        "scan",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column("image_key", sa.String(512), nullable=False),
        sa.Column("image_sha256", sa.String(64), nullable=False, index=True),
        sa.Column("model_version", sa.String(128), nullable=False),
        sa.Column("disease_id", sa.String(128), index=True),
        sa.Column("confidence", sa.Float()),
        sa.Column("top3", JSONB, nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("gradcam_key", sa.String(512)),
        sa.Column("client_meta", JSONB, nullable=False),
        sa.CheckConstraint("status in ('ok','uncertain')", name="scan_status_valid"),
        # An uncertain scan must not carry a disease id. The XR module keys off
        # this, and a stray id would let it launch on a guess.
        sa.CheckConstraint(
            "(status = 'ok' and disease_id is not null) or "
            "(status = 'uncertain' and disease_id is null)",
            name="scan_uncertain_has_no_disease",
        ),
    )

    op.create_table(
        "ledger_entry",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("seq", sa.BigInteger(), nullable=False, unique=True, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column("event_type", sa.String(64), nullable=False, index=True),
        sa.Column("subject_id", sa.String(64), nullable=False, index=True),
        sa.Column("payload", JSONB, nullable=False),
        sa.Column("payload_sha256", sa.String(64), nullable=False),
        sa.Column("prev_hash", sa.String(64), nullable=False),
        sa.Column("entry_hash", sa.String(64), nullable=False, unique=True),
    )
    op.create_index("ix_ledger_seq_desc", "ledger_entry", [sa.text("seq DESC")])

    op.create_table(
        "merkle_root",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("day", sa.String(10), nullable=False, unique=True, index=True),
        sa.Column("root_hash", sa.String(64), nullable=False),
        sa.Column("entry_count", sa.Integer(), nullable=False),
        sa.Column("anchored_tx", sa.String(128)),
    )

    op.create_table(
        "product",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("sku", sa.String(64), nullable=False, unique=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("price_paise", sa.Integer(), nullable=False),
        sa.Column("disease_id", sa.String(128), index=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.CheckConstraint("kind in ('kit','consult','module')", name="product_kind_valid"),
        sa.CheckConstraint("price_paise > 0", name="product_price_positive"),
    )

    op.create_table(
        "order",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column("product_id", sa.String(36), sa.ForeignKey("product.id"), nullable=False),
        sa.Column("scan_id", sa.String(36), sa.ForeignKey("scan.id")),
        sa.Column("amount_paise", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="created", index=True),
        sa.Column("rzp_order_id", sa.String(64), unique=True, index=True),
        sa.Column("rzp_payment_id", sa.String(64), index=True),
        sa.Column("paid_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("status in ('created','paid','failed','refunded')",
                           name="order_status_valid"),
    )

    op.create_table(
        "webhook_event",
        sa.Column("id", sa.String(36), primary_key=True),
        # This unique constraint IS the idempotency mechanism. Razorpay retries,
        # and two retries can arrive concurrently -- a SELECT-then-INSERT in
        # application code would let both through.
        sa.Column("rzp_event_id", sa.String(128), nullable=False, unique=True, index=True),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
        sa.Column("raw", JSONB, nullable=False),
    )

    op.create_table(
        "video",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("disease_id", sa.String(128), nullable=False, index=True),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("hls_key", sa.String(512), nullable=False),
        sa.Column("poster_key", sa.String(512)),
        sa.Column("duration_s", sa.Integer()),
        sa.Column("projection", sa.String(16), nullable=False, server_default="flat"),
        sa.Column("stereo", sa.String(16), nullable=False, server_default="none"),
        sa.Column("language", sa.String(8), nullable=False, server_default="en"),
        sa.CheckConstraint("kind in ('treatment','field360','symptom_closeup')",
                           name="video_kind_valid"),
        sa.CheckConstraint("projection in ('flat','equirect','equirect180')",
                           name="video_projection_valid"),
        sa.CheckConstraint("stereo in ('none','top_bottom','left_right')",
                           name="video_stereo_valid"),
    )

    # ------------------------------------------------------------------
    # Append-only enforcement.
    #
    # The application code has no UPDATE or DELETE path for ledger_entry, but
    # code discipline is what a reviewer checks -- this is what actually holds
    # when the code is wrong. Revoking the grants means a bug, an ORM cascade
    # or a careless migration cannot quietly rewrite history.
    #
    # Skipped when the role does not exist so a fresh developer database still
    # migrates cleanly; the demo in docs/demo.md tampers as the superuser on
    # purpose, because the point is that even a superuser edit is DETECTED.
    # ------------------------------------------------------------------
    op.execute(
        f"""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
                REVOKE UPDATE, DELETE, TRUNCATE ON ledger_entry FROM {APP_ROLE};
                GRANT SELECT, INSERT ON ledger_entry TO {APP_ROLE};
            ELSE
                RAISE NOTICE 'role {APP_ROLE} not present; skipping ledger grant lockdown';
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    for table in ("video", "webhook_event", "order", "product",
                  "merkle_root", "ledger_entry", "scan"):
        op.drop_table(table)
