#!/usr/bin/env python3
"""
Actualiza TODAS las fuentes y publica el resultado en public/data/processed/.

Uso:  python scripts/update_all.py   (o: npm run update-data)

Si una fuente remota falla se conserva su último archivo bueno y el proceso
termina con código 1; nunca se publica una respuesta vacía como datos válidos.
"""
import json
import subprocess
import sys
from datetime import datetime, timezone

from common import PROCESSED_DIR, PUBLIC_DIR, sync_processed_to_public

SCRIPTS = [
    ("radares (feed)", "fetch-radares.py"),
    ("incidencias Navarra", "fetch-incidencias-navarra.py"),
    ("incidencias Euskadi", "fetch-incidencias-euskadi.py"),
    ("GeoVitoria (raw)", "fetch-vitoria.py"),
    ("radares Vitoria", "process-vitoria-ayto.py"),
    ("móvil y foto-rojo Vitoria", "process-vitoria-extra.py"),
]


def main():
    from pathlib import Path

    scripts_dir = Path(__file__).resolve().parent
    failures = []
    for label, script in SCRIPTS:
        print(f"\n=== {label} ===")
        result = subprocess.run([sys.executable, str(scripts_dir / script)], check=False)
        if result.returncode != 0:
            failures.append(label)
            print(f"FALLÓ: {label} (se conserva el último archivo bueno)")

    if failures:
        print(f"\nAviso: {len(failures)} fuente(s) fallaron: {', '.join(failures)}")

    print("\n=== Publicando datos validados ===")
    copied = sync_processed_to_public()
    counts = {}
    for path in copied:
        data = json.loads(path.read_text(encoding="utf-8"))
        counts[path.name] = len(data.get("features", []))

    metadata = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "files": counts,
        "failed_sources": failures,
    }
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    (PUBLIC_DIR / "last-update.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"\nPublicados {len(copied)} GeoJSON:")
    for name, count in sorted(counts.items()):
        print(f"  {name}: {count}")
    print(f"Actualizado: {metadata['updated_at']}")

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
