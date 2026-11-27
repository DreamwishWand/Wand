import struct
import unittest
from native_map_render_graph import describe,classify

class NativeMapRenderGraphTests(unittest.TestCase):
    def test_solid_background(self):
        b=bytearray(104)
        struct.pack_into('<4f',b,12,0,0.25,0.5,1)
        d=describe('UnityEngine.UI.Image',b,True,[],'CAB-test')
        self.assertEqual(d['rgba'],[0,0.25,0.5,1])
        self.assertEqual(classify('MapVillageExpansion4/Background/BlackPanel2',[d]),'solid-background')
    def test_mask_texture_and_weights(self):
        b=bytearray(116)
        struct.pack_into('<i',b,24,2)
        struct.pack_into('<iq',b,60,1,-123)
        struct.pack_into('<4f',b,72,0,0,1,1)
        struct.pack_into('<4f',b,88,0,0,0,1)
        d=describe('SoftMasking.SoftMask',b,True,['CAB-low'],'CAB-prefab')
        self.assertEqual(d['texture'],{'cab':'CAB-low','pathID':'-123'})
        self.assertEqual(d['channelWeights'],[0,0,0,1])
        self.assertFalse(d['invertMask'])
    def test_lock_overlay_without_mask(self):
        d=describe('UnityEngine.UI.Image',bytes(104),True,[],'CAB-test')
        self.assertEqual(classify('MapVillageExpansion2/Background/Neutral/MapLockedBiomeOverlay',[d]),'lock-overlay')
    def test_blockers(self):
        b=bytearray(44);struct.pack_into('<i',b,0,60);struct.pack_into('<i',b,28,1);struct.pack_into('<iq',b,32,0,-876543210987654321)
        d=describe('Mdl.Ui.MapVillageArea',b,True,[],'CAB-test')
        self.assertEqual(d['blockers'],[{'cab':'CAB-test','pathID':'-876543210987654321'}])
        with self.assertRaises(ValueError):describe('Mdl.Ui.MapVillageArea',b[:-1],True,[],'CAB-test')
if __name__=='__main__':unittest.main()
