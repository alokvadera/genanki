# Usage: python3 scripts/coverage-report.py
"""Per-metric coverage report for `src/lib/**` and `src/hooks/**`.

Derives *line* coverage from `statementMap` start-lines (mirrors
`FileCoverage.prototype.getLineCoverage()` so the number matches what
`npx vitest run --coverage` prints in its text summary even when the
istanbul JSON omits the top-level `l` field).

Reads `vitest.config.ts` thresholds block via regex at runtime, so
the printed HEADROOM numbers stay in sync with the test-runner without
manual updates when the user edits the threshold floor.

Warning messages emit on stderr when vitest.config.ts thresholds
cannot be parsed; CI consumers that only need stdout numbers should
pipe them away, e.g.:

    python3 scripts/coverage-report.py 2>/dev/null
"""
from __future__ import annotations
from pathlib import Path
from typing import Any
import json
import re
import sys


REPO_ROOT = Path(__file__).resolve().parents[1]
COVERAGE_PATH = REPO_ROOT / "coverage" / "coverage-final.json"
VITEST_CONFIG_PATH = REPO_ROOT / "vitest.config.ts"
SCOPE_PREFIXES = ("src/lib/", "src/hooks/")

# Fallback thresholds used when vitest.config.ts is missing or its
# thresholds block cannot be parsed. These mirror the prior
# pre-2026-07-21 floor and are a fail-safe, not the authoritative
# source — the script's contract is to read live values from
# vitest.config.ts. A stderr warning is emitted whenever a fallback
# is used.
DEFAULT_THRESHOLDS = {"lines": 98, "functions": 99, "branches": 94, "statements": 98}


def per_metric(data: dict[str, Any]) -> dict[str, tuple[int, int]]:
    """Return (hit, total) for statements / branches / functions / lines.

    Lines are derived from `statementMap.start.line` because the istanbul
    JSON in this repo does not include a top-level `l` field.  Istanbul's
    own `getLineCoverage()` groups execution counts by `start.line` and
    takes the per-line max, so we mirror that exactly.
    """
    s = data.get("s", {})
    b = data.get("b", {})
    f = data.get("f", {})
    statement_map = data.get("statementMap", {})

    sh = sum(1 for v in s.values() if isinstance(v, int) and v > 0)
    st = len(s)

    bvals: list[int] = []
    for v in b.values():
        if isinstance(v, list):
            bvals.extend(v)
        elif isinstance(v, int):
            bvals.append(v)
    bh = sum(1 for v in bvals if v > 0)
    bt = len(bvals)

    fh = sum(1 for v in f.values() if isinstance(v, int) and v > 0)
    ft = sum(1 for v in f.values() if isinstance(v, int))

    line_hits: dict[int, int] = {}
    for st_id, count in s.items():
        info = statement_map.get(st_id)
        if not info or not isinstance(count, int):
            continue
        start_line = info["start"]["line"]
        # Istanbul: per-line max over co-located statements.
        line_hits[start_line] = max(line_hits.get(start_line, 0), count)
    lh = sum(1 for hits in line_hits.values() if hits > 0)
    lt = len(line_hits)

    return {"s": (sh, st), "b": (bh, bt), "f": (fh, ft), "l": (lh, lt)}


def pct(hit: int, total: int) -> float:
    return 100.0 * hit / total if total else 0.0


def read_thresholds() -> dict[str, int]:
    """Parse the thresholds block from vitest.config.ts via regex;
    fall back to ``DEFAULT_THRESHOLDS`` on missing file, missing
    block, or any missing-key parse. The regex requires ``\\d+``
    so malformed integer literals (e.g. ``lines: ninety-eight``)
    surface as missing keys rather than raising. A stderr warning
    is emitted on every fallback path; see the contract comment
    above the thresholds block in `vitest.config.ts` for the
    parsing contract.
    """
    if not VITEST_CONFIG_PATH.exists():
        print(
            f"⚠ read_thresholds: vitest.config.ts not found at "
            f"{VITEST_CONFIG_PATH}; falling back to DEFAULT_THRESHOLDS "
            f"for HEADROOM. The HEADROOM block will reflect defaults, "
            f"not the test-runner's actual floor. See the contract "
            f"comment above the thresholds block (typically in "
            f"vitest.config.ts).",
            file=sys.stderr,
        )
        return DEFAULT_THRESHOLDS
    text = VITEST_CONFIG_PATH.read_text()
    block = re.search(r"thresholds:\s*\{([^}]*)\}", text)
    if not block:
        print(
            f"⚠ read_thresholds: `thresholds: {{ ... }}` block "
            f"not found in vitest.config.ts; falling back to "
            f"DEFAULT_THRESHOLDS for HEADROOM. The HEADROOM block "
            f"may drift from the test-runner. See the contract "
            f"comment above the thresholds block.",
            file=sys.stderr,
        )
        return DEFAULT_THRESHOLDS
    found: dict[str, int] = {}
    for match in re.finditer(
        r"(lines|functions|branches|statements):\s*(\d+)",
        block.group(1),
    ):
        found[match.group(1)] = int(match.group(2))
    # Sort missing keys for deterministic warning text.
    missing = [k for k in DEFAULT_THRESHOLDS if k not in found]
    if missing:
        print(
            f"⚠ read_thresholds: parsed {len(found)}/4 thresholds "
            f"({sorted(found.keys())}); missing keys={sorted(missing)} "
            f"— falling back to DEFAULT_THRESHOLDS for those. "
            f"HEADROOM block may drift from the actual "
            f"vitest.config.ts. See the contract comment immediately "
            f"above the thresholds block in vitest.config.ts, and "
            f"check its shape (no nested objects, integer values "
            f"only).",
            file=sys.stderr,
        )
    return {**DEFAULT_THRESHOLDS, **found}


def load_coverage() -> dict[str, Any]:
    if not COVERAGE_PATH.exists():
        raise SystemExit(
            f"Missing {COVERAGE_PATH}. Run: rm -rf coverage && "
            "npx vitest run --coverage"
        )
    return json.loads(COVERAGE_PATH.read_text())


def in_scope(path: str) -> bool:
    rel = path.replace(str(REPO_ROOT) + "/", "")
    return rel.startswith(SCOPE_PREFIXES)


def main() -> None:
    coverage = load_coverage()

    agg = {"s": (0, 0), "b": (0, 0), "f": (0, 0), "l": (0, 0)}
    per_file: list[tuple[str, dict[str, tuple[int, int]]]] = []

    for path, data in coverage.items():
        if not in_scope(path):
            continue
        m = per_metric(data)
        per_file.append((path, m))
        for k in agg:
            agg[k] = (agg[k][0] + m[k][0], agg[k][1] + m[k][1])

    print("=== AGGREGATE (src/lib/** + src/hooks/**) ===")
    print(f"statements: {agg['s'][0]}/{agg['s'][1]} = {pct(*agg['s']):.2f}%")
    print(f"branches:   {agg['b'][0]}/{agg['b'][1]} = {pct(*agg['b']):.2f}%")
    print(f"functions:  {agg['f'][0]}/{agg['f'][1]} = {pct(*agg['f']):.2f}%")
    print(f"lines:      {agg['l'][0]}/{agg['l'][1]} = {pct(*agg['l']):.2f}%")

    thresholds = read_thresholds()
    print()
    print("=== HEADROOM (thresholds from vitest.config.ts) ===")
    print(f"  lines={thresholds['lines']}      "
          f"→ {pct(*agg['l']) - thresholds['lines']:+.2f}pp")
    print(f"  functions={thresholds['functions']}  "
          f"→ {pct(*agg['f']) - thresholds['functions']:+.2f}pp")
    print(f"  branches={thresholds['branches']}   "
          f"→ {pct(*agg['b']) - thresholds['branches']:+.2f}pp")
    print(f"  statements={thresholds['statements']} "
          f"→ {pct(*agg['s']) - thresholds['statements']:+.2f}pp")

    # Per-file diagnostic — files dragging branches below 97%.
    print()
    print("=== FILES WITH branches < 97% (cascade-free push targets) ===")
    rows = []
    for path, m in per_file:
        bh, bt = m["b"]
        if bt:
            rows.append((path, pct(bh, bt), (bh, bt)))
    rows.sort(key=lambda r: r[1])
    for path, ratio, raw in rows:
        if ratio >= 97.0:
            continue
        rel = path.replace(str(REPO_ROOT) + "/", "")
        print(f"  {ratio:6.2f}%  ({raw[0]}/{raw[1]})  {rel}")


if __name__ == "__main__":
    main()
