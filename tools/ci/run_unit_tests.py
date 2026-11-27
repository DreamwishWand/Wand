"""Run the whole product unit suite or explicitly selected standalone test files."""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
from select_checks import UNIT_TEST_PATH

def selected_files(value: str, root: Path) -> list[str]:
    paths = json.loads(value)
    if not isinstance(paths, list) or len(paths) != len(set(paths)):
        raise ValueError("Invalid selected unit test list")
    if not paths:
        paths = sorted(path.relative_to(root).as_posix() for path in (root / "tests").glob("*.test.mjs"))
    if not paths or not all(isinstance(path, str) and UNIT_TEST_PATH.fullmatch(path) and (root / path).is_file() for path in paths):
        raise ValueError("Missing or invalid unit test path")
    return paths

def main():
    root = Path.cwd()
    files = selected_files(os.environ["UNIT_FILES"], root)
    print(f"Running {len(files)} product unit test files", flush=True)
    subprocess.run(["node", "tools/db-01-items/materialize-public-master.mjs"], check=True)
    subprocess.run(["node", "tools/architecture/check-production-stack.mjs"], check=True)
    subprocess.run(["node", "--experimental-strip-types", "--test", *files], check=True)

if __name__ == "__main__":
    main()
