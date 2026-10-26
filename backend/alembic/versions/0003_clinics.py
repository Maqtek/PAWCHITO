"""Этап 3. Клиники: часы работы, рабочие дни, аккаунт, скрытие.

Revision ID: 0003
Revises: 0002
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "clinics",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("address", sa.Text(), nullable=False),
        sa.Column("phone", sa.Text(), nullable=False),
        sa.Column("opens_at", sa.Time(), nullable=False),
        sa.Column("closes_at", sa.Time(), nullable=False),
        sa.Column("work_days", postgresql.ARRAY(sa.SmallInteger()), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "char_length(name) BETWEEN 1 AND 100", name=op.f("ck_clinics_name_length")
        ),
        sa.CheckConstraint(
            "char_length(address) BETWEEN 1 AND 200", name=op.f("ck_clinics_address_length")
        ),
        sa.CheckConstraint("phone ~ '^\\+7[0-9]{10}$'", name=op.f("ck_clinics_phone_format")),
        sa.CheckConstraint("opens_at < closes_at", name=op.f("ck_clinics_hours")),
        sa.CheckConstraint(
            "date_part('minute', opens_at) IN (0, 30) AND date_part('second', opens_at) = 0 "
            "AND date_part('minute', closes_at) IN (0, 30) AND date_part('second', closes_at) = 0",
            name=op.f("ck_clinics_half_hours"),
        ),
        sa.CheckConstraint(
            "cardinality(work_days) BETWEEN 1 AND 7 AND work_days <@ '{1,2,3,4,5,6,7}'",
            name=op.f("ck_clinics_work_days"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_clinics_user_id_users"), ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_clinics")),
        # один аккаунт на клинику
        sa.UniqueConstraint("user_id", name=op.f("uq_clinics_user_id")),
    )


def downgrade() -> None:
    op.drop_table("clinics")
