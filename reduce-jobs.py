import json

# Carica il file completo
with open('dist/jobs.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"File originale: {len(data)} record")

# Crea subset con 1000 record
subset = data[:1000]
with open('dist/jobs-test.json', 'w', encoding='utf-8') as f:
    json.dump(subset, f, ensure_ascii=False, indent=2)

print(f"Subset creato: jobs-test.json con {len(subset)} record")

# Testa il file creato
with open('dist/jobs-test.json', 'r', encoding='utf-8') as f:
    test_data = json.load(f)
    print(f"✓ Verifica: {len(test_data)} record validi")
