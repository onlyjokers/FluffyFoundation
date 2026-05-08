#!/usr/bin/env python3
"""
Purpose: Test the automatic FF acceptance-contract validator.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".harness" / "scripts"))

import validate_acceptance_contracts  # noqa: E402


class AcceptanceContractValidatorTests(unittest.TestCase):
    def test_acceptance_contracts_are_machine_checkable(self) -> None:
        errors = validate_acceptance_contracts.collect_errors()
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
