import json
import sys

base = "/home/project/manager/sales_manager/src/i18n/locales/"
for lang in ["fr", "ar"]:
    d = json.load(open(base + lang + ".json"))
    print(lang, "top-level keys:", list(d.keys()))
    q = d.get("qrSale", {})
    print(lang, "qrSale keys:", list(q.keys()))
    print(lang, "qrSale.receipt:", json.dumps(q.get("receipt"), ensure_ascii=False))
    c = d.get("customers", {})
    print(lang, "customers keys count", len(c))
    print(json.dumps(c, ensure_ascii=False)[:4000])
    print()
