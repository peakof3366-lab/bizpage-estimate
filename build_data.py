import re
import json
from pathlib import Path

path = Path('202604280002_destination_rates_seed.sql')
text = path.read_text(encoding='utf-8')
match = re.search(r'values\s*(\(.+\))\s*on conflict', text, re.S)
if not match:
    raise SystemExit('No values section found')
rows = re.findall(r"\('([^']+)'\s*,\s*'([^']+)'\s*,([^\)]+)\)", match.group(1))
entries = []
for row in rows:
    key, label, nums = row
    nums = [int(x.strip()) for x in nums.split(',')]
    entries.append({
        'destination_key': key,
        'label': label,
        'airfare': nums[0],
        'fuel_surcharge': nums[1],
        'hotel_per_room': nums[2],
        'meal_per_person': nums[3],
        'vehicle_large': nums[4],
        'vehicle_small': nums[5],
        'guide_fee': nums[6],
        'sightseeing_fee': nums[7],
        'margin_per_traveler': nums[8],
    })
output = 'const destinationRates = ' + json.dumps(entries, ensure_ascii=False, indent=2) + ';\n'
Path('data.js').write_text(output, encoding='utf-8')
print('data.js generated with', len(entries), 'entries')
