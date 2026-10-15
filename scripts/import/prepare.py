#!/usr/bin/env python3
"""Forbereder et regneark til bulk-import i PONTIFEX Nexus.

Brug:  python3 scripts/import/prepare.py FIL.xlsx [--batch NAVN] [--out MAPPE] [--chunk 150]
       python3 scripts/import/prepare.py virksomheder.csv personer.csv ...

Excel: arket »Virksomheder« og arket »Personer« (andre ark ignoreres). CSV: filnavn med »virksom« eller »person«.
Resultat: SQL-filer med INSERT i public.import_row, samt en rapport over genkendte og ukendte kolonner.
Selve importen sker bagefter med private.import_batch (se docs/IMPORT.md).
"""
import argparse, csv, datetime as dt, json, os, re, sys

ALIASES = {
    'company': {
        'name': ['navn', 'virksomhed', 'virksomhedsnavn', 'firma', 'name', 'company'],
        'cvr': ['cvr', 'cvr-nr', 'cvrnr', 'cvr nummer', 'cvr-nummer'],
        'website': ['hjemmeside', 'web', 'website', 'url'],
        'sector': ['sektor', 'sector'],
        'is_own': ['egen', 'egen virksomhed', 'is_own', 'own'],
        'branch': ['branche', 'hovedbranche', 'primær branche', 'branch'],
        'branch2': ['branche 2', 'sekundær branche', 'branche2', 'branch2'],
        'address': ['adresse', 'hovedkontor adresse', 'address'],
        'postal_code': ['postnr', 'postnummer', 'postal_code', 'zip'],
        'city': ['by', 'city'],
        'group_name': ['koncern', 'koncernnavn', 'gruppe', 'group'],
        'group_role': ['koncernrolle', 'rolle i koncern', 'group_role'],
    },
    'contact': {
        'first_name': ['fornavn', 'first_name', 'first name', 'firstname'],
        'middle_name': ['mellemnavn', 'middle_name', 'middle name'],
        'last_name': ['efternavn', 'last_name', 'last name', 'lastname'],
        'full_name': ['navn', 'fulde navn', 'name', 'fullname'],
        'email': ['e-mail', 'email', 'mail'],
        'phone': ['telefon', 'mobil', 'tlf', 'phone'],
        'linkedin': ['linkedin', 'linkedin-url', 'linkedin url', 'linkedin_url'],
        'company': ['virksomhed', 'firma', 'cvr', 'company', 'organisation'],
        'affiliation_type': ['tilknytning', 'tilknytningstype', 'type', 'affiliation_type'],
        'level': ['niveau', 'level'],
        'function': ['funktion', 'function'],
        'start_date': ['start', 'startdato', 'start_date', 'ansat fra'],
        'end_date': ['slut', 'slutdato', 'end_date', 'ansat til'],
        'is_primary': ['primær', 'primær tilknytning', 'is_primary'],
        'affiliation_note': ['tilknytningsnote', 'affiliation_note'],
        'acquaintance': ['kendskab', 'acquaintance'],
        'acquainted_since': ['kendt siden', 'acquainted_since'],
        'no_invitation': ['ingen invitation', 'no_invitation', 'inviteres ikke'],
        'notes': ['noter', 'note', 'noter (privat)', 'notes', 'kommentar'],
        'force': ['force', 'opret alligevel'],
    },
}
LOOKUP = {k: {a: f for f, al in v.items() for a in al} for k, v in ALIASES.items()}


def norm(h):
    return re.sub(r'\s+', ' ', str(h or '').strip().lower())


def cell(v):
    if v is None:
        return ''
    if isinstance(v, dt.datetime):
        return v.date().isoformat()
    if isinstance(v, dt.date):
        return v.isoformat()
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def read_xlsx(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    out = {}
    for ws in wb.worksheets:
        n = norm(ws.title)
        kind = 'company' if n.startswith('virksom') or n.startswith('compan') else 'contact' if n.startswith('person') or n.startswith('kontakt') or n.startswith('contact') else None
        if kind is None:
            print(f'Ignorerer ark: {ws.title}', file=sys.stderr)
            continue
        rows = [[cell(c) for c in r] for r in ws.iter_rows(values_only=True)]
        out[kind] = rows
    return out


def read_csv(path):
    with open(path, newline='', encoding='utf-8-sig') as f:
        sample = f.read(4096); f.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=';,\t')
        except csv.Error:
            dialect = csv.excel
        return [[cell(c) for c in r] for r in csv.reader(f, dialect)]


def convert(kind, rows):
    if not rows:
        return [], [], []
    heads = rows[0]
    mapping, unknown = {}, []
    for i, h in enumerate(heads):
        f = LOOKUP[kind].get(norm(h))
        if f and f not in mapping.values():
            mapping[i] = f
        elif h:
            unknown.append(h)
    recs = []
    for line, r in enumerate(rows[1:], start=2):
        d = {mapping[i]: v for i, v in enumerate(r) if i in mapping and v != ''}
        if not d:
            continue
        if kind == 'contact' and 'full_name' in d:
            full = d.pop('full_name')
            if 'first_name' not in d:
                parts = full.split(' ')
                d['first_name'] = parts[0]
                if len(parts) > 1 and 'last_name' not in d:
                    d['last_name'] = ' '.join(parts[1:])
        d['_line'] = line
        recs.append(d)
    return recs, list(mapping.values()), unknown


def q(s):
    return "'" + s.replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('files', nargs='+')
    ap.add_argument('--batch', default=dt.date.today().isoformat() + '-import')
    ap.add_argument('--out', default='import_out')
    ap.add_argument('--chunk', type=int, default=150)
    a = ap.parse_args()

    data = {}
    for f in a.files:
        if f.lower().endswith(('.xlsx', '.xlsm')):
            data.update(read_xlsx(f))
        else:
            n = norm(os.path.basename(f))
            kind = 'company' if 'virksom' in n or 'compan' in n else 'contact'
            data[kind] = read_csv(f)

    os.makedirs(a.out, exist_ok=True)
    files = []
    for kind in ('company', 'contact'):  # virksomheder først, så personer kan henvise til dem
        if kind not in data:
            continue
        recs, mapped, unknown = convert(kind, data[kind])
        print(f'{kind}: {len(recs)} rækker. Kolonner genkendt: {", ".join(mapped)}')
        if unknown:
            print(f'  Ikke genkendt (springes over): {", ".join(unknown)}')
        for n in range(0, len(recs), a.chunk):
            part = recs[n:n + a.chunk]
            values = ',\n'.join(f"({q(a.batch)}, {q(kind)}, {q(json.dumps(r, ensure_ascii=False))}::jsonb)" for r in part)
            path = os.path.join(a.out, f'{kind}_{n // a.chunk + 1:03d}.sql')
            with open(path, 'w', encoding='utf-8') as fh:
                fh.write(f'insert into public.import_row (batch, kind, data) values\n{values};\n')
            files.append(path)
    print('Filer (kør i denne rækkefølge):')
    for p in files:
        print(' ', p)
    print(f"Derefter: select * from private.import_batch('{a.batch}', '<ejer-uuid>', true);")


if __name__ == '__main__':
    main()
