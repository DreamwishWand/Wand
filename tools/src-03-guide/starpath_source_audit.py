"""Audit *only* source-supplied ProtoDB for archived Star Path coverage.

Zero season payloads in protoDb.bin does NOT mean no live Star Path exists.
No network access or game/source modifications.
"""
import argparse
import json
from pathlib import Path

from native_guide import sha, save, wire_fields, text_field

SCHEMA = 'wand.db03.starpath-source-coverage@1'
MAX_FILE_BYTES = 128 * 1024 * 1024


def audit(raw, version, platform='Steam'):
    if not isinstance(raw,bytes) or not raw or len(raw)>MAX_FILE_BYTES:
        raise ValueError('INVALID_OR_OVERSIZED_PROTO_DB')
    if not version or not isinstance(version,str):
        raise ValueError('SOURCE_VERSION_REQUIRED')
    counts={'protoDbEntries':0,'seasonDefinitionsInProtoDb':0,
            'introductionOnlyDefinitions':0}
    for field,wire,body in wire_fields(raw):
        if (field,wire)!=(1,2):raise ValueError('INVALID_PROTO_DB_ENTRY_CONTAINER')
        parts=wire_fields(body)
        name=text_field(parts,1)
        envelopes=[v for n,w,v in parts if (n,w)==(2,2)]
        if not name or len(envelopes)!=1:
            raise ValueError('INVALID_PROTO_DB_ENTRY')
        env=wire_fields(envelopes[0]);typename=text_field(env,5)
        if typename is None:raise ValueError('PROTO_DB_ENTRY_TYPE_MISSING')
        counts['protoDbEntries']+=1
        if typename.endswith('.BattlePassSeasonData') or typename=='BattlePassSeasonData':
            counts['seasonDefinitionsInProtoDb']+=1
        if typename=='Definitions.StarPathFtueConfig':
            counts['introductionOnlyDefinitions']+=1
    return {'schema':SCHEMA,'target':{'gameVersion':version,'platform':platform},
            'source':{'file':'ddv_Data/StreamingAssets/protoDb.bin',
                      'sha256':sha(raw),'bytes':len(raw)},
            'counts':counts,
            'seasonCatalogCoverage':('season_definitions_found_in_examined_protoDb'
                if counts['seasonDefinitionsInProtoDb'] else
                'no_season_definitions_in_examined_protoDb'),
            'nextSourceContract':'GetBattlePasses.Types.Response.BattlePassesUpdated (field 4: map<string, BattlePassSeasonData>)',
            'limitation':'Examines archived ProtoDB only; no live server, user state, season expiration, or complete game-content absence claims.'}


def main():
    parser=argparse.ArgumentParser(description='Offline static ProtoDB Star Path coverage audit')
    parser.add_argument('--input',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--version',required=True)
    args=parser.parse_args()
    try:
        source=args.input.resolve(strict=True)
        if args.input.is_symlink() or not source.is_file() or source==args.output.resolve():
            raise ValueError('INVALID_AUDIT_SOURCE_OR_DESTINATION')
        if source.stat().st_size>MAX_FILE_BYTES:raise ValueError('SOURCE_TOO_LARGE')
        report=audit(source.read_bytes(),args.version)
        save(args.output,report)
        print(json.dumps({'counts':report['counts'],
                          'seasonCatalogCoverage':report['seasonCatalogCoverage']},sort_keys=True))
    except (ValueError,OSError) as ex:
        parser.exit(1,f'Star Path source audit error: {ex}\n')

if __name__=='__main__':main()
