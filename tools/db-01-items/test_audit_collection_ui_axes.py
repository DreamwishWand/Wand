"""No game-original bytes: validate strict Collection UI enum wiring auditor."""
from __future__ import annotations
from pathlib import Path
import re
import unittest

from audit_collection_ui_axes import (
    audit_enum_wiring, enums, snapshot,
    TS_AREAS, TS_SUBMENUS,
)


def reference_ts() -> str:
    return (Path(__file__).resolve().parents[2] /
            'src/lib/items/collection-ui-axes.ts').read_text(encoding='utf-8')


def fake_dump(ts: str) -> str:
    categories = snapshot(ts, TS_SUBMENUS)
    areas = snapshot(ts, TS_AREAS)

    def enum_code(name: str, rows: dict) -> str:
        return ('public enum ' + name + ' // current synthetic original\n'
                + '{\n' +
                ''.join('public const ' + name + ' ' + item + ' = ' +
                        str(code) + ';\n' for item, (code, _) in rows.items())
                + '}\n')
    return (
        enum_code('CollectionSubMenu', categories) +
        enum_code('CollectionArea', areas) +
        'public class CollectionTabButton : CustomButton\n'
        '{\npublic CollectionArea CollectionArea;\n}\n' +
        'public class CollectionTagFilterButton : MonoBehaviour\n'
        '{\npublic CollectionSubMenu CollectionType;\n}\n' +
        'private struct CollectionMenu.CollectionPageConfig\n'
        '{\npublic CollectionSubMenu SubMenu;\n}\n'
    )


class NativeCollectionAxesTests(unittest.TestCase):
    def test_current_source_code_snapshot_matches_synthetic_native_enums(self):
        source = reference_ts()
        areas, categories = audit_enum_wiring(fake_dump(source), source)
        self.assertEqual(len(areas), 7)
        self.assertEqual(len(categories), 20)
        self.assertEqual(areas['Honeywood'][0], 4097)
        self.assertEqual(categories['Stories'][1],
                         'tab_title_lorekeeper_tales')
        self.assertEqual(categories['Crop'][1], 'tab_title_crops')
        self.assertNotIn('Critters', categories)

    def test_enum_value_mismatch_rejected(self):
        source = reference_ts()
        native = fake_dump(source).replace(
            'CollectionArea Honeywood = 4097;',
            'CollectionArea Honeywood = 6;'
        )
        with self.assertRaisesRegex(ValueError, 'NATIVE_ENUM_CODE_DRIFT'):
            audit_enum_wiring(native, source)

    def test_category_name_mismatch_rejected(self):
        source = reference_ts()
        native = fake_dump(source).replace(
            'CollectionSubMenu Stories = 14;',
            'CollectionSubMenu OldStories = 14;'
        )
        with self.assertRaisesRegex(ValueError, 'NATIVE_ENUM_CODE_DRIFT'):
            audit_enum_wiring(native, source)

    def test_ui_class_member_mismatch_rejected(self):
        source = reference_ts()
        native = fake_dump(source).replace(
            'public CollectionSubMenu CollectionType;',
            'public int CollectionType;'
        )
        with self.assertRaisesRegex(ValueError, 'COLLECTION_UI_FIELD_WIRING'):
            audit_enum_wiring(native, source)

    def test_source_locdb_key_duplication_rejected(self):
        source = reference_ts()
        modified = source.replace(
            "enumName:'Mounts',locDbKey:'tab_title_mounts'",
            "enumName:'Mounts',locDbKey:'tab_title_companions'"
        )
        with self.assertRaisesRegex(ValueError, 'DUPLICATE_TS_AXES'):
            audit_enum_wiring(fake_dump(source), modified)

    def test_original_enum_parser_rejects_duplicate_numeric_values(self):
        invalid = ('public enum CollectionArea\n{\n'
                   'public const CollectionArea A = 0;\n'
                   'public const CollectionArea B = 0;\n}\n')
        with self.assertRaisesRegex(ValueError, 'DUPLICATE_NATIVE_CollectionArea'):
            enums(invalid, 'CollectionArea')


if __name__ == '__main__':
    unittest.main()
