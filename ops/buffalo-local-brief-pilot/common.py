"""Small offline utilities. No database, cloud model, or publishing client."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import tempfile

VERSION = "buffalo-local-brief-v1"
PROMPT_VERSION = "buffalo-evidence-first-v1"
VALIDATOR_VERSION = "buffalo-local-validator-v1"
JURISDICTION = "city-of-buffalo-ny"
SOURCE = "https://data.buffalony.gov/resource/ivrf-k9vm.json"
DEFINITIONS_URL = "https://www.tax.ny.gov/research/property/assess/manuals/prclas.htm"
MANIFEST_SHA = "e8a160bb048efb984f54008248ceba5c9cc6fa83f564483743038e00428a2e68"
FULL_SNAPSHOT_SHA = "2dcc543ab8109e8518b54b69927bb2ffd68796bc3b5f3b81125b6f4fd4fce368"
HELD_IDS = {"538939", "538938", "539418", "539421"}
CLASS_TYPES = {
    "210": "One family year-round residence",
    "220": "Two family year-round residence",
    "230": "Three family year-round residence",
}
UNKNOWN_CATALOG = {
    "current_disposition": "Current violation disposition and present physical condition have not been checked.",
    "case_opening": "Case opening dates are unavailable; violation dates are not substituted for them.",
    "full_history": "Only the selected violation window is briefed; this is not the full enforcement history.",
    "classification_current_use": "Residential classification is from the collected agency field, not a new assessor or site check.",
    "ownership_form": "Condominium, cooperative, association and townhouse status are unknown; residential class does not exclude them.",
    "occupancy_owner_intent": "Current occupancy, ownership and owner intent are unknown.",
    "financial_legal": "Value, repair cost, liens, foreclosure status and transaction outcomes are unknown.",
    "deadlines": "No current enforceable deadline has been independently established.",
    "upstream_freshness": "Collection time is known; the agency update time is not bound to these individual records.",
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def digest(value):
    if not isinstance(value, bytes):
        value = (value if isinstance(value, str) else canonical(value)).encode("utf-8")
    return hashlib.sha256(value).hexdigest()


def file_hash(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def timestamp(value):
    t = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    require(t.tzinfo is not None, "Timestamp needs an explicit timezone")
    return t


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def atomic_text(path, text):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(prefix=".pending-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def write_json(path, value):
    atomic_text(path, json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n")


def without_hash(value, key="input_sha256"):
    return {k: v for k, v in value.items() if k != key}
