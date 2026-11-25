
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.models.equipment import AssetNumberSequence
from app.models.enums import CategoryType


PREFIXES = {
    CategoryType.book: "BK",
    CategoryType.hardware: "EQ",
}


def generate_asset_number(db: Session, category_type: CategoryType) -> str:
    """Atomically allocate the next permanent asset number for a category type."""
    prefix = PREFIXES.get(category_type, "OT")
    dialect = db.get_bind().dialect.name

    if dialect == "postgresql":
        insert_statement = pg_insert(AssetNumberSequence)
    elif dialect == "sqlite":
        insert_statement = sqlite_insert(AssetNumberSequence)
    else:
        raise RuntimeError(f"Unsupported database for asset numbering: {dialect}")

    statement = insert_statement.values(prefix=prefix, last_value=1)
    statement = statement.on_conflict_do_update(
        index_elements=[AssetNumberSequence.prefix],
        set_={"last_value": AssetNumberSequence.last_value + 1},
    ).returning(AssetNumberSequence.last_value)

    number = db.scalar(statement)
    return f"{prefix}_EF-{number:06d}"
