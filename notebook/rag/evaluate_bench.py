import os
import sys
import json
import urllib.request
from typing import List, Dict, Any
from dotenv import load_dotenv

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


db_url = get_secret("DATABASE_URL")
if db_url:
    os.environ["DATABASE_URL"] = db_url

from rag.database import get_vector_store
from rag.retriever import Retriever
from rag.schemas import UserContext

QUESTIONS_URL = "https://github.com/onyx-dot-app/EnterpriseRAG-Bench/releases/download/v1.0.0/questions.jsonl"


def run_bench_eval(limit_questions: int = 10, org_id: str = "redwood", custom_db_url: str = None):
    url = custom_db_url or os.getenv("DATABASE_URL") or get_secret("DATABASE_URL")
    if url:
        os.environ["DATABASE_URL"] = url

    vs = get_vector_store(database_url=url, force_refresh=True)
    if not vs.is_available():
        print(
            "\n❌ Error: Vector store is not available. Check DATABASE_URL in Kaggle Secrets or .env.\n",
            file=sys.stderr,
            flush=True,
        )
        return

    q_path = os.path.join(os.path.dirname(__file__), "..", "data", "questions.jsonl")
    if not os.path.exists(q_path):
        print(f"[*] Downloading benchmark questions from {QUESTIONS_URL}...", flush=True)
        urllib.request.urlretrieve(QUESTIONS_URL, q_path)

    questions = []
    with open(q_path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                questions.append(json.loads(line))

    print(f"[*] Total questions in benchmark: {len(questions)}", flush=True)
    eval_set = questions[:limit_questions]
    print(f"[*] Running evaluation on first {len(eval_set)} questions...\n", flush=True)

    retriever = Retriever(vector_store=vs)
    context = UserContext(user_id="bench_evaluator", organization_id=org_id, department="Engineering")

    for idx, q in enumerate(eval_set, 1):
        query = q.get("question", "")
        category = q.get("category", "General")

        results = retriever.search(query=query, user_context=context, limit=3, min_score=0.0)

        print(f"Q{idx} [{category}]: {query[:70]}...")
        if results:
            top_hit = results[0]
            print(f"   -> Top Hit: '{top_hit.document_title}' (Score: {top_hit.score:.3f})")
            print(f"      Snippet: {top_hit.content[:100].strip()}...\n")
        else:
            print("   -> No documents matched.\n")

    print(f"[DONE] Benchmark evaluation complete for {len(eval_set)} questions.")


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 10
    db_arg = sys.argv[2] if len(sys.argv) > 2 else None
    run_bench_eval(limit_questions=n, custom_db_url=db_arg)
