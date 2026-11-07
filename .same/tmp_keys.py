import json
import os

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sales_manager"))
for l in ["fr", "ar"]:
    d = json.load(open("src/i18n/locales/%s.json" % l))
    print(l, d.get("currency"), list(d["common"].keys()))
    print("  qrSale.customer:", list(d["qrSale"].get("customer", {}).keys()))
    print("  suppliersPage:", list(d["suppliersPage"].keys()))
    print("  suppliersPage.table:", d["suppliersPage"].get("table"))
    print("  nav:", d.get("nav"))
