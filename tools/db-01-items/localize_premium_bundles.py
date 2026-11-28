"""Enrich the existing DB-01 Premium bundle projection with exact native text.
No independent catalog, automatic translation, or pricing/publication changes.
"""
import argparse
from collections import defaultdict
from io import BytesIO
import hashlib
import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src-02-acquisition'))
from extract_shop_localized_titles import LOCALES, NAMES, PINS, read_locale, fields
from import_premium_bundles import PUBLIC_SCHEMA, pinned, write_new

def display(value):
    return (isinstance(value, str) and bool(value.strip()) and
            not value.lstrip().startswith(('{Placeholder}', '{LegacyPlaceholder}', '{DoNotTranslate}')))

def enrich(catalog, tables):
    if catalog['schema'] != PUBLIC_SCHEMA or set(tables) != set(LOCALES):
        raise ValueError('Invalid catalog or locale set')
    for bundle in catalog['definitions']:
        for source in ('current', 'legacy'):
            revision = bundle[source]
            if revision is None:
                continue
            localized = {}
            for field, suffix in (('title', 'Title'), ('description', 'Description')):
                if source == 'current':
                    if revision.get('language') != 'en-US':
                        continue
                    key = bundle['bundleId'] + '_' + suffix
                    # Exact native ID + English text, independently for each field.
                    english = revision.get(field)
                    if not display(english):
                        continue
                    if tables['en'].get(key) != english:
                        # Same native Bundle ID, explicit legacy key, and exact current English text.
                        explicit = (bundle['legacy'] or {}).get(field + 'Key')
                        if not isinstance(explicit, str) or not explicit.startswith('Liveops.'):
                            continue
                        key = explicit.split('.', 1)[1]
                        if tables['en'].get(key) != english:
                            continue
                else:
                    explicit = revision.get(field + 'Key')
                    if not isinstance(explicit, str) or not explicit.startswith('Liveops.'):
                        continue
                    key = explicit.split('.', 1)[1]
                    if not display(tables['en'].get(key)):
                        continue
                for locale, table in tables.items():
                    value = table.get(key)
                    if display(value):
                        localized.setdefault(locale, {})[field] = value
            if localized:
                revision['localizedText'] = localized
            else:
                revision.pop('localizedText', None)
    return catalog

MEMBERS = ('Liveops.locbin', 'ProtoDB/ShopConfigs_Global.locbin',
           'ProtoDB/IapData_Global.locbin', 'menu.locbin')

def component_tables(root):
    tables = {}
    for locale in LOCALES:
        raw = (root / ('LocDB_' + NAMES.get(locale, locale) + '.zip')).read_bytes()
        if hashlib.sha256(raw).hexdigest() != PINS[locale]:
            raise ValueError('locale archive mismatch')
        table = {}
        with zipfile.ZipFile(BytesIO(raw)) as archive:
            for member in MEMBERS:
                for tag, entry in fields(archive.read(member)):
                    if tag != 1:
                        raise ValueError('unexpected locbin entry')
                    row = dict(fields(entry))
                    key = (member, row[1].decode())
                    if key in table:
                        raise ValueError('duplicate locale key')
                    table[key] = row.get(2, b'').decode()
        tables[locale] = table
    return tables

def attach_component_texts(catalog, tables):
    # The server supplies literal en-US descriptions, not localization keys.
    # Only consensus across every exact English candidate in the inspected
    # source members resolves a locale. Do not choose between differing text.
    if set(tables) != set(LOCALES):
        raise ValueError('invalid component locale set')
    descriptions = {c['description'] for b in catalog['definitions']
                    if b['current'] and b['current'].get('language') == 'en-US'
                    for c in b['current']['components'] if display(c.get('description'))}
    candidates = defaultdict(list)
    for key, value in tables['en'].items():
        if value in descriptions:
            candidates[value].append(key)
    rows = []
    for english in sorted(descriptions):
        keys = sorted(candidates[english])
        if not keys:
            continue
        localized = {}
        for locale, table in tables.items():
            values = {table.get(k) for k in keys}
            if len(values) == 1:
                value = next(iter(values))
                if display(value):
                    localized[locale] = value
        rows.append([english, keys, localized])
    catalog['componentDescriptionTexts'] = rows
    catalog['source']['bundleLocalization']['componentTextSource'] = {
        'members': list(MEMBERS), 'method': 'exact_english_all_candidate_keys_locale_consensus'}
    return catalog

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--catalog', required=True, type=Path)
    p.add_argument('--catalog-sha256', required=True)
    p.add_argument('--loc-root', required=True, type=Path)
    p.add_argument('--out', required=True, type=Path)
    a = p.parse_args()
    catalog = json.loads(pinned(a.catalog, a.catalog_sha256))
    tables = {l: read_locale(a.loc_root / ('LocDB_' + NAMES.get(l, l) + '.zip'), l) for l in LOCALES}
    catalog = enrich(catalog, tables)
    catalog['source']['bundleLocalization'] = {'platform': 'Steam', 'gameVersion': '1.26.2',
        'archiveSha256ByLocale': PINS, 'legacyTextSource': 'current_locdb_explicit_key_not_historical_translation',
        'currentTextSource': 'native_id_or_same_bundle_legacy_key_with_exact_english_match'}
    catalog = attach_component_texts(catalog, component_tables(a.loc_root))
    coverage = {source: {locale: {field: sum(bool((b[source] or {}).get('localizedText', {}).get(locale, {}).get(field))
        for b in catalog['definitions']) for field in ('title', 'description')} for locale in LOCALES}
        for source in ('current', 'legacy')}
    print(json.dumps({'sha256': write_new(a.out, catalog), 'coverage': coverage}, ensure_ascii=False))

if __name__ == '__main__':
    main()
