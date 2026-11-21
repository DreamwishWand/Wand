"""Verify 132 public nested path templates against a pinned native source dump.

The verifier rebuilds the full native Protobuf field chain from Profile:
fields, repeated fields, map value classes and nested messages. An arbitrary
private map key is never a public template. No private save input or values.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re

from discover_native_shapes import parse_native_messages, native_child

SCHEMA = "wand.db05.native1262-domain-fields@1"
SEGMENT = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")
PATH = re.compile(r"^/(?:Player|World)(?:/(?:[A-Za-z][A-Za-z0-9_]*(?:\[\])?|\{id\}))+$")


def sha256_stream(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024*1024), b""):
            digest.update(block)
    return digest.hexdigest()


def native_field_chain(native, path):
    """Return last (class, tag, C# property type) or fail closed.

    The map wildcard must correspond to a preceding MapField; repeated []
    must correspond to a RepeatedField. Non-source property names and
    non-public map keys are rejected without including supplied text.
    """
    if not isinstance(path, str) or len(path) > 512 or not PATH.fullmatch(path):
        raise ValueError("DB05_DOMAIN_PUBLIC_TEMPLATE_REQUIRED")
    tokens = path[1:].split("/")
    current_class = "Profile"
    pending_map = False
    last = None
    for index, token in enumerate(tokens):
        if token == "{id}":
            if not pending_map:
                raise ValueError("DB05_DOMAIN_UNBACKED_MAP_PLACEHOLDER")
            pending_map = False
            continue
        if pending_map:
            raise ValueError("DB05_DOMAIN_MAP_PLACEHOLDER_REQUIRED")
        repeated = token.endswith("[]")
        name = token[:-2] if repeated else token
        if not SEGMENT.fullmatch(name):
            raise ValueError("DB05_DOMAIN_PROPERTY_INVALID")
        rows = native.get(current_class)
        if rows is None:
            raise ValueError("DB05_DOMAIN_UNRECOGNIZED_MESSAGE")
        lookup = {row[0]: row for row in rows}
        if name not in lookup:
            raise ValueError("DB05_DOMAIN_UNRECOGNIZED_NATIVE_PROPERTY")
        last = (current_class,*lookup[name])
        native_type = lookup[name][2]
        terminal = index == len(tokens)-1
        if repeated:
            child, suffix = native_child(native_type)
            if suffix != "[]":
                raise ValueError("DB05_DOMAIN_EXPECTED_REPEATED_PROPERTY")
            if not terminal:
                current_class = child
        else:
            child, suffix = native_child(native_type)
            if suffix == "/{id}":
                if not terminal:
                    pending_map = True
                    current_class = child
            elif not terminal:
                current_class = child
    if pending_map or last is None:
        raise ValueError("DB05_DOMAIN_INCOMPLETE_PUBLIC_TEMPLATE")
    return last


def verify_domain_source(source_path, manifest, allow_new_source=False):
    if not isinstance(manifest,dict) or manifest.get("schema") != SCHEMA:
        raise ValueError("DB05_DOMAIN_MANIFEST_REQUIRED")
    source=manifest.get("source",{})
    expected=source.get("sourceHash")
    if not isinstance(expected,str) or not re.fullmatch("[0-9a-f]{64}",expected):
        raise ValueError("DB05_DOMAIN_SOURCE_HASH_REQUIRED")
    fields=manifest.get("fields")
    if not isinstance(fields,list) or len(fields)==0 or len(fields)>20000:
        raise ValueError("DB05_DOMAIN_FIELDS_INVALID")
    actual=sha256_stream(source_path)
    digest_equal=actual==expected
    if not digest_equal and not allow_new_source:
        raise ValueError("DB05_DOMAIN_SOURCE_HASH_MISMATCH")
    native=parse_native_messages(source_path)
    correct=0
    changes=[]
    seen=set()
    for field in fields:
        if not isinstance(field,dict) or field.get("writable") is not False:
            raise ValueError("DB05_DOMAIN_READONLY_FIELD_REQUIRED")
        path=field.get("path")
        if path in seen:
            raise ValueError("DB05_DOMAIN_DUPLICATE_PUBLIC_TEMPLATE")
        seen.add(path)
        cls,name,number,native_type=native_field_chain(native,path)
        if cls!=field.get("nativeMessage") or number!=field.get("protobufFieldNumber") or (
            native_type!=field.get("nativePropertyType")
        ):
            changes.append(path)
        else:
            correct+=1
    return {
        "schema":"wand.db05.native1262-domain-source-check@1",
        "registeredFieldCount":len(fields),
        "matchedFieldCount":correct,
        "changedPublicPaths":sorted(changes),
        "sourceMatchesPinnedHash":digest_equal,
        "classification":"archived_source_checked" if digest_equal and not changes else "review_required",
        "gameExecutableAttested":False,
        "wholeSaveSchemaProved":False,
        "sampledFieldsNotExhaustive":True,
        "strictCodecRoundTripVerified":False,
        "writerAuthorized":False,
        "exportAuthorized":False
    }


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dump",required=True,type=Path)
    parser.add_argument("--manifest",type=Path,default=Path(__file__).resolve().parents[2] /
                        "data/ddv/save/native1262-domain-fields.v1.json")
    parser.add_argument("--source-changed-review",action="store_true")
    args=parser.parse_args(argv)
    try:
        manifest=json.loads(args.manifest.read_text(encoding="utf-8"))
        result=verify_domain_source(args.dump,manifest,args.source_changed_review)
    except (OSError,ValueError,TypeError,KeyError,UnicodeError,json.JSONDecodeError):
        print("DB05_DOMAIN_SOURCE_CHECK_FAILED")
        return 1
    print(json.dumps(result,sort_keys=True))
    return 0 if result["classification"]=="archived_source_checked" else 2


if __name__=="__main__":
    raise SystemExit(main())
