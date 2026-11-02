#!/usr/bin/env python3
import json

try:
    with open('public/jobs.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"✅ JSON valido: {len(data)} record")
    print(f"✅ Primo record: {data[0].get('JobNo')}")
    print(f"✅ Customer: {data[0].get('Customer Name')}")
    
    # Verifica NaN
    import math
    has_nan = False
    for record in data[:100]:
        for k, v in record.items():
            if isinstance(v, float) and math.isnan(v):
                has_nan = True
                print(f"⚠️ NaN trovato in {k}")
                break
    
    if not has_nan:
        print("✅ Nessun NaN trovato nei primi 100 record")
    
except json.JSONDecodeError as e:
    print(f"❌ ERRORE JSON: {e}")
    print(f"   Linea: {e.lineno}, Colonna: {e.colno}")
except Exception as e:
    print(f"❌ Errore: {e}")
