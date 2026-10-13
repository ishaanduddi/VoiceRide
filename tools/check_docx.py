"""Print the Speaker 3 script from the generated Word file (verification helper)."""
from __future__ import annotations

import sys
from pathlib import Path

from docx import Document

for raw in sys.argv[1:]:
    path = Path(raw)
    if not path.exists():
        print(f'--- {path}  (missing)')
        continue

    doc = Document(str(path))
    texts = [p.text for p in doc.paragraphs]
    mentions = sum(1 for t in texts if any(k in t for k in ('Honda', 'Harley', 'Cardo', 'Sena')))

    print(f'--- {path}')
    print(f'    paragraphs: {len(texts)}')
    print(f'    Honda/Harley/Cardo mentions: {mentions}')
    for text in texts:
        if text.strip().startswith('"I'):
            print()
            print('    SCRIPT:', text.strip()[:400], '...')
            break
