"""Enrich the existing DB-01 Premium bundle projection with exact native text.
No independent catalog, automatic translation, or pricing/publication changes.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src-02-acquisition'))
from extract_shop_localized_titles import LOCALES, NAMES, PINS, read_locale
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
                    if not display(english) or tables['en'].get(key) != english:
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
        'archiveSha256ByLocale': PINS, 'legacyTextSource': 'current_locdb_explicit_key_not_historical_translation'}
    coverage = {source: {locale: {field: sum(bool((b[source] or {}).get('localizedText', {}).get(locale, {}).get(field))
        for b in catalog['definitions']) for field in ('title', 'description')} for locale in LOCALES}
        for source in ('current', 'legacy')}
    print(json.dumps({'sha256': write_new(a.out, catalog), 'coverage': coverage}, ensure_ascii=False))

if __name__ == '__main__':
    main()
