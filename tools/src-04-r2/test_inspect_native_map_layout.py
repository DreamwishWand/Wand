import unittest
from inspect_native_map_layout import child_geometry,mul,point,compare

class NativeLayoutTests(unittest.TestCase):
    def test_centered_anchor_and_pivot(self):
        r={"rect":[0.5,0.5,0.5,0.5,-1062.4000244140625,-1055,1304,1496,0.5,0.5],"rotation":[0,0,0,1],"scale":[1,1,1]}
        size,pivot,matrix=child_geometry([4352,3846],[0.5,0.5],r)
        self.assertEqual(size,[1304,1496])
        self.assertEqual(point(matrix,-652,748),[-1714.4000244140625,-307])
    def test_stretch_anchor_inherited_scale(self):
        r={"rect":[0,0,1,1,0,0,-20,-10,0.5,0.5],"rotation":[0,0,0,1],"scale":[2,3,1]}
        size,pivot,matrix=child_geometry([100,60],[0.5,0.5],r)
        self.assertEqual(size,[80,50])
        self.assertEqual(point(mul([1,0,0,1,4,5],matrix),-40,25),[-76,80])
    def test_compare_reports_nonuniform_offsets(self):
        n={"worlds":[{"prefab":"Map","parts":[{"guid":"a","hierarchy":"Map/A","rootLocalCorners":[[0,0]]},{"guid":"b","hierarchy":"Map/B","rootLocalCorners":[[10,10]]}]}]}
        r={"schema":"wand.src04.world-map-repair@3","worlds":[{"prefab":"Map","pixelsPerLayoutUnit":2,"parts":[{"layoutEvidence":{"guid":"a","hierarchy":"Map/A"},"imageToCanvas":[1,0,0,1,100,100]},{"layoutEvidence":{"guid":"b","hierarchy":"Map/B"},"imageToCanvas":[1,0,0,1,130,80]}]}]}
        m=compare(n,r)["maps"][0]
        self.assertEqual(m["medianTranslation"],[105,100])
        self.assertEqual(m["maxCoordinateDeviation"],5)
if __name__=="__main__":unittest.main()
