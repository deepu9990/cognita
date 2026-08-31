import os
import sys
import io
import json
import zipfile
import urllib.request
from typing import Dict, List, Tuple
from dotenv import load_dotenv

# Ensure notebook root is in sys.path and load .env
notebook_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, notebook_dir)
load_dotenv(os.path.join(notebook_dir, ".env"))
load_dotenv()


def get_secret(name: str, default: str = "") -> str:
    val = os.getenv(name)
    if val:
        return val
    try:
        from kaggle_secrets import UserSecretsClient

        return UserSecretsClient().get_secret(name) or default
    except Exception:
        return default


# Ensure DATABASE_URL is populated from Kaggle secrets if running on Kaggle
db_url = get_secret("DATABASE_URL")
if db_url:
    os.environ["DATABASE_URL"] = db_url

from rag.database import get_vector_store
from rag.ingestion import ingest_document
from rag.permissions import DocumentPermission
from rag.retriever import Retriever
from rag.schemas import UserContext

# Slices chosen for small download footprint (< 2.6 MB total) and diverse enterprise types
BENCH_SLICES: List[Tuple[str, str, int]] = [
    (
        "confluence",
        "https://github.com/onyx-dot-app/EnterpriseRAG-Bench/releases/download/v1.0.0/confluence_slice_0002.zip",
        100,  # Pick 100 confluence docs (runbooks, playbooks, wikis)
    ),
    (
        "fireflies",
        "https://github.com/onyx-dot-app/EnterpriseRAG-Bench/releases/download/v1.0.0/fireflies_slice_0003.zip",
        45,  # Pick 45 meeting transcripts
    ),
    (
        "linear",
        "https://github.com/onyx-dot-app/EnterpriseRAG-Bench/releases/download/v1.0.0/linear_slice_0008.zip",
        40,  # Pick 40 engineering/product tickets
    ),
    (
        "hubspot",
        "https://github.com/onyx-dot-app/EnterpriseRAG-Bench/releases/download/v1.0.0/hubspot_slice_0004.zip",
        15,  # Pick 15 CRM/sales customer records
    ),
]


def extract_title_from_text(content: str, filename: str) -> str:
    """Extract first non-empty line or clean filename as document title."""
    for line in content.splitlines():
        line = line.strip().strip("#").strip()
        if line and len(line) > 3:
            return line[:200]
    clean_name = os.path.splitext(os.path.basename(filename))[0]
    if "__" in clean_name:
        clean_name = clean_name.split("__", 1)[1]
    return clean_name.replace("-", " ").replace("_", " ").title()


def ingest_enterprise_benchmark(
    target_count: int = 200,
    org_id: str = "redwood",
    data_dir: str = None,
    custom_db_url: str = None,
):
    url = custom_db_url or os.getenv("DATABASE_URL") or get_secret("DATABASE_URL")
    if url:
        os.environ["DATABASE_URL"] = url

    vs = get_vector_store(database_url=url, force_refresh=True)
    if not vs.is_available():
        print(
            "\n❌ Error: PostgreSQL/pgvector database is not available.\n"
            "   Make sure DATABASE_URL is set in Kaggle Secrets (Add-ons -> Secrets) or notebook/.env.\n"
            "   Example: DATABASE_URL=postgresql://postgres.xxx:password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres\n",
            file=sys.stderr,
            flush=True,
        )
        return

    base_dir = data_dir or os.path.join(os.path.dirname(__file__), "..", "data", "bench")
    os.makedirs(base_dir, exist_ok=True)

    print(f"[*] Starting EnterpriseRAG-Bench POC ingestion ({target_count} documents)...", flush=True)
    print(f"[*] Target Organization: '{org_id}'", flush=True)

    total_ingested = 0

    for source_type, url_slice, count_to_take in BENCH_SLICES:
        if total_ingested >= target_count:
            break

        needed = min(count_to_take, target_count - total_ingested)
        print(f"\n[-] Downloading {source_type} slice from {url_slice}...", flush=True)

        try:
            req = urllib.request.Request(url_slice, headers={"User-Agent": "Cognita-Bench-Ingester/1.0"})
            with urllib.request.urlopen(req) as resp:
                zip_data = resp.read()

            with zipfile.ZipFile(io.BytesIO(zip_data)) as z:
                all_files = [f for f in z.namelist() if not f.endswith("/") and not f.startswith("__MACOSX")]
                selected_files = all_files[:needed]
                print(f"[*] Selected {len(selected_files)} documents from {source_type} (archive has {len(all_files)})", flush=True)

                for idx, fname in enumerate(selected_files, 1):
                    raw_text = z.read(fname).decode("utf-8", errors="ignore")
                    title = extract_title_from_text(raw_text, fname)

                    local_fname = os.path.basename(fname)
                    local_path = os.path.join(base_dir, local_fname)
                    with open(local_path, "w", encoding="utf-8") as f:
                        f.write(raw_text)

                    dept = "Engineering" if source_type in ("github", "linear") else ("Sales" if source_type == "hubspot" else "All")
                    permissions = DocumentPermission(
                        organization_id=org_id,
                        is_public=True,
                        allowed_departments=[dept, "All"],
                        allowed_roles=["*"],
                    )

                    res = ingest_document(
                        file_path=local_path,
                        organization_id=org_id,
                        title=title,
                        version="v1",
                        permissions=permissions,
                        vector_store=vs,
                    )
                    total_ingested += 1
                    print(
                        f"  [{total_ingested}/{target_count}] ({source_type}) {title[:50]}... "
                        f"-> {res.chunk_count} chunk(s)",
                        flush=True,
                    )

                    if total_ingested >= target_count:
                        break

        except Exception as err:
            print(f"⚠️ Error processing slice {source_type}: {err}", flush=True)

    print(f"\n[DONE] Successfully ingested {total_ingested} EnterpriseRAG documents into Supabase!", flush=True)


if __name__ == "__main__":
    count = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 200
    db_arg = sys.argv[2] if len(sys.argv) > 2 else None
    ingest_enterprise_benchmark(target_count=count, custom_db_url=db_arg)
