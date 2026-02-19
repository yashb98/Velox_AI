#!/usr/bin/env python3
# fine-tuning/export_training_data.py
#
# 6.7 — Export completed call conversations from Postgres to JSONL format
#        suitable for supervised fine-tuning (SFT) with TRL's SFTTrainer.
#
# Output format (instruction-following / ChatML):
#   {"text": "<|system|>You are Velox...<|user|>Hello<|assistant|>Hi there!"}
#
# Usage:
#   export DATABASE_URL="postgresql://user:pass@host:5432/velox_local"
#   python export_training_data.py --output data/calls.jsonl --min-turns 3
#
# Options:
#   --output      Path to write JSONL file (default: data/calls.jsonl)
#   --min-turns   Minimum number of turns per conversation (default: 3)
#   --limit       Max conversations to export (default: no limit)
#   --since       Only export conversations started after this date (YYYY-MM-DD)

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERROR: psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)

# ─── Prompt template ──────────────────────────────────────────────────────────

SYSTEM_PROMPT = (
    "You are Velox, a professional AI voice assistant. "
    "Keep answers under two sentences — responses will be spoken aloud. "
    "Do not use markdown, bullet points, or formatting."
)

def format_conversation(messages: list[dict]) -> str:
    """Format a list of {role, content} dicts into ChatML format for SFT."""
    parts = [f"<|system|>\n{SYSTEM_PROMPT}"]
    for msg in messages:
        role = msg["role"]
        content = msg["content"].strip()
        if role == "user":
            parts.append(f"<|user|>\n{content}")
        elif role == "assistant":
            parts.append(f"<|assistant|>\n{content}")
        # Skip 'tool' messages — not needed for base SFT
    parts.append("<|end|>")
    return "\n".join(parts)

# ─── Main export logic ────────────────────────────────────────────────────────

def export(output: Path, min_turns: int, limit: int | None, since: str | None):
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL environment variable not set")
        sys.exit(1)

    conn = psycopg2.connect(db_url)
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Build query — only export COMPLETED conversations with enough turns
    query = """
        SELECT c.id AS conversation_id
        FROM   conversations c
        WHERE  c.status = 'COMPLETED'
          AND  c.deleted_at IS NULL
          AND  (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) >= %(min_turns)s
    """
    params: dict = {"min_turns": min_turns}

    if since:
        query += " AND c.start_time >= %(since)s"
        params["since"] = datetime.strptime(since, "%Y-%m-%d")

    query += " ORDER BY c.start_time DESC"

    if limit:
        query += " LIMIT %(limit)s"
        params["limit"] = limit

    cursor.execute(query, params)
    conversations = cursor.fetchall()
    print(f"Found {len(conversations)} qualifying conversations")

    output.parent.mkdir(parents=True, exist_ok=True)
    exported = 0

    with open(output, "w", encoding="utf-8") as f:
        for row in conversations:
            conv_id = row["conversation_id"]

            # Fetch messages for this conversation in order
            cursor.execute(
                """
                SELECT role, content
                FROM   messages
                WHERE  conversation_id = %s
                  AND  role IN ('user', 'assistant')
                ORDER  BY created_at ASC
                """,
                (conv_id,),
            )
            messages = cursor.fetchall()

            if len(messages) < min_turns:
                continue  # guard — double check

            text = format_conversation(messages)
            f.write(json.dumps({"text": text}, ensure_ascii=False) + "\n")
            exported += 1

    cursor.close()
    conn.close()
    print(f"Exported {exported} conversations to {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Export Velox call conversations to JSONL for fine-tuning"
    )
    parser.add_argument("--output", type=Path, default=Path("data/calls.jsonl"))
    parser.add_argument("--min-turns", type=int, default=3)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--since", type=str, default=None, help="YYYY-MM-DD")
    args = parser.parse_args()

    export(args.output, args.min_turns, args.limit, args.since)
