#!/usr/bin/env python3
"""Parse organizer result files (PDFs) from skyting.no competitions.

Result files live on NSF's Azure blob storage (resultFileUrl on each
competition in the scraped year JSONs). Three generator families cover
the corpus; detect_family classifies extracted text, and per-family
parsers (added incrementally) turn it into the detail-file shape.

Run tests directly:

    python3 .github/scripts/test_result_file_parse.py
"""

import re

# Bump when parsing behavior changes: stored detail files carry the
# version they were parsed with, and older files are re-parsed.
PARSER_VERSION = 1

_INRX_FOOTER = re.compile(r'inrX\s*\d+\.\d+')


def detect_family(text):
    """Classify a result file's text into its generator family.

    Returns 'inrX', 'plain-NO', 'datotid', or 'unknown' (anything we
    cannot recognize is quarantined by the caller, never guessed at).
    """
    if _INRX_FOOTER.search(text) or ':: Klasse' in text:
        return 'inrX'
    if 'Dato/tid:' in text and (
        'Stevnenummer' in text or 'file:///C:/resultat' in text
    ):
        return 'datotid'
    if 'Stevne :' in text and 'Program :' in text:
        return 'plain-NO'
    return 'unknown'
