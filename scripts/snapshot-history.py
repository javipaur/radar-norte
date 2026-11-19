#!/usr/bin/env python3
"""
Guarda una copia (snapshot) de los datos actuales en data/history/<timestamp>/.
Así no se pierde el estado actual si una actualización posterior borra cosas del feed.
"""
import shutil
from datetime import datetime
from pathlib import Path


def main():
    root = Path(__file__).resolve().parent.parent
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = root / "data" / "history" / ts
    dest.mkdir(parents=True, exist_ok=True)

    for folder in ["processed", "raw"]:
        src_dir = root / "data" / folder
        if not src_dir.exists():
            continue
        out_dir = dest / folder
        out_dir.mkdir(exist_ok=True)
        for p in src_dir.iterdir():
            if p.is_file():
                shutil.copy2(p, out_dir / p.name)
    print(f"Snapshot guardado en: {dest}")


if __name__ == "__main__":
    main()
