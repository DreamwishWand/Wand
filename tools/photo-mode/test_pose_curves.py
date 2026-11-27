import unittest
from pose_curves import sample
from pose_rig import bind

class PoseTests(unittest.TestCase):
    def test_sample_combined_stream_dense_and_constant(self):
        clip={'start':0.,'end':2.,'stream':[[(-3.402823466e38,(0,0,0,0)),(0.,(0,0,2,1)),(1.,(0,0,1,3))]],'denseCount':1,'denseFrames':3,'denseRate':1.,'denseBegin':0.,'dense':(0.,10.,20.),'constants':(7.,)}
        self.assertEqual(sample(clip,.5),[2.,5.,7.])
        self.assertEqual(sample(clip,1.5),[3.5,15.,7.])
        self.assertEqual(sample(clip,20.),[4.,20.,7.])
        with self.assertRaises(ValueError): sample(clip,float('nan'))

    def test_only_explicit_transform_bindings_match(self):
        b={'pathHash':17,'classId':4,'attribute':2,'customType':0,'pointer':0,'integer':0,'offset':0,'dimensions':4}
        c={'bindings':[b,{**b,'pathHash':99},{**b,'classId':95}]}
        r=bind(c,{'nodes':[{'pathHash':17}]})
        self.assertEqual(len(r['matched']),1)
        self.assertEqual(r['matched'][0]['node'],0)
        self.assertEqual(len(r['unresolved']),2)
        self.assertFalse(r['fullPoseVerified'])

if __name__=='__main__':
    unittest.main()
