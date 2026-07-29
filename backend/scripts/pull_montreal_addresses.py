"""
Page Montréal's official "Adresses ponctuelles" open-data datastore into a local
JSONL (data/montreal/address_points.jsonl), via the r.jina.ai reader proxy
(donnees.montreal.ca blocks direct server requests). Each record is a civic
address with LONGITUDE/LATITUDE — our free, accurate geocoder source.
Run from backend/:  python scripts/pull_montreal_addresses.py  (~3 min, ~346k rows)
"""
import json, time, urllib.request, sys
RID="fed5fd02-5535-458e-b13f-66e7a31a6d78"
FIELDS="ADDR_DE,GENERIQUE,SPECIFIQUE,ORIENTATION,LONGITUDE,LATITUDE"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"
OUT="data/montreal/address_points.jsonl"; LIMIT=20000
def fetch(off):
    api=f"https://donnees.montreal.ca/api/3/action/datastore_search?resource_id={RID}&limit={LIMIT}&offset={off}&fields={FIELDS}"
    for a in range(4):
        try:
            raw=urllib.request.urlopen(urllib.request.Request("https://r.jina.ai/"+api, headers={"User-Agent":UA}), timeout=120).read().decode("utf-8","replace")
            i=raw.find('{"help'); i=i if i>=0 else raw.find('{'); s=raw[i:]; j=s.rfind('}')
            return json.loads(s[:j+1])["result"]
        except Exception as e:
            print(f"  retry {a} off {off}: {e}", flush=True); time.sleep(3)
    raise RuntimeError(f"failed {off}")
got=0
with open(OUT,"w") as f:
    off=0
    while True:
        r=fetch(off); recs=r["records"]; total=r["total"]
        if not recs: break
        for rec in recs: f.write(json.dumps(rec,ensure_ascii=False)+"\n")
        got+=len(recs); off+=LIMIT; print(f"pulled {got}/{total}", flush=True)
        if off>=total: break
print(f"DONE {got} -> {OUT}", flush=True)
