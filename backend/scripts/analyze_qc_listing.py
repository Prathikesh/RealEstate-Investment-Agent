"""Analyze remax-quebec.com listing page HTML structure for parser design."""
import json, re
from bs4 import BeautifulSoup

html = open("remax_qc_listing.html", encoding="utf-8").read()
soup = BeautifulSoup(html, "html.parser")

print(f"HTML size: {len(html)}")

# 1. Look for Nuxt state (various formats)
print("\n=== Nuxt state scripts ===")
for sc in soup.find_all("script"):
    t = sc.string or ""
    if any(kw in t for kw in ["__NUXT__", "NUXT_DATA", "__nuxt", "useNuxtApp", "nuxtApp"]):
        print(f"Found ({len(t)} chars): {t[:300]}")
        print()

# 2. Check for any inline JSON with listing data
print("=== Inline JSON with price/listing data ===")
for sc in soup.find_all("script"):
    t = sc.string or ""
    if not t: continue
    if any(kw in t for kw in ["askingPrice", "listPrice", "price", "bedrooms", "bathrooms"]):
        if len(t) < 50000:  # skip huge scripts
            print(f"Script ({len(t)} chars):")
            print(t[:500])
            print()

# 3. Check key DOM elements
print("=== Key DOM elements ===")
selectors_to_check = [
    ("[data-cy='price']", "Price (data-cy)"),
    ("[data-cy='address']", "Address (data-cy)"),
    (".price", "Price (.price)"),
    (".address", "Address (.address)"),
    ("[class*='listing-price']", "Price (listing-price)"),
    ("[class*='listing-detail']", "Detail"),
    (".property-details", "Property details"),
    ("[class*='feature']", "Feature"),
    (".specifications", "Specs"),
]
for sel, label in selectors_to_check:
    els = soup.select(sel)
    if els:
        print(f"{label}: {els[0].get_text(strip=True)[:100]}")

# 4. Find all data we need
print("\n=== Full page text extraction ===")
# Price
for el in soup.find_all(text=re.compile(r'\$[\d,]+')):
    parent = el.parent
    if parent and parent.name not in ['script', 'style']:
        print(f"Price-like: {el.strip()[:60]} | parent: <{parent.name}> class={parent.get('class', [])[:2]}")

# MLS number (centris format)
for m in re.finditer(r'(?:MLS|mls|centris|reference)\s*[#:]\s*(\w+)', html, re.IGNORECASE):
    print(f"MLS/Ref: {m.group()}")

# Listing ID from URL
m = re.search(r'-(\d{7,})$', "https://www.remax-quebec.com/en/properties/triplex-for-sale/7546-7550-rue-centrale-montreal-lasalle-9839850")
if m:
    print(f"Listing ID: {m.group(1)}")

# 5. Find specific property attributes
print("\n=== Property attributes ===")
# Bedrooms
for m in re.finditer(r'(\d+)\s*(?:bedroom|chambre|bed|bdr)', html, re.IGNORECASE):
    print(f"Bedrooms: {m.group()[:40]}")
    break
# Bathrooms
for m in re.finditer(r'(\d+)\s*(?:bathroom|salle.*bain|bath)', html, re.IGNORECASE):
    print(f"Bathrooms: {m.group()[:40]}")
    break
# Sqft
for m in re.finditer(r'(\d[\d,]+)\s*(?:sq\.?\s*ft|sqft|pi[²2]|pied)', html, re.IGNORECASE):
    print(f"SqFt: {m.group()[:40]}")
    break
# Year built
for m in re.finditer(r'(?:year|année|built|constru)\D{0,20}(19\d\d|20[012]\d)', html, re.IGNORECASE):
    print(f"Year built: {m.group()[:40]}")
    break
# Units
for m in re.finditer(r'(\d+)\s*(?:unit|logement|dwelling)', html, re.IGNORECASE):
    print(f"Units: {m.group()[:40]}")
    break

# 6. Find agent info
print("\n=== Agent info ===")
for m in re.finditer(r'"agent":\s*\{[^}]+\}', html, re.IGNORECASE):
    print(f"Agent JSON: {m.group()[:200]}")
    break

# 7. Find image URLs
print("\n=== Images ===")
imgs = soup.find_all("img", src=True)
print(f"Total imgs: {len(imgs)}")
for img in imgs[:5]:
    print(f"  {img['src'][:100]}")

# 8. Check structured data
print("\n=== All schema.org data ===")
for sc in soup.find_all("script", type="application/ld+json"):
    try:
        data = json.loads(sc.string or "{}")
        print(json.dumps(data, indent=2)[:600])
        print()
    except Exception as e:
        print(f"Error: {e}")
