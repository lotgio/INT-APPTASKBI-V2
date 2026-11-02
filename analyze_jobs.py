import json
from collections import defaultdict

data = json.load(open('public/jobs.json', encoding='utf-8'))

agg = defaultdict(lambda: {'sold': 0, 'fatturate': 0, 'loggate': 0, 'status': ''})
for j in data:
    k = j.get('JobNo', '')
    agg[k]['sold'] += j.get('Quantity', 0)
    agg[k]['fatturate'] += j.get('Ore Vendute Fatturate', 0)
    agg[k]['loggate'] += j.get('Ore Loggate', 0)
    agg[k]['status'] = j.get('Job Status', '')

fully = [(k, v) for k, v in agg.items() if v['sold'] > 0 and v['fatturate'] >= v['sold']]
completato = [(k, v) for k, v in agg.items() if v['status'] == 'Completato']

print(f"Commesse con fatturate>=sold (invoice 100%): {len(fully)}")
print(f"Commesse con Job Status=Completato: {len(completato)}")

print("\nEsempi Completato:")
for k, v in list(completato)[:8]:
    pct = (v['fatturate'] / v['sold'] * 100) if v['sold'] > 0 else 0
    print(f"  {k}: sold={v['sold']:.0f}, fatturate={v['fatturate']:.0f} ({pct:.0f}%), loggate={v['loggate']:.0f}")

print("\nCO26001118:")
print(agg.get('CO26001118', 'non trovata'))
