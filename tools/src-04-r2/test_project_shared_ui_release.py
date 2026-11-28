import hashlib
import json
import unittest
from project_shared_ui_release import project

class UiProjectionTests(unittest.TestCase):
    def test_projection_and_verification_boundary(self):
        sha="a"*64
        guid="b"*32
        image={"sha256":sha,"width":1024,"height":512,"bytes":1234}
        evidence={"schema":"wand.media.private-ui-original-evidence@1","gameVersion":"1.26.2",
                  "privateOnly":True,"publicationAuthorized":False,
                  "assets":{guid:{"name":"icon_furniture","original":sha,"kind":"Texture2D",
                                  "fullSpriteRectMatched":True,"sourceBundleSha256":"c"*64}},
                  "images":{sha:image}}
        index={"gameVersion":"1.26.2","images":{sha:image},"references":{guid:{"role":"ui-original","original":sha}}}
        objects={"images/"+sha+".webp":1234}
        raw=json.dumps({"schema":"wand.media.shared-image-publication-receipt@1","gameVersion":"1.26.2",
                        "bucket":"dreamwishwand-media","canonicalMetadataVerified":True,"objects":objects}).encode()
        cdn={"schema":"wand.media.cdn-readback@1","origin":"https://media.dreamwishwand.com/",
             "cdnVerified":True,"errors":{},"sourceReceiptSha256":hashlib.sha256(raw).hexdigest(),"verified":objects}
        result=project(evidence,index,raw,cdn)
        self.assertEqual(result["entries"]["icon_furniture"],[{"kind":"Texture2D",**image},{"kind":"Sprite",**image}])
        self.assertNotIn("sourceBundleSha256",json.dumps(result))
        with self.assertRaises(ValueError):
            project(evidence,index,raw,{**cdn,"cdnVerified":False})
        with self.assertRaises(ValueError):
            project(evidence,index,raw,{**cdn,"verified":{}})

if __name__=="__main__":unittest.main()
