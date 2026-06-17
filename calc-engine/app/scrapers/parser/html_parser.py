"""
HTML parsing utilities used by scrapers.
Wraps BeautifulSoup to extract numeric values from tables and text.
"""
import re

from bs4 import BeautifulSoup


def parse_html(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "lxml")


def extract_first_number(text: str) -> str | None:
    """
    Extract the first decimal number from a string.
    e.g., "The rate is 9.975 %" → "9.975"
         "Mill rate: 10.2427 per $1,000" → "10.2427"
    """
    match = re.search(r"\d+\.\d+|\d+", text.replace(",", "."))
    return match.group(0) if match else None


def extract_table_value(soup: BeautifulSoup, row_keyword: str, col_index: int = 1) -> str | None:
    """
    Search all tables for a row whose first cell contains row_keyword,
    then return the text of the cell at col_index.
    Case-insensitive keyword match.
    """
    keyword_lower = row_keyword.lower()
    for table in soup.find_all("table"):
        for row in table.find_all("tr"):
            cells = row.find_all(["td", "th"])
            if cells and keyword_lower in cells[0].get_text(strip=True).lower():
                if len(cells) > col_index:
                    return cells[col_index].get_text(strip=True)
    return None


def extract_by_css(soup: BeautifulSoup, selector: str) -> str | None:
    """Return text content of the first element matching a CSS selector."""
    el = soup.select_one(selector)
    return el.get_text(strip=True) if el else None


def extract_by_label(soup: BeautifulSoup, label_text: str) -> str | None:
    """
    Find an element whose text is close to label_text, then return
    the text of the next sibling element.
    Useful for key: value layouts.
    """
    label_lower = label_text.lower()
    for el in soup.find_all(string=lambda t: t and label_lower in t.lower()):
        parent = el.parent
        sibling = parent.find_next_sibling()
        if sibling:
            return sibling.get_text(strip=True)
    return None
