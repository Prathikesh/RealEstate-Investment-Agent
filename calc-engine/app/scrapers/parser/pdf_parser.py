"""
PDF parsing utilities for government budget documents.
Used as fallback when municipalities publish tax rates only as PDFs.
"""
import io
import re

import pdfplumber


def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    """Extract all text from a PDF given as raw bytes."""
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        pages = [page.extract_text() or "" for page in pdf.pages]
    return "\n".join(pages)


def find_rate_in_pdf_text(text: str, keyword: str) -> str | None:
    """
    Search PDF text for a line containing keyword and extract the first
    decimal number after it on the same line.

    e.g., keyword="taux général" on a line like:
        "taux général  10.2427" → "10.2427"
    """
    keyword_lower = keyword.lower()
    for line in text.splitlines():
        if keyword_lower in line.lower():
            match = re.search(r"\d+[\.,]\d+", line)
            if match:
                return match.group(0).replace(",", ".")
    return None
