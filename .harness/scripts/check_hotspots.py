#!/usr/bin/env python3
"""
Purpose: Enforce the no-god-object line-count ratchet for source hotspots.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ALLOWLIST_PATH = ROOT / ".harness" / "hotspots-allowlist.json"
SOURCE_SUFFIXES = {".ts", ".svelte"}
SKIP_PARTS = {
    ".git",
    "node_modules",
    ".svelte-kit",
    ".svelte-kit-client",
    ".svelte-kit-display",
    ".svelte-kit-manager",
    "dist",
    "dist-out",
    "dist-dev",
    "dist-dev-local",
    "dist-node-core",
    "dist-protocol-out",
    "dist-sdk-manager-out",
    "dist-visual-effects-out",
    "dist-visual-plugins-out",
    "dist-audio-plugins-out",
    "dist-ai-core",
    "build",
}


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def count_lines(path: Path) -> int:
    try:
        return len(path.read_text(encoding="utf-8", errors="ignore").splitlines())
    except OSError as exc:
        print(f"[hotspots] WARN: cannot read {rel(path)}: {exc}")
        return 0


def should_skip(path: Path) -> bool:
    return any(part in SKIP_PARTS for part in path.parts)


def iter_source_files() -> list[Path]:
    files: list[Path] = []
    for root_name in ("apps", "packages"):
        root = ROOT / root_name
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if path.is_file() and path.suffix in SOURCE_SUFFIXES and not should_skip(path):
                files.append(path)
    return files


def main() -> None:
    if not ALLOWLIST_PATH.is_file():
        print("[hotspots] FAIL: missing .harness/hotspots-allowlist.json")
        sys.exit(1)

    config = json.loads(ALLOWLIST_PATH.read_text(encoding="utf-8"))
    thresholds = config.get("thresholds", {})
    watch = int(thresholds.get("watch", 600))
    split_required = int(thresholds.get("split_required", 600))
    block_unlisted = int(thresholds.get("block_unlisted", 800))
    allowlist = config.get("files", {})

    failures: list[str] = []
    warnings: list[str] = []
    top: list[tuple[int, str]] = []

    for path in iter_source_files():
        relative = rel(path)
        lines = count_lines(path)
        top.append((lines, relative))

        entry = allowlist.get(relative)
        if entry:
            max_lines = int(entry.get("max_lines", 0))
            if lines >= block_unlisted:
                failures.append(f"{relative}: {lines} lines >= {block_unlisted}")
            elif max_lines > 0 and lines > max_lines:
                warnings.append(f"{relative}: {lines} lines exceeds ratchet max {max_lines}")
            continue

        if lines >= block_unlisted:
            failures.append(f"{relative}: {lines} lines >= {block_unlisted} and is not allowlisted")
        elif lines >= split_required:
            warnings.append(f"{relative}: {lines} lines >= {split_required}; split owner required")
        elif lines >= watch:
            warnings.append(f"{relative}: {lines} lines >= {watch}; watch growth")

    for message in warnings[:50]:
        print(f"[hotspots] WARN: {message}")
    if len(warnings) > 50:
        print(f"[hotspots] WARN: {len(warnings) - 50} additional warnings omitted")

    print("[hotspots] top files:")
    for lines, relative in sorted(top, reverse=True)[:20]:
        print(f"{lines:5d} {relative}")

    if failures:
        print("[hotspots] FAIL:")
        for failure in failures:
            print(f"- {failure}")
        sys.exit(1)

    print("[hotspots] PASS: hotspot ratchet satisfied")


if __name__ == "__main__":
    main()
