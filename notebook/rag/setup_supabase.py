import os
import sys
import psycopg2
from dotenv import load_dotenv

load_dotenv()


def run_migration(db_url: str = None):
    url = db_url or os.getenv("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL is not set in environment or passed as argument.", file=sys.stderr)
        sys.exit(1)

    print("Connecting to database...", flush=True)
    try:
        conn = psycopg2.connect(url)
        conn.autocommit = True
        cur = conn.cursor()
        print("Connected successfully!", flush=True)

        migration_path = os.path.join(os.path.dirname(__file__), "migrations", "001_initial_schema.sql")
        with open(migration_path, "r", encoding="utf-8") as f:
            sql = f.read()

        print(f"Applying migration from {migration_path}...", flush=True)
        cur.execute(sql)
        print("Migration applied successfully!", flush=True)

        # Verify tables
        cur.execute(
            """
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """
        )
        tables = [row[0] for row in cur.fetchall()]
        print(f"Tables in 'public' schema: {tables}", flush=True)

        # Verify pgvector extension
        cur.execute("SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';")
        ext = cur.fetchone()
        print(f"pgvector extension: {ext}", flush=True)

        cur.close()
        conn.close()
        print("Database setup complete!", flush=True)
    except Exception as e:
        print(f"Error during migration: {e}", file=sys.stderr, flush=True)
        sys.exit(1)


if __name__ == "__main__":
    url_arg = sys.argv[1] if len(sys.argv) > 1 else None
    run_migration(url_arg)

