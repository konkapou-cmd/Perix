import json, re, os

with open('i18n/locales/en.json', 'r', encoding='utf-8') as f:
    en = json.load(f)

def flatten(d, prefix=''):
    out = set()
    for k, v in d.items():
        key = prefix + k
        if isinstance(v, dict):
            out |= flatten(v, key + '.')
        else:
            out.add(key)
    return out

en_keys = flatten(en)

used = {}
for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in ('node_modules', '.expo', 'dist', '.git')]
    for fn in files:
        if not fn.endswith(('.tsx', '.ts')):
            continue
        fp = os.path.join(root, fn)
        try:
            content = open(fp, 'r', encoding='utf-8').read()
        except:
            continue
        pattern = re.compile(r't\(["\']([^"\']+)["\']\)')
        for m in pattern.finditer(content):
            key = m.group(1)
            if '.' in key:
                if key not in used:
                    used[key] = os.path.basename(fp)

missing = sorted(set(used.keys()) - en_keys)

by_ns = {}
for k in missing:
    ns = k.split('.')[0]
    by_ns.setdefault(ns, []).append(k)

existing_ns = set(k for k, v in en.items() if isinstance(v, dict))

print("MISSING KEYS IN EXISTING NAMESPACES:")
print("=" * 60)
for ns in sorted(by_ns):
    if ns in existing_ns:
        keys = by_ns[ns]
        print("")
        print("### " + ns + " (" + str(len(keys)) + " missing)")
        for k in sorted(keys):
            print("  " + k)

print("")
print("")
print("MISSING ENTIRE NAMESPACES:")
print("=" * 60)
for ns in sorted(by_ns):
    if ns not in existing_ns:
        keys = by_ns[ns]
        print("")
        print("### " + ns + " (" + str(len(keys)) + " keys)")
        for k in sorted(keys):
            print("  " + k)