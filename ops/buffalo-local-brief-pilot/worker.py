"""Sequential, resumable LM Studio client. Production CLI requires Apple Silicon macOS."""
from __future__ import annotations

import contextlib
import fcntl
import ipaddress
import json
import os
from pathlib import Path
import platform
import plistlib
import re
import resource
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

from brief import (PROMPT_VERSION, prompt_hash, request_body, review_template,
                   validate_draft, validate_review)
from common import (VALIDATOR_VERSION, digest, file_hash, now, read_json, require,
                    timestamp, write_json)
from evidence import load_packages


def endpoint_origin(url):
    p = urllib.parse.urlsplit(url)
    require(p.scheme == "http" and p.hostname in {"127.0.0.1", "::1"} and p.port is not None and
            not p.username and not p.password and not p.query and not p.fragment and p.path in {"", "/"},
            "Use a literal loopback HTTP origin with a port, e.g. http://127.0.0.1:1234. Public/LAN endpoints are refused.")
    require(ipaddress.ip_address(p.hostname).is_loopback, "Endpoint must remain private")
    return url.rstrip("/")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("LM Studio redirects are refused")


class LocalHTTP:
    def __init__(self, origin):
        self.origin = endpoint_origin(origin)
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def call(self, path, body=None, timeout=10):
        require(path in {"/api/v1/models", "/api/v0/models", "/v1/models", "/v1/chat/completions"}, "Unsupported local API")
        headers = {"Content-Type": "application/json"}
        token = os.environ.get("LM_STUDIO_API_TOKEN")
        if token:
            headers["Authorization"] = "Bearer " + token
        req = urllib.request.Request(self.origin + path, data=None if body is None else json.dumps(body).encode(), headers=headers)
        with self.opener.open(req, timeout=timeout) as response:
            require(response.geturl().startswith(self.origin + "/"), "Unexpected API destination")
            return json.load(response)


def command(args):
    return subprocess.check_output(args, text=True, timeout=10).strip()


def host_report():
    report = {"system": platform.system(), "machine": platform.machine(), "python": platform.python_version(),
              "macos_version": platform.mac_ver()[0] or None, "observed_at": now()}
    if report["system"] == "Darwin":
        report.update(cpu=command(["/usr/sbin/sysctl", "-n", "machdep.cpu.brand_string"]),
                      physical_memory_bytes=int(command(["/usr/sbin/sysctl", "-n", "hw.memsize"])))
        path = Path("/Applications/LM Studio.app/Contents/Info.plist")
        if path.exists():
            with path.open("rb") as stream:
                app = plistlib.load(stream)
            report["lm_studio_app_version"] = app.get("CFBundleShortVersionString")
    return report


def normalize_native(payload, version):
    models = payload.get("models" if version == "v1" else "data", [])
    require(isinstance(models, list), "Malformed LM Studio native model list")
    result = []
    for m in models:
        if m.get("type") not in {"llm", "vlm"}:
            continue
        if version == "v1":
            instances = m.get("loaded_instances", [])
            quant = m.get("quantization") or {}
            for instance in instances:
                result.append({"model_key": m.get("key"), "instance_id": instance.get("id"),
                    "display_name": m.get("display_name"), "publisher": m.get("publisher"),
                    "format": m.get("format"), "architecture": m.get("architecture"),
                    "quantization": quant, "parameters": m.get("params_string"),
                    "model_file_size_bytes": m.get("size_bytes"), "loaded_config": instance.get("config", {}),
                    "native_api": "v1", "selected_variant": m.get("selected_variant")})
        elif m.get("state") == "loaded":
            result.append({"model_key": m.get("id"), "instance_id": m.get("id"),
                "display_name": m.get("id"), "publisher": m.get("publisher"),
                "format": m.get("compatibility_type"), "architecture": m.get("arch"),
                "quantization": {"name": m.get("quantization")}, "parameters": m.get("params_string"),
                "model_file_size_bytes": m.get("size_bytes"), "loaded_config": {"context_length": m.get("loaded_context_length")},
                "native_api": "v0", "selected_variant": None})
    return result


def expected_model(m):
    identity = " ".join(str(m.get(k) or "") for k in ("model_key", "display_name", "architecture"))
    params = str(m.get("parameters") or identity)
    q = m.get("quantization") or {}
    bits = q.get("bits_per_weight")
    four = bits == 4 or (bits is None and bool(re.search(r"(?:4[ _-]?bit|q4(?:\b|_)|\b4$)", str(q.get("name", "")), re.I)))
    return (bool(re.search(r"qwen[ ._-]?3[ ._-]?5", identity, re.I)) and
            bool(re.search(r"(?:^|[^0-9])9\s*[bB](?:\b|[_-])", params)) and four and m.get("format") == "mlx")


class MacRuntime:
    def __init__(self, origin="http://127.0.0.1:1234"):
        self.http = LocalHTTP(origin)

    def doctor(self, model=None):
        h = host_report()
        # Never probe this cloud container's loopback and call it the user's Mac.
        require(h["system"] == "Darwin" and h["machine"] == "arm64",
                "Mac execution unavailable: this process is " + h["system"] + "/" + h["machine"] + ". Run the supplied worker on your Mac.")
        require(h.get("physical_memory_bytes", 0) >= 16 * 1024 ** 3, "Pilot expects at least 16 GiB of physical memory")
        try:
            native = self.http.call("/api/v1/models")
            version = "v1"
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise
            native, version = self.http.call("/api/v0/models"), "v0"
        available = normalize_native(native, version)
        matches = [m for m in available if expected_model(m) and (model is None or model in {m["instance_id"], m["model_key"]})]
        require(len(matches) == 1, "Load exactly one Qwen3.5 9B MLX 4-bit instance, or pass its exact loaded --model ID; native metadata must establish identity/format/quantization.")
        selected = matches[0]
        context = selected.get("loaded_config", {}).get("context_length")
        require(isinstance(context, int) and context >= 8192,
                "Load the local model with a verified context length of at least 8192 tokens, then rerun doctor.")
        public = self.http.call("/v1/models")
        require(selected["instance_id"] in {m["id"] for m in public.get("data", [])}, "Native loaded instance is not exposed by the compatible API")
        return {"status": "verified_local_connection", "host": h, "model": selected,
                "model_identity_sha256": digest(selected), "endpoint": self.http.origin,
                "expected_hardware": {"cpu": "Apple M1", "physical_memory_bytes": 16 * 1024 ** 3},
                "matches_reported_cpu": h.get("cpu") == "Apple M1", "observed_at": now()}

    def complete(self, body):
        return self.http.call("/v1/chat/completions", body, timeout=900)


def mac_memory_sample():
    """Actual OS observations, not a claim of model-only Metal memory usage."""
    vm = command(["/usr/bin/vm_stat"])
    page_match = re.search(r"page size of (\d+) bytes", vm)
    pages = {k.strip(): int(v) for k, v in re.findall(r"^([^:\n]+):\s+(\d+)\.", vm, re.M)}
    processes = []
    for line in command(["/bin/ps", "-axo", "pid=,rss=,comm="]).splitlines():
        values = line.strip().split(None, 2)
        if len(values) == 3 and re.search(r"LM Studio|llmster|mlx|llm-engine", values[2], re.I):
            processes.append({"pid": int(values[0]), "rss_kib": int(values[1]), "name": Path(values[2]).name})
    swap = command(["/usr/sbin/sysctl", "-n", "vm.swapusage"])
    return {"at": now(), "vm_page_size_bytes": int(page_match.group(1)) if page_match else None,
            "vm_pages": pages, "swapusage": swap, "model_runtime_processes": processes,
            "runtime_process_rss_sum_mib": round(sum(p["rss_kib"] for p in processes) / 1024, 3),
            "worker_peak_rss_mib": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024 ** 2, 3)}


class MemoryMonitor:
    def __init__(self, sample=mac_memory_sample):
        self.sample = sample
        self.samples, self.errors, self.stop = [], [], threading.Event()

    def capture(self):
        try:
            self.samples.append(self.sample())
        except Exception as error:
            self.errors.append(type(error).__name__ + ": " + str(error))

    def loop(self):
        while not self.stop.wait(1):
            self.capture()

    def __enter__(self):
        self.capture()
        self.thread = threading.Thread(target=self.loop, daemon=True)
        self.thread.start()
        return self

    def __exit__(self, *_):
        self.stop.set()
        self.thread.join(timeout=10)
        self.capture()

    def result(self):
        return {"samples": self.samples, "errors": self.errors,
            "sampling_interval_seconds": 1,
            "peak_observed_runtime_process_rss_sum_mib": max((s["runtime_process_rss_sum_mib"] for s in self.samples), default=None),
            "limitation": "OS process RSS sum can double-count shared pages and omit Metal allocations; this is not exact model-only unified-memory use. VM pages and swap are system-wide. Model file size is not runtime memory."}


@contextlib.contextmanager
def worker_lock(workdir):
    path = Path(workdir) / ".worker.lock"
    with path.open("a") as stream:
        try:
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError("Another local worker holds this pilot lock")
        try:
            yield
        finally:
            fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


def result_key(package, doctor):
    return digest({"input_sha256": package["input_sha256"], "prompt_sha256": prompt_hash(package),
        "model_identity_sha256": doctor["model_identity_sha256"], "validator_version": VALIDATOR_VERSION,
        "temperature": 0.1, "max_tokens": 2200})


def latest_result(workdir, package):
    pointer = Path(workdir) / "runs" / package["parcel_id"] / "latest.json"
    if not pointer.exists():
        return None
    key = read_json(pointer)["result_key"]
    require(re.fullmatch(r"[0-9a-f]{64}", key) is not None, "Unsafe result path")
    root = pointer.parent / key
    require((root / "metadata.json").exists(), "Incomplete result metadata")
    meta = read_json(root / "metadata.json")
    require(meta["input_sha256"] == package["input_sha256"] and meta["result_key"] == key, "Result evidence mismatch")
    require(file_hash(root / "draft.json") == meta["draft_file_sha256"], "Draft changed outside an explicit correction")
    require(re.fullmatch(r"\d+-[0-9a-f]{8}", meta["attempt"]) is not None and
            file_hash(root / "attempts" / meta["attempt"] / "response.json") == meta["response_file_sha256"], "Saved response changed")
    return root, meta, read_json(root / "draft.json")


def check_evidence_review(workdir, package):
    review = read_json(Path(workdir) / "properties" / package["parcel_id"] / "evidence_review.json")
    require(review.get("status") == "reviewed" and review.get("input_sha256") == package["input_sha256"] and
            review.get("originals_file_sha256") == file_hash(Path(workdir) / "properties" / package["parcel_id"] / "originals.json") and
            review.get("all_selected_records_checked") is True and review.get("reviewer") and review.get("note"),
            "Evidence needs a recorded source review for this exact input")


def generate(workdir, runtime, model=None, limit=1, historical_note=None, monitor_factory=MemoryMonitor):
    workdir = Path(workdir)
    require(1 <= limit <= 10, "Limit must be from one through ten")
    packages = load_packages(workdir)
    results = []
    with worker_lock(workdir):
        doctor = runtime.doctor(model)
        write_json(workdir / "runtime_check.json", doctor)
        if limit > 1:
            first = latest_result(workdir, packages[0])
            require(first is not None and (first[0] / "review.json").exists(),
                    "Generate and source-review the first property before running the remaining selection.")
            require(first[1]["result_key"] == result_key(packages[0], doctor),
                    "The model, prompt, configuration or first input changed; review a new first trial before continuing.")
            validate_review(packages[0], first[2], read_json(first[0] / "review.json"), first[0] / "draft.json")
            require(read_json(first[0] / "review.json")["status"] == "approved", "First trial is held; revise before continuing.")
        for package in packages[:limit]:
            check_evidence_review(workdir, package)
            age = (timestamp(now()) - timestamp(package["summary"]["oldest_collection"])).total_seconds() / 3600
            require(age >= 0, "Future source collection")
            require(age <= 48 or (historical_note is not None and len(historical_note.strip()) >= 20),
                    "Snapshot exceeds the 48-hour local review threshold. Reuse it only with an explicit --historical-note explaining the historical scope; no current-status claim.")
            key = result_key(package, doctor)
            root = workdir / "runs" / package["parcel_id"] / key
            root.mkdir(parents=True, exist_ok=True, mode=0o700)
            if (root / "metadata.json").exists():
                meta = read_json(root / "metadata.json")
                require(meta["input_sha256"] == package["input_sha256"] and
                        file_hash(root / "draft.json") == meta["draft_file_sha256"], "Completed result integrity failure")
                require(re.fullmatch(r"\d+-[0-9a-f]{8}", meta["attempt"]) is not None and
                        file_hash(root / "attempts" / meta["attempt"] / "response.json") == meta["response_file_sha256"], "Saved response changed")
                write_json(root.parent / "latest.json", {"result_key": key})
                results.append({"parcel_id": package["parcel_id"], "status": "reused_unchanged", "result_key": key})
                continue
            attempts = sorted(root.glob("attempts/*/response.json"))
            if attempts:
                # A durable response exists even if interruption prevented draft/metadata save.
                attempt = attempts[-1].parent
                response = read_json(attempt / "response.json")
                receipt = read_json(attempt / "receipt.json") if (attempt / "receipt.json").exists() else {
                    "generation_wall_seconds": None, "memory": None,
                    "performance_note": "Response recovered after interruption before timing receipt was committed; do not impute timing or memory."}
                state = "recovered_saved_response"
            else:
                # A killed in-flight HTTP call cannot be recovered without a saved response.
                # Keep it as an interrupted/unknown attempt, never a successful generation.
                for pending in root.glob("attempts/*/request.json"):
                    if not (pending.parent / "response.json").exists():
                        write_json(pending.parent / "interrupted.json", {"observed_at": now(),
                            "status": "no_durable_response_server_completion_unknown"})
                attempt = root / "attempts" / (str(time.time_ns()) + "-" + uuid.uuid4().hex[:8])
                body = request_body(package, doctor["model"]["instance_id"])
                write_json(attempt / "request.json", {"body": body, "request_sha256": digest(body), "started_at": now()})
                start = time.perf_counter()
                try:
                    with monitor_factory() as monitor:
                        start = time.perf_counter()
                        response = runtime.complete(body)
                        wall = time.perf_counter() - start
                    # Save response BEFORE deriving anything else. Restart never re-POSTs it.
                    write_json(attempt / "response.json", response)
                    receipt = {"generation_wall_seconds": round(wall, 4), "memory": monitor.result(),
                        "finished_at": now(), "usage": response.get("usage"),
                        "performance_note": "End-to-end local HTTP time includes prompt processing and decoding; no TTFT claim."}
                    write_json(attempt / "receipt.json", receipt)
                except BaseException as error:
                    write_json(attempt / "failure.json", {"at": now(), "error_type": type(error).__name__,
                        "status": "no_success_claim", "generation_wall_seconds": round(time.perf_counter() - start, 4)})
                    raise
                state = "generated"
            errors = []
            try:
                require(response.get("model") in {doctor["model"]["instance_id"], doctor["model"]["model_key"]}, "Response model mismatch")
                require(response["choices"][0]["finish_reason"] == "stop", "Truncated or abnormal completion")
                content = response["choices"][0]["message"]["content"]
                require(isinstance(content, str), "No text response")
                draft = json.loads(content)
                require(isinstance(draft, dict), "Model JSON must be an object")
            except (ValueError, KeyError, IndexError, TypeError) as error:
                draft = {"unparsed_response_saved_separately": True}
                errors.append("response_parse_or_identity:" + str(error))
            validation = validate_draft(package, draft)
            validation["errors"] = errors + validation["errors"]
            validation["passed"] = not validation["errors"]
            validation["review_status"] = "awaiting_human_review" if validation["passed"] else "held"
            write_json(root / "draft.json", draft)
            write_json(root / "validation.json", validation)
            write_json(root / "review_template.json", review_template(package, draft, root / "draft.json"))
            meta = {"status": state, "result_key": key, "input_sha256": package["input_sha256"],
                "prompt_version": PROMPT_VERSION, "prompt_sha256": prompt_hash(package),
                "validator_version": VALIDATOR_VERSION, "doctor": doctor,
                "response_file_sha256": file_hash(attempt / "response.json"),
                "draft_file_sha256": file_hash(root / "draft.json"),
                "attempt": attempt.name, "generation": receipt, "recorded_at": now(),
                "source_collection_age_hours_at_run": round(age, 4), "historical_note": historical_note,
                "review_status": validation["review_status"], "production_write": False}
            write_json(root / "metadata.json", meta)
            write_json(root.parent / "latest.json", {"result_key": key})
            results.append({"parcel_id": package["parcel_id"], "status": state, "validation_passed": validation["passed"], "result_key": key})
    return results


def save_review(workdir, parcel, review_file):
    package = next((p for p in load_packages(workdir) if p["parcel_id"] == parcel), None)
    require(package is not None, "Parcel is outside this ten-property pilot")
    current = latest_result(workdir, package)
    require(current is not None, "No local model result exists")
    root, meta, draft = current
    review = validate_review(package, draft, read_json(review_file), root / "draft.json")
    write_json(root / "reviews" / (str(time.time_ns()) + ".json"), review)
    write_json(root / "review.json", review)
    return {"parcel_id": parcel, "status": review["status"], "output_sha256": review["output_sha256"]}
