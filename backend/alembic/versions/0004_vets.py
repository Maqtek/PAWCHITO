"""Этап 4. Врачи: отпуск, архив.

Revision ID: 0004
Revises: 0003
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vets",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("clinic_id", sa.BigInteger(), nullable=False),
        sa.Column("full_name", sa.Text(), nullable=False),
        sa.Column("specialization", sa.Text(), nullable=True),
        sa.Column("on_vacation", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "char_length(full_name) BETWEEN 1 AND 100", name=op.f("ck_vets_full_name_length")
        ),
        sa.CheckConstraint(
            "specialization IS NULL OR char_length(specialization) BETWEEN 1 AND 100",
            name=op.f("ck_vets_specialization_length"),
        ),
        sa.ForeignKeyConstraint(
            ["clinic_id"],
            ["clinics.id"],
            name=op.f("fk_vets_clinic_id_clinics"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vets")),
        # пара (врач, клиника) для составного внешнего ключа из appointments (этап 7)
        sa.UniqueConstraint("id", "clinic_id", name=op.f("uq_vets_id_clinic_id")),
    )
    op.create_index(op.f("ix_vets_clinic_id"), "vets", ["clinic_id"])


def downgrade() -> None:
    op.drop_table("vets")
