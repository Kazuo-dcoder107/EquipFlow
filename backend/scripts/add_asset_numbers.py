
"""Add and backfill permanent asset numbers for existing equipment.

Run from the backend directory:

    python -m scripts.add_asset_numbers

Safe to rerun. Existing asset numbers and sequence counters are preserved.
"""

import re

from sqlalchemy import inspect, text

import app.models
from app.database import Base, engine


PREFIXES = {
    "book": "BK",
    "hardware": "EQ",
}

ASSET_NUMBER_PATTERN = re.compile(r"^(BK|EQ|OT)_EF-(\d+)$")


def get_prefix(category_type: str) -> str:
    """Return the asset-number prefix for a category type."""
    return PREFIXES.get(str(category_type), "OT")


def main():
    # Create the sequence table if it does not exist.
    Base.metadata.create_all(engine)

    dialect = engine.dialect.name

    with engine.begin() as connection:
        inspector = inspect(connection)

        columns = {
            column["name"]
            for column in inspector.get_columns("equipment")
        }

        # Add the column as nullable first so existing records can be updated.
        if "asset_number" not in columns:
            connection.execute(
                text(
                    "ALTER TABLE equipment "
                    "ADD COLUMN asset_number VARCHAR(32)"
                )
            )
            print("Added equipment.asset_number column.")
        else:
            print("equipment.asset_number already exists.")

        # Read existing records and their category types.
        rows = connection.execute(
            text(
                """
                SELECT equipment.id,
                       equipment.asset_number,
                       categories.type AS category_type
                FROM equipment
                JOIN categories
                  ON categories.id = equipment.category_id
                ORDER BY equipment.id
                """
            )
        ).mappings().all()

        # Read existing counters. Never decrease them.
        counters = connection.execute(
            text(
                """
                SELECT prefix, last_value
                FROM asset_number_sequences
                """
            )
        ).mappings().all()

        last_values = {
            row["prefix"]: row["last_value"]
            for row in counters
        }

        # Find the highest number already assigned for each prefix.
        for row in rows:
            existing = row["asset_number"]

            if not existing:
                continue

            match = ASSET_NUMBER_PATTERN.fullmatch(existing)

            if not match:
                raise RuntimeError(
                    f"Invalid existing asset number for equipment "
                    f"ID {row['id']}: {existing!r}. "
                    "No records were changed."
                )

            prefix = match.group(1)
            number = int(match.group(2))

            last_values[prefix] = max(
                last_values.get(prefix, 0),
                number,
            )

        # Assign numbers to records that do not have one.
        assigned = 0

        for row in rows:
            if row["asset_number"]:
                continue

            prefix = get_prefix(row["category_type"])
            next_number = last_values.get(prefix, 0) + 1

            asset_number = f"{prefix}_EF-{next_number:06d}"

            connection.execute(
                text(
                    """
                    UPDATE equipment
                    SET asset_number = :asset_number
                    WHERE id = :equipment_id
                    """
                ),
                {
                    "asset_number": asset_number,
                    "equipment_id": row["id"],
                },
            )

            last_values[prefix] = next_number
            assigned += 1

            print(
                f"Equipment ID {row['id']}: {asset_number}"
            )

        # Save the highest counters without ever decreasing existing values.
        for prefix, last_value in last_values.items():
            if dialect == "postgresql":
                upsert = text(
                    """
                    INSERT INTO asset_number_sequences (prefix, last_value)
                    VALUES (:prefix, :last_value)
                    ON CONFLICT (prefix)
                    DO UPDATE SET last_value = GREATEST(
                        asset_number_sequences.last_value,
                        EXCLUDED.last_value
                    )
                    """
                )
            elif dialect == "sqlite":
                upsert = text(
                    """
                    INSERT INTO asset_number_sequences (prefix, last_value)
                    VALUES (:prefix, :last_value)
                    ON CONFLICT (prefix)
                    DO UPDATE SET last_value = MAX(
                        asset_number_sequences.last_value,
                        excluded.last_value
                    )
                    """
                )
            else:
                raise RuntimeError(
                    f"Unsupported database dialect: {dialect}"
                )

            connection.execute(
                upsert,
                {
                    "prefix": prefix,
                    "last_value": last_value,
                },
            )

        # Add the unique index if it does not already exist.
        indexes = {
            index["name"]
            for index in inspect(connection).get_indexes("equipment")
        }

        if "uq_equipment_asset_number" not in indexes:
            connection.execute(
                text(
                    """
                    CREATE UNIQUE INDEX uq_equipment_asset_number
                    ON equipment (asset_number)
                    """
                )
            )
            print("Created unique asset-number index.")

        # PostgreSQL can enforce NOT NULL after all records are populated.
        if dialect == "postgresql":
            connection.execute(
                text(
                    """
                    ALTER TABLE equipment
                    ALTER COLUMN asset_number SET NOT NULL
                    """
                )
            )

    print()
    print("Asset-number migration completed.")
    print(f"Existing equipment records assigned: {assigned}")


if __name__ == "__main__":
    main()
