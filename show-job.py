import json

with open('public/jobs.json', encoding='utf-8') as f:
    data = json.load(f)

matching = [j for j in data if 'CO26001118' in str(j.get('JobNo', ''))]

print(f'Trovate {len(matching)} righe con CO26001118\n')

for i, j in enumerate(matching):
    print(f"Riga {i+1}:")
    print(f"  JobNo: {j.get('JobNo')}")
    print(f"  Customer: {j.get('Customer Name')}")
    print(f"  Division: {j.get('Division')}")
    print(f"  Plan Desc: {j.get('Plan Description')}")
    print(f"  Detail Desc: {j.get('Detail Description')}")
    print()
