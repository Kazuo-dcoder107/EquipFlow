
from getpass import getpass

from sqlalchemy import create_engine, select
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker

from app.database import SessionLocal as LocalSession
from app.models import User, UserRole, UserStatus


# Existing administrator in the local SQLite database
ADMIN_SR_CODE = "AdminJDML"

# Supabase Session Pooler connection details
SUPABASE_HOST = "aws-1-ap-northeast-1.pooler.supabase.com"
SUPABASE_PORT = 5432
SUPABASE_USER = "postgres.smedlsltjodjjeotxcbj"
SUPABASE_DATABASE = "postgres"


def main():
    local_db = LocalSession()
    remote_db = None
    engine = None

    try:
        # Read the original administrator
        local_user = local_db.scalar(
            select(User).where(User.sr_code == ADMIN_SR_CODE)
        )

        if local_user is None:
            print("ERROR: Original administrator was not found.")
            return

        if local_user.role != UserRole.admin:
            print("ERROR: Original account is not an administrator.")
            return

        if not local_user.password_hash:
            print("ERROR: Original account has no password hash.")
            return

        print("Original administrator found.")
        print("SR Code:", local_user.sr_code)
        print("Name:", local_user.full_name)
        print("Role:", local_user.role.value)

        # Ask for the Supabase password without displaying it
        db_password = getpass("Enter your Supabase database password: ")

        if not db_password:
            print("ERROR: Database password cannot be empty.")
            return

        # URL.create safely handles special characters such as @ in passwords
        db_url = URL.create(
            drivername="postgresql+psycopg2",
            username=SUPABASE_USER,
            password=db_password,
            host=SUPABASE_HOST,
            port=SUPABASE_PORT,
            database=SUPABASE_DATABASE,
            query={"sslmode": "require"},
        )

        engine = create_engine(db_url, pool_pre_ping=True)
        RemoteSession = sessionmaker(bind=engine, autoflush=False)
        remote_db = RemoteSession()

        # Check for existing SR Code and email conflicts
        existing_sr = remote_db.scalar(
            select(User).where(User.sr_code == local_user.sr_code)
        )
        existing_email = remote_db.scalar(
            select(User).where(User.email == local_user.email)
        )

        if existing_sr or existing_email:
            if (
                existing_sr is not None
                and existing_email is not None
                and existing_sr.id == existing_email.id
                and existing_sr.role == UserRole.admin
            ):
                print("This administrator already exists in Supabase.")
                return

            print("ERROR: An SR Code or email conflict exists in Supabase.")
            print("No records were changed. Please investigate the conflict.")
            return

        # Create a new Supabase user using the original password hash
        restored_user = User(
            sr_code=local_user.sr_code,
            full_name=local_user.full_name,
            email=local_user.email,
            role=UserRole.admin,
            status=UserStatus.active,
            password_hash=local_user.password_hash,
        )

        remote_db.add(restored_user)
        remote_db.commit()

        print("\nSUCCESS: Administrator restored in Supabase!")
        print("SR Code:", restored_user.sr_code)
        print("Role:", restored_user.role.value)
        print("Status:", restored_user.status.value)
        print("Your original password is preserved.")

    except Exception as error:
        if remote_db:
            remote_db.rollback()

        print("\nERROR: Migration was not completed.")
        print("Details:", str(error))

    finally:
        if remote_db:
            remote_db.close()

        local_db.close()

        if engine:
            engine.dispose()


if __name__ == "__main__":
    main()
