import os
import sys
import json
import urllib.request
from typing import List, Dict, Any
from dotenv import load_dotenv

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
load_dotenv()

from rag.database import get_vector_store
from rag.retriever import Retriever
from rag.schemas import UserContext

QUESTIONS_URL = "https://github.com/onyx-dot-app/EnterpriseRAG-Bench/releases/download/v1.0.0/questions.jsonl"


def run_bench_eval(limit_questions: int = 25, org_id: str = "redwood"):
    vs = get_vector_store()
    if not vs.is_available():
        print("Error: Vector store is not available. Check DATABASE_URL.", file=sys.stderr)
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

    hits = 0
    total_evaluated = 0

    for idx, q in enumerate(eval_set, 1):
        query = q.get("question", "")
        category = q.get("category", "General")
        ground_truth_docs = q.get("document_ids", []) or q.get("ground_truth_document_ids", [])

        results = retriever.search(query=query, user_context=context, limit=3, min_score=0.0)
        retrieved_ids = [r.document_id for r in results]

        print(f"Q{idx} [{category}]: {query[:70]}...")
        if results:
            top_hit = results[0]
            print(f"   -> Top Hit: '{top_hit.document_title}' (Score: {top_hit.score:.3f})")
            print(f"      Snippet: {top_hit.content[:100].strip()}...\n")
        else:
            print("   -> No documents matched.\n")

    print(f"[DONE] Benchmark evaluation complete for {len(eval_set)} questions.")


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    run_bench_eval(limit_questions=n)

