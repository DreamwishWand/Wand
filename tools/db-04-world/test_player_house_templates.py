import base64
import json
import unittest
import zlib

from player_house_templates import decode, building_bindings


def varint(n):
    b=bytearray()
    while n>=128:
        b.append((n&127)|128)
        n>>=7
    b.append(n)
    return bytes(b)


def s(n,v):
    return varint(n*8)+varint(v)


def m(n,v):
    return varint(n*8+2)+varint(len(v))+v


def entry(n,k,v):
    return m(n,(s(1,k) if k else b"")+m(2,v))


def scalar_entry(n,k,v):
    return m(n,(s(1,k) if k else b"")+s(2,v))


def fixture(extra=False,shared=False,unknown=False):
    walls=[1,2,3,4]
    if shared:
        walls[-1]=3
    room=b"".join(scalar_entry(3,k,v) for k,v in enumerate(walls))
    room+=m(4,b"guid:synthetic")+s(5,160100000)
    room+=b"".join(scalar_entry(6,k,160100001) for k in range(4))+s(8,160100002)
    house=m(1,entry(1,0,room))
    grids=b""
    for gid in range(6 if extra else 5):
        g=(s(1,gid) if gid else b"")+m(2,b"GridData/Rooms/Room8x8-GridData.json")+s(4,1)
        if gid==0:
            obj=s(2,40000001)+s(5,8)
            if extra:
                obj+=m(6,m(1,s(1,5)))
            if unknown:
                obj+=s(7,1)
            g+=entry(5,0,obj)+s(6,1)
        grids+=entry(1,gid,g)
    return m(1,house)+m(2,grids+s(3,6 if extra else 5))


class PlayerHouseTemplates(unittest.TestCase):
    def test_zero_source_ids_are_valid_and_no_runtime_id_is_allocated(self):
        t=decode(fixture(),"SceneLayouts/Houses/PlayerHouse-Synthetic_DefaultLayout.json")
        self.assertEqual(t["floors"][0]["Rooms"][0]["FloorGridID"],0)
        self.assertEqual(t["grids"][0]["Objects"][0]["Orientation"],"GridOrientation_Down")
        self.assertTrue(t["stateFree"])
        self.assertEqual(len(t["grids"]),5)

    def test_state_is_classified_not_guessed(self):
        t=decode(fixture(extra=True),"synthetic")
        self.assertFalse(t["stateFree"])
        self.assertEqual(t["stateFields"],{1:1})
        self.assertEqual(t["grids"][0]["Objects"][0]["sourceSubGridID"],5)

    def test_invalid_reference_and_unknown_field_reject(self):
        with self.assertRaises(ValueError):
            decode(fixture(shared=True),"synthetic")
        with self.assertRaises(ValueError):
            decode(fixture(unknown=True),"synthetic")

    def test_source_delta_bindings(self):
        rows=[[20000001,"other"],[500000,"A"],[1,"B"]]
        packed=base64.b64encode(zlib.compress(json.dumps(rows).encode())).decode()
        self.assertEqual(building_bindings({"fields":{"Building.DefaultGridLayoutPath@string":{"packed":packed,"count":3}}}),{20500001:"A",20500002:"B"})


if __name__=="__main__":
    unittest.main()
