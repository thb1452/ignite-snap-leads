#!/usr/bin/env python3
"""Private, Buffalo-only evidence preparation and Mac LM Studio pilot. Python 3.10+."""
import argparse
import json
from pathlib import Path
import sys

from common import now, read_json, write_json
from evidence import load_packages, prepare
from report import build_report
from worker import MacRuntime, generate, host_report, save_review


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    p = commands.add_parser("prepare", help="Use retained Buffalo files, without network access")
    p.add_argument("--prepared", type=Path, required=True)
    p.add_argument("--snapshot", type=Path, required=True)
    p.add_argument("--workdir", type=Path, required=True)
    for name in ("verify", "doctor", "generate", "report", "review"):
        p = commands.add_parser(name)
        p.add_argument("--workdir", type=Path, required=True)
        if name in {"doctor", "generate"}:
            p.add_argument("--endpoint", default="http://127.0.0.1:1234")
            p.add_argument("--model", help="Exact loaded instance identifier; otherwise choose the unique verified match")
        if name == "generate":
            p.add_argument("--limit", type=int, default=1, help="First N of the fixed selection; unchanged results are reused; maximum ten")
            p.add_argument("--historical-note", help="Explicit historical-snapshot scope if collection is older than the 48-hour review threshold")
        if name == "review":
            p.add_argument("--parcel", required=True)
            p.add_argument("--review-file", type=Path, required=True)
    args = parser.parse_args(argv)
    args.workdir.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        if args.command == "prepare":
            result = prepare(args.prepared, args.snapshot, args.workdir)
        elif args.command == "verify":
            packages = load_packages(args.workdir)
            result = {"status": "verified_offline", "properties": len(packages), "selected_events": sum(len(p["events"]) for p in packages)}
        elif args.command == "doctor":
            result = MacRuntime(args.endpoint).doctor(args.model)
            write_json(args.workdir / "runtime_check.json", result)
        elif args.command == "generate":
            result = generate(args.workdir, MacRuntime(args.endpoint), args.model, args.limit, args.historical_note)
            build_report(args.workdir)
        elif args.command == "review":
            result = save_review(args.workdir, args.parcel, args.review_file)
            build_report(args.workdir)
        else:
            tests_file = args.workdir / "validation-results.json"
            result = build_report(args.workdir, read_json(tests_file) if tests_file.exists() else None)
        print(json.dumps(result, indent=2))
        return 0
    except Exception as error:
        if args.command in {"doctor", "generate"}:
            # No access tokens, source text or response bodies in diagnostic failures.
            write_json(args.workdir / "runtime_failure.json", {"status": "blocked_no_success_claim", "at": now(),
                "host": host_report(), "error_type": type(error).__name__, "message": str(error)})
        print(type(error).__name__ + ": " + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
