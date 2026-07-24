"""
Page Montréal's "Unités d'évaluation foncière" open-data CKAN datastore into a
local JSONL (data/montreal/assessment_roll.jsonl), fetched through the r.jina.ai
reader proxy because donnees.montreal.ca blocks direct server requests (Cloudflare).
Feeds scripts/import_montreal_assessment.py.

Run from backend/:  python scripts/pull_montreal_roll.py   (~2 min, ~514k rows)
"""
import json, time, urllib.parse, urllib.request, sys
RID="2b9dfc3d-91d3-48de-b32c-a2a6d9417079"
FIELDS="ID_UEV,CIVIQUE_DEBUT,NOM_RUE,MUNICIPALITE,NOMBRE_LOGEMENT,SUPERFICIE_TERRAIN,ANNEE_CONSTRUCTION"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"
OUT="data/montreal/assessment_roll.jsonl"
LIMIT=20000
def fetch(offset):
    api=f"https://donnees.montreal.ca/api/3/action/datastore_search?resource_id={RID}&limit={LIMIT}&offset={offset}&fields={FIELDS}"
    url="https://r.jina.ai/"+api
    for attempt in range(4):
        try:
            req=urllib.request.Request(url, headers={"User-Agent":UA})
            raw=urllib.request.urlopen(req, timeout=120).read().decode("utf-8","replace")
            i=raw.find('{"help');  i=i if i>=0 else raw.find('{')
            s=raw[i:]; j=s.rfind('}')
            return json.loads(s[:j+1])["result"]
        except Exception as e:
            print(f"  retry {attempt} offset {offset}: {e}", flush=True)
            time.sleep(3)
    raise RuntimeError(f"failed offset {offset}")
total=None; got=0
with open(OUT,"w") as f:
    off=0
    while True:
        r=fetch(off); total=r["total"]; recs=r["records"]
        if not recs: break
        for rec in recs: f.write(json.dumps(rec,ensure_ascii=False)+"\n")
        got+=len(recs); off+=LIMIT
        print(f"pulled {got}/{total}", flush=True)
        if off>=total: break
print(f"DONE {got} records -> {OUT}", flush=True)
