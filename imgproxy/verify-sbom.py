#!/usr/bin/env python3

import json
import pathlib
import sys

sbom_dir = pathlib.Path(sys.argv[1])
sboms = sorted(sbom_dir.glob("*.json"))
if not sboms:
    raise SystemExit(f"no SBOMs found in {sbom_dir}")

for sbom in sboms:
    if json.loads(sbom.read_text()).get("bomFormat") != "CycloneDX":
        raise SystemExit(f"invalid CycloneDX SBOM: {sbom}")

print(f"validated {len(sboms)} CycloneDX SBOMs")
