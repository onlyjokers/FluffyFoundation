#!/usr/bin/env python3
"""
Purpose: Validate that the FluffyFoundation completion harness is installed and internally consistent.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]

REQUIRED_FILES = [
    "docs/harness/README.md",
    "docs/harness/PLAN.md",
    "docs/harness/BOUNDARIES.md",
    "docs/harness/AI-OPERATOR.md",
    "docs/harness/QUALITY-GATES.md",
    "docs/harness/GOLDEN-SCENARIOS.md",
    "docs/harness/VERIFY.md",
    "docs/harness/REFERENCES.md",
    "docs/harness/ACCEPTANCE.md",
    ".harness/scripts/validate_acceptance_contracts.py",
    ".harness/status/current-phase.md",
    ".harness/status/current-task.md",
    ".harness/hotspots-allowlist.json",
    ".looooper/workflow.yaml",
    ".looooper/prompts/start1.md",
    ".looooper/prompts/plan.md",
    ".looooper/prompts/work.md",
    ".looooper/prompts/review.md",
    ".looooper/prompts/finish.md",
    ".looooper/schemas/start1-result.json",
    ".looooper/schemas/plan-result.json",
    ".looooper/schemas/work-result.json",
    ".looooper/schemas/review-result.json",
    ".looooper/schemas/finish-result.json",
]

REQUIRED_PLAN_TERMS = [
    "SemanticGraphSnapshot",
    "AI Operator",
    "Node Registry",
    "ControlPlane",
    "Display",
    "Command",
    "scopeGroupId",
    "Golden",
]

REQUIRED_PACKAGE_SCRIPTS = [
    "harness:validate",
    "harness:hotspots",
    "harness:verify",
    "verify",
]


def fail(message: str) -> None:
    print(f"[harness] FAIL: {message}")
    sys.exit(1)


def warn(message: str) -> None:
    print(f"[harness] WARN: {message}")


def read_text(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def check_required_files() -> None:
    missing = [path for path in REQUIRED_FILES if not (ROOT / path).is_file()]
    if missing:
        fail("missing required files:\n" + "\n".join(f"- {path}" for path in missing))


def check_plan_ids() -> None:
    plan = read_text("docs/harness/PLAN.md")
    ids = re.findall(r"^## (FF-\d{2})\b", plan, flags=re.MULTILINE)
    if len(ids) != 25:
        fail(f"expected exactly 25 top-level FF plan items, found {len(ids)}: {ids}")
    duplicates = sorted({item for item in ids if ids.count(item) > 1})
    if duplicates:
        fail("duplicate PLAN IDs: " + ", ".join(duplicates))
    expected = [f"FF-{i:02d}" for i in range(25)]
    if ids != expected:
        fail(f"PLAN IDs must be sequential FF-00..FF-24, found {ids}")
    for term in REQUIRED_PLAN_TERMS:
        if term not in plan:
            fail(f"PLAN.md missing required term: {term}")


def check_status_points_to_plan() -> None:
    plan = read_text("docs/harness/PLAN.md")
    current_task = read_text(".harness/status/current-task.md")
    match = re.search(r"\bFF-\d{2}\b", current_task)
    if not match:
        fail(".harness/status/current-task.md does not contain an FF task ID")
    task_id = match.group(0)
    if f"## {task_id} " not in plan:
        fail(f"current task {task_id} is not present as a PLAN heading")


def check_workflow_refs() -> None:
    workflow = read_text(".looooper/workflow.yaml")
    refs = re.findall(r"^\s*(?:prompt|output_schema):\s*([A-Za-z0-9_./-]+)", workflow, flags=re.MULTILINE)
    for ref in refs:
        path = ROOT / ".looooper" / ref
        if not path.is_file():
            fail(f".looooper/workflow.yaml references missing file: {ref}")


def check_json_files() -> None:
    for path in [
        ".harness/hotspots-allowlist.json",
        ".looooper/schemas/start1-result.json",
        ".looooper/schemas/plan-result.json",
        ".looooper/schemas/work-result.json",
        ".looooper/schemas/review-result.json",
        ".looooper/schemas/finish-result.json",
        ".looooper/user-templates.json",
    ]:
        full = ROOT / path
        if full.exists():
            try:
                json.loads(full.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                fail(f"invalid JSON in {path}: {exc}")


def check_package_scripts() -> None:
    package_path = ROOT / "package.json"
    if not package_path.is_file():
        fail("missing package.json")
    data = json.loads(package_path.read_text(encoding="utf-8"))
    scripts = data.get("scripts", {})
    missing = [script for script in REQUIRED_PACKAGE_SCRIPTS if script not in scripts]
    if missing:
        fail("package.json missing scripts: " + ", ".join(missing))


def check_local_markdown_links() -> None:
    for md_path in (ROOT / "docs" / "harness").glob("*.md"):
        text = md_path.read_text(encoding="utf-8")
        for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", text):
            if "://" in target or target.startswith("#"):
                continue
            local = (md_path.parent / target.split("#", 1)[0]).resolve()
            if target and not local.exists():
                fail(f"broken local markdown link in {md_path.relative_to(ROOT)}: {target}")


def check_acceptance_contracts() -> None:
    import validate_acceptance_contracts

    errors = validate_acceptance_contracts.collect_errors()
    if errors:
        fail("automatic acceptance contract validation failed:\n" + "\n".join(f"- {error}" for error in errors))


def main() -> None:
    check_required_files()
    check_plan_ids()
    check_status_points_to_plan()
    check_workflow_refs()
    check_json_files()
    check_package_scripts()
    check_local_markdown_links()
    check_acceptance_contracts()
    warn("validate_harness checks structure, not product correctness; run pnpm verify for product gates.")
    print("[harness] PASS: harness structure is valid")


if __name__ == "__main__":
    main()
