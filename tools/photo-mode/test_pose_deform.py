import unittest
import numpy as np
from pose_deform import skin,world,validate_bind
from pose_glb import Glb,trs,REFLECT
from scipy.spatial.transform import Rotation

class DeformTests(unittest.TestCase):
    def test_weighted_skin(self):
        nodes=[dict(path='body',parent=-1,rotation=[0,0,0,1],translation=[0,0,0],scale=[1,1,1]),dict(path='bone',parent=0,rotation=[0,0,0,1],translation=[1,0,0],scale=[1,1,1])]
        mesh={'name':'body','bind':np.eye(4)[None,:,:].repeat(2,axis=0),'attrs':{0:np.array([[1.,2.,3.]]),12:np.array([[.25,.75]]),13:np.array([[0,1]])}}
        mesh['bind'][1,0,3]=-1
        self.assertEqual(validate_bind(mesh,nodes,[0,1]),0)
        np.testing.assert_allclose(skin(mesh,nodes,[0,1]),[[1,2,3]])
        nodes[1]['translation']=[3,0,0]
        np.testing.assert_allclose(skin(mesh,nodes,[0,1]),[[2.5,2,3]])
    def test_reflected_rotation(self):
        n=dict(path='',parent=-1,rotation=Rotation.from_euler('xyz',[.3,.4,.5]).as_quat(),translation=[1,2,3],scale=[2,3,4])
        m={**n,**trs(n)}
        np.testing.assert_allclose(world([m])[0],REFLECT@world([n])[0]@REFLECT,atol=1e-10)
    def test_glb_header(self):
        import struct,json
        g=Glb();g.add([[1.,2.,3.]],'VEC3','<f4',bounds=True);raw=g.bytes()
        self.assertEqual(struct.unpack_from('<4sII',raw),(b'glTF',2,len(raw)))
        size,tag=struct.unpack_from('<I4s',raw,12);self.assertEqual(tag,b'JSON');doc=json.loads(raw[20:20+size]);self.assertEqual(doc['accessors'][0]['min'],[1,2,3])
if __name__=='__main__':unittest.main()
