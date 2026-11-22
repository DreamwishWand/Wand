"""Pure, synthetic tests for native ProtoDatabase memoized search/hook audit."""
import unittest

from audit_native_protodb_type_cache_and_hook_1262 import (
    audit, check_implementer_metadata, native_pins, IMPLEMENTERS,
)


def fixture_source(classes=IMPLEMENTERS):
    parts = ['private readonly bool isEditor; // 0x48',
             'private readonly Dictionary<Type, Array> cachedSearches; // 0x50',
             'public interface IProtobufOnBinarize // TypeDefIndex: 8361',
             '{\n public abstract void OnBinarize();\n}']
    for owner in classes:
        parts.append(
            f'public sealed class {owner} : IMessage, IProtobufOnBinarize'
            '\n{\n private void '
            'Definitions.Util.IProtobufOnBinarize.OnBinarize() { }\n}')
    return ('\n'.join(parts)+'\n').encode('utf-8')


class NativeProtoDbTypeCacheAndHookTests(unittest.TestCase):
    def test_exact_three_concrete_interface_implementers(self):
        self.assertEqual(check_implementer_metadata(fixture_source()),3)

    def test_missing_dynamic_cache_implementer_fails_closed(self):
        with self.assertRaisesRegex(ValueError,
                                    'PROTODB_HOOK_IMPLEMENTERS'):
            check_implementer_metadata(fixture_source(('GridData','AudioGridData')))

    def test_unknown_extra_implementer_is_not_assumed(self):
        with self.assertRaisesRegex(ValueError,
                                    'PROTODB_HOOK_IMPLEMENTERS'):
            check_implementer_metadata(
                fixture_source((*IMPLEMENTERS,'OtherHook')))

    def test_missing_interface_method_fails_closed(self):
        invalid=fixture_source().replace(b'public abstract void OnBinarize();',
                                         b'public abstract void Missing();')
        with self.assertRaisesRegex(ValueError,
                                    'PROTODB_HOOK_INTERFACE_METHOD'):
            check_implementer_metadata(invalid)

    def test_wrong_original_instruction_bytes_fails_closed(self):
        with self.assertRaisesRegex(ValueError,'ORIGINAL_WINDOW_'):
            native_pins(lambda _address, size:b'\x00'*size)

    def test_original_untrusted_proto_rejected_before_native(self):
        with self.assertRaisesRegex(ValueError,'ORIGINAL_PROTO_SHA'):
            audit(b'fake proto',fixture_source(),'/missing/Steam.dll')


if __name__=='__main__':
    unittest.main()
