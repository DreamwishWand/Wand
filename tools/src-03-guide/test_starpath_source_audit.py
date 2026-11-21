"""Synthetic source-coverage tests only. No actual Steam source in CI."""
import unittest
import starpath_source_audit as audit
from native_guide import encode_varint


def sf(n,p):
    if isinstance(p,str):p=p.encode('utf8')
    return encode_varint((n<<3)|2)+encode_varint(len(p))+p


def entry(name,typename):
    body=sf(1,name)+sf(2,sf(5,typename)+sf(6,b'\x08\x01'))
    return sf(1,body)


class AuditTests(unittest.TestCase):
    def test_intro_only_not_interpreted_as_live_catalog(self):
        rows=(entry('StarPathFTUE','Definitions.StarPathFtueConfig')+
              entry('SomeOther','Definitions.DesignChallengeData'))
        doc=audit.audit(rows,'1.26.1')
        self.assertEqual(doc['counts'],{
            'protoDbEntries':2,'seasonDefinitionsInProtoDb':0,
            'introductionOnlyDefinitions':1})
        self.assertEqual(doc['seasonCatalogCoverage'],'no_season_definitions_in_examined_protoDb')
        self.assertNotIn('liveSeasonCount',doc)
        self.assertEqual(len(doc['source']['sha256']),64)

    def test_genuine_season_type_would_be_reported_not_filtered(self):
        doc=audit.audit(entry('SyntheticSeason','Definitions.BattlePassSeasonData'),'1.26.1')
        self.assertEqual(doc['counts']['seasonDefinitionsInProtoDb'],1)
        self.assertEqual(doc['seasonCatalogCoverage'],'season_definitions_found_in_examined_protoDb')

    def test_malformed_envelope_and_noncanonical_varint_rejected(self):
        with self.assertRaises(ValueError):audit.audit(sf(1,sf(1,'Name')),'1.26.1')
        with self.assertRaises(ValueError):audit.audit(b'\x80\x00','1.26.1')
        with self.assertRaisesRegex(ValueError,'SOURCE_VERSION_REQUIRED'):
            audit.audit(entry('Name','Definitions.X'),'')


if __name__=='__main__':unittest.main()
