"""Этап 5. Питомцы: карточка и архив.

Revision ID: 0005
Revises: 0004
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

pet_species = postgresql.ENUM("dog", "cat", "other", name="pet_species", create_type=False)
pet_sex = postgresql.ENUM("male", "female", "unknown", name="pet_sex", create_type=False)


def upgrade() -> None:
    pet_species.create(op.get_bind())
    pet_sex.create(op.get_bind())
    op.create_table(
        "pets",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("owner_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("species", pet_species, nullable=False),
        sa.Column("breed", sa.Text(), nullable=True),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("sex", pet_sex, server_default="unknown", nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("char_length(name) BETWEEN 1 AND 50", name=op.f("ck_pets_name_length")),
        sa.CheckConstraint(
            "breed IS NULL OR char_length(breed) BETWEEN 1 AND 100",
            name=op.f("ck_pets_breed_length"),
        ),
        sa.CheckConstraint(
            "birth_date IS NULL OR birth_date >= '1900-01-01'", name=op.f("ck_pets_birth_date")
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_pets_owner_id_users"), ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pets")),
    )
    op.create_index(op.f("ix_pets_owner_id"), "pets", ["owner_id"])


def downgrade() -> None:
    op.drop_table("pets")
    # drop_table типы не удаляет — удаляем сами
    pet_sex.drop(op.get_bind())
    pet_species.drop(op.get_bind())
