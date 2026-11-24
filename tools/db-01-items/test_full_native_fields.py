import unittest
from build_full_native_fields import decode, fields, frames, declarations, source_class

class NativeFieldsTests(unittest.TestCase):
    def test_repeated_nested_and_unknown(self):
        root=('Example.Root',{1:('Children','RepeatedField<Child>'),2:('Values','RepeatedField<int>')})
        child=('Example.Child',{1:('Value','int')})
        data=bytes.fromhex('0a0208000a02080712030096011805')
        rows=list(decode(data,root,{'Child':[child]},{}))
        self.assertEqual([r[0] for r in rows],['Children[0]','Children[0].Value[0]','Children[1]','Children[1].Value[0]','Values[0]','#3[0]'])
        self.assertEqual(rows[1][1],'Children.Value')
        self.assertEqual(rows[1][7],'0')
        self.assertEqual(rows[4][7],'[0,150]')
        self.assertEqual(rows[5][6],'unresolved')
        self.assertEqual(rows[5][8],bytes.fromhex('1805'))
        self.assertEqual(b''.join(r[-1] for r in rows if '.' not in r[0]),data)

    def test_frame_offset_and_truncation(self):
        self.assertEqual(list(frames(bytes.fromhex('00020801'))),[(2,bytes.fromhex('0801'))])
        with self.assertRaises(ValueError):list(fields(bytes.fromhex('0a0301')))

    def test_malformed_child_preserved(self):
        root=('Example.Root',{1:('Child','Child')})
        child=('Example.Child',{1:('Value','int')})
        raw=bytes.fromhex('0a0108')
        rows=list(decode(raw,root,{'Child':[child]},{}))
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0][6],'unresolved')
        self.assertEqual(rows[0][8],raw)

    def test_nullable_int_wrapper(self):
        root=('Definitions.Grid.GridAreaData',{5:('StrideOverride','Nullable<int>')})
        self.assertEqual(list(decode(bytes.fromhex('2a020802'),root,{},{}))[0][6:8],('nullable_int_wrapper','2'))
        self.assertEqual(list(decode(bytes.fromhex('2a00'),root,{},{}))[0][6:8],('nullable_int_wrapper','0'))
        self.assertEqual(list(decode(bytes.fromhex('2a021002'),root,{},{}))[0][6],'unresolved')

    def test_map_preserves_entry_order_and_missing_key(self):
        root=('Example.Root',{1:('Overrides','MapField<uint, int>')})
        raw=bytes.fromhex('0a0210070a0408011009')
        rows=list(decode(raw,root,{},{}))
        self.assertEqual([r[0] for r in rows],['Overrides[0]','Overrides[0].Value[0]','Overrides[1]','Overrides[1].Key[0]','Overrides[1].Value[0]'])
        self.assertEqual(rows[0][6],'declared_map_entry')
        self.assertEqual(rows[1][7],'7')
        self.assertEqual(b''.join(r[-1] for r in rows if '.' not in r[0]),raw)

    def test_empty_message_with_leading_interface(self):
        dump='// Namespace: Example\npublic sealed class Empty : IOther, IMessage<Empty>, IMessage // TypeDefIndex: 1\n{\n}\n'
        messages,enums=declarations(dump)
        self.assertEqual(messages['Empty'],[('Example.Empty',{})])
        root=('Example.Root',{1:('Empty','Empty')})
        self.assertEqual(list(decode(bytes.fromhex('0a00'),root,messages,enums))[0][6],'declared_message')

    def test_new_source_layouts(self):
        for sub in (2,3,4,7):self.assertEqual(source_class('Currency',sub),'CurrencyItemData')
        for sub in (9,10):self.assertEqual(source_class('Dialogue',sub),'DialogueItemData')

if __name__=='__main__':unittest.main()
