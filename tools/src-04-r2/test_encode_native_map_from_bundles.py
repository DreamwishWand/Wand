import copy
import unittest
from encode_native_map_from_bundles import prepare_geometry

class TestDirectGeometry(unittest.TestCase):
    def fixture(self):
        refs=[['cab-'+'a'*32+'/'+str(i),f'{i:064x}'] for i in range(118)]
        def layer(sha):
            return {'kind':'texture','imageSha256':sha,'size':[3,2],'wrap':[1,1],
                    'colorSpace':'sRGB','rgba':[1,1,1,1],'unitQuadToCanvas':[3,0,0,2,0,0]}
        maps=[];regs=[]
        for i in range(10):
            name='MapVillage'+str(i)
            rows=[layer(sha) for _,sha in refs[i*12:(i+1)*12]]
            if i==9:rows.append(copy.deepcopy(rows[0]))
            maps.append({'id':name,'width':30,'height':20,'unlockedPlan':rows,'lockedPlan':copy.deepcopy(rows)})
            regs.append({'prefab':name,'worldPlacementVerified':False,'halfWorldTicksToCanvasCandidate':[1,0,0,1,0,0]})
        maps[0]['lockedPlan'] += [copy.deepcopy(maps[0]['lockedPlan'][0]) for _ in range(94)]
        plan={'privateOnly':True,'publicationAuthorized':False,'refs':refs,'maps':maps}
        reg={'schema':'wand.src04.native-map-registration-candidate@1','privateOnly':True,
             'publicationAuthorized':False,'worldPlacementVerified':False,'maps':regs}
        return plan,reg

    def test_direct_draw_plan(self):
        p,r=self.fixture()
        a=prepare_geometry(p,r)
        self.assertEqual(len(a['images']),118)
        self.assertEqual(len(a['maps']),10)
        self.assertFalse(a['worldPlacementVerified'])
        self.assertFalse(a['publicationAuthorized'])

    def test_bad_source_and_dimensions(self):
        p,r=self.fixture()
        p['maps'][0]['lockedPlan'][0]['size']=[4,2]
        with self.assertRaises(ValueError):prepare_geometry(p,r)
        p,r=self.fixture()
        p['refs'][0][1]='f'*64
        with self.assertRaises(ValueError):prepare_geometry(p,r)

if __name__=='__main__':unittest.main()
