#!/usr/bin/env python3
"""
Purpose: Validate machine-checkable FF acceptance contracts and automatic stop gates.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]

CONTRACT_IDS = [f"FF-{item:02d}" for item in range(18, 25)]

REQUIRED_ACCEPTANCE_TERMS = [
    "## Automatic Acceptance Decision Model",
    "Codex has no discretionary acceptance authority",
    "default decision is `stop`",
    "deferred proof is rejected by default",
    "## Automatic Risk Severity Matrix",
    "## Failure Fingerprint Gate",
    "## Browser Runtime Proof Gate",
    "## Machine Contract Fields",
]

REQUIRED_CONTRACT_SECTIONS = [
    "## Objective",
    "## Scope",
    "## Non-goals",
    "## Acceptance criteria",
    "## Validation",
    "## Stop conditions",
    "## Final report",
    "## Machine contract",
]

REQUIRED_MACHINE_FIELDS = [
    "Contract ID:",
    "Completion decision:",
    "Allowed paths:",
    "Forbidden paths:",
    "Required proof types:",
    "Runtime/browser proof:",
    "Deferred proof policy:",
    "Risk severity policy:",
    "Failure fingerprint policy:",
    "Next item start policy:",
    "Automated validation command:",
]


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def contract_path(contract_id: str) -> Path:
    if contract_id == "FF-18":
        return ROOT / ".harness" / "goals" / "FF-18-review-contract.md"
    return ROOT / ".harness" / "goals" / f"{contract_id}-contract.md"


def collect_errors() -> list[str]:
    errors: list[str] = []

    acceptance_path = ROOT / "docs" / "harness" / "ACCEPTANCE.md"
    if not acceptance_path.is_file():
        return ["docs/harness/ACCEPTANCE.md is missing"]

    acceptance = read_text(acceptance_path)
    for term in REQUIRED_ACCEPTANCE_TERMS:
        if term not in acceptance:
            errors.append(f"ACCEPTANCE.md missing automatic gate term: {term}")

    for contract_id in CONTRACT_IDS:
        path = contract_path(contract_id)
        if not path.is_file():
            errors.append(f"{contract_id} contract is missing: {path.relative_to(ROOT)}")
            continue

        text = read_text(path)
        for section in REQUIRED_CONTRACT_SECTIONS:
            if section not in text:
                errors.append(f"{path.relative_to(ROOT)} missing section: {section}")
        for field in REQUIRED_MACHINE_FIELDS:
            if field not in text:
                errors.append(f"{path.relative_to(ROOT)} missing machine field: {field}")

        expected_id = re.escape(contract_id)
        if not re.search(rf"Contract ID:\s*`?{expected_id}`?", text):
            errors.append(f"{path.relative_to(ROOT)} has no matching Contract ID for {contract_id}")

        if "Deferred proof policy: `reject-by-default`" not in text:
            errors.append(f"{path.relative_to(ROOT)} must reject deferred proof by default")
        if "Next item start policy: `forbidden-until-complete`" not in text:
            errors.append(f"{path.relative_to(ROOT)} must forbid starting the next item until complete")
        if "Failure fingerprint policy: `exact-baseline-required`" not in text:
            errors.append(f"{path.relative_to(ROOT)} must require exact baseline failure fingerprints")

    return errors


def main() -> None:
    errors = collect_errors()
    if errors:
        print("[acceptance] FAIL: automatic acceptance contracts are incomplete")
        for error in errors:
            print(f"- {error}")
        sys.exit(1)
    print("[acceptance] PASS: automatic acceptance contracts are machine-checkable")


if __name__ == "__main__":
    main()
