"""Validate observed serialized PetPhotoPose body-specific attachment records."""
import struct
import unittest
from pose_companions import decode_pose
from resolve_animation_bundle import Reader

def fixture(overrides):
    data=struct.pack('<i3f4fI',0,0,0,0,0,0,0,1,len(overrides))
    for row in overrides:data+=struct.pack('<ii3f4f',*row)
    return data+bytes(12+8+6*12)

class AttachmentTests(unittest.TestCase):
    def test_both_appearance_overrides(self):
        p=decode_pose(Reader(fixture([(0,10,1,2,3,0,0,0,1),(1,10,4,5,6,0,0,0,1)])))
        self.assertEqual(p['attachmentPoint'],0)
        self.assertEqual(p['attachmentOverrides'][0]['attachedOffset'],(1,2,3))
        self.assertEqual(p['attachmentOverrides'][1]['attachedOffset'],(4,5,6))
    def test_reject_invalid_or_duplicate_overrides(self):
        for rows in ([(2,10,0,0,0,0,0,0,1)],[(0,11,0,0,0,0,0,0,1)],[(0,10,0,0,0,0,0,0,0)],[(0,10,0,0,0,0,0,0,1)]*2):
            with self.assertRaises(ValueError):decode_pose(Reader(fixture(rows)))
    def test_no_override_unchanged(self):
        self.assertEqual(decode_pose(Reader(fixture([])))['attachmentOverrides'],[])

if __name__=='__main__':unittest.main()
