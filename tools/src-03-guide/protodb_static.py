"""Game-file backed ProtoDB Guide projection (static, never live state)."""
from protodb_guide_catalog import KINDS, project_entry

SCHEMA = 'wand.db03.protodb-static@1'
LOCALES = ('en', 'fr', 'it', 'de', 'es-ES', 'ja', 'zh-CN', 'pt-BR')


def exact_localization(key, resolver, clean, missing, where):
    if not isinstance(key, str) or '.' not in key:
        return {'localizationKey': key, 'localizedText': {}, 'plainText': {}}
    values, _ = resolver.resolve(key)
    for language in LOCALES:
        if language not in values:
            missing.append({'kind': 'missing_static_localization', 'source': where,
                            'key': key, 'locale': language})
    return {'localizationKey': key, 'localizedText': values,
            'plainText': {locale: clean(text) for locale, text in values.items()}}


class LiveopsResolver:
    """Liveops.locbin includes source-verified key-only entries with no value.

    These are *missing* localizations, not malformed data or empty strings.
    Other locbin members use the existing strict resolver.
    """
    def __init__(self, original, wire_fields):
        self.original = original
        self.wire_fields = wire_fields
        self.tables = {}

    def resolve(self, key):
        if not key or '.' not in key:
            return {}, None
        member, token = key.rsplit('.', 1)
        member += '.locbin'
        if member != 'Liveops.locbin':
            return self.original.resolve(key)
        result = {}
        for language, archive in self.original.archives.items():
            if language not in self.tables:
                table = {}
                if member in archive.NameToInfo:
                    info = archive.getinfo(member)
                    if info.file_size > 32 * 1024 * 1024:
                        raise ValueError('LIVEOPS_LOCBIN_TOO_LARGE')
                    data = archive.read(info)
                    for field, wire, chunk in self.wire_fields(data):
                        if (field, wire) != (1, 2):
                            raise ValueError('LIVEOPS_UNEXPECTED_CONTAINER_FIELD')
                        fields = self.wire_fields(chunk)
                        shape = [(n,w) for n,w,v in fields]
                        if shape not in ([(1,2)],[(1,2),(2,2)]):
                            raise ValueError('LIVEOPS_UNEXPECTED_ENTRY_SHAPE')
                        name = fields[0][2].decode('utf-8')
                        if not name or name in table:
                            raise ValueError('LIVEOPS_DUPLICATE_OR_EMPTY_KEY')
                        value = fields[1][2].decode('utf-8') if len(fields)==2 else None
                        table[name] = value
                self.tables[language] = table
            value = self.tables[language].get(token)
            if value is not None:
                result[language] = value
        return result, member


def project_protodb(origin, out, target, resolver, wire_fields, text_field,
                    int_field, sha, source_data, save, plain_display,
                    quest_ids=None, duty_ids=None, world_ids=None):
    """Read the verified 1=entry, 1=name/2=envelope ProtoDB frame structure.

    The envelope is metadata (1=path,2=update,3=name,4=filepath,
    5=type,6=definition). We never interpret server-state flags.
    """
    file = origin / 'protoDb.bin'
    if not file.is_file():
        return {'status': 'not_present', 'designChallenges': 0, 'starPathFtue': 0,
                'miniEvents': 0, 'floatingFestivals': 0, 'expansions': 0}
    raw = source_data(file)
    digest = sha(raw)
    resolver = LiveopsResolver(resolver, wire_fields)
    design, ftue, unresolved = [], [], []
    extra = {family: [] for family in KINDS.values()}
    names = set()
    for idx, (field, wire, body) in enumerate(wire_fields(raw)):
        if (field, wire) != (1,2):
            raise ValueError('PROTO_DB_INVALID_CONTAINER_FIELD')
        fields = wire_fields(body)
        name = text_field(fields,1)
        envelope = [v for n,w,v in fields if (n,w)==(2,2)]
        if not name or len(envelope) != 1 or name in names:
            raise ValueError('PROTO_DB_INVALID_OR_DUPLICATE_ENTRY')
        names.add(name)
        values = wire_fields(envelope[0])
        class_name = text_field(values,5)
        data = [v for n,w,v in values if (n,w)==(6,2)]
        if class_name not in ('Definitions.DesignChallengeData','Definitions.StarPathFtueConfig') and class_name not in KINDS:
            continue
        if len(data) != 1:
            unresolved.append({'kind':'proto_db_entry_without_unique_payload','entry':name})
            continue
        bodyfields = wire_fields(data[0])
        base = {'id':name,'nativeClass':class_name,'source': {'file':'ddv_Data/StreamingAssets/protoDb.bin',
                'sha256':digest,'entryIndex':idx,'nativeWireSha256':sha(data[0])},
                'envelope':{'sourcePath':text_field(values,4),'updateGroup':text_field(values,2)}}
        if class_name == 'Definitions.DesignChallengeData':
            base['definitionKind'] = 'dreamSnaps' if name.startswith('DreamSnap') else 'otherDesignChallenge'
            base['text'] = {}
            for index, field_name in ((2,'title'),(3,'description'),(4,'shortDescription')):
                key = text_field(bodyfields,index)
                base['text'][field_name] = exact_localization(key,resolver,plain_display,
                    unresolved,name+'.'+field_name)
            base['minimumGameVersion'] = text_field(bodyfields,5)
            base['challengeTypeCode'] = int_field(bodyfields,6)
            # Static archived flags are deliberately distinguished from live availability.
            base['staticActiveFlag'] = bool(int_field(bodyfields,9)) if int_field(bodyfields,9) is not None else None
            base['staticOfflineFlag'] = bool(int_field(bodyfields,10)) if int_field(bodyfields,10) is not None else None
            base['nativeRewardIds'] = {field_name:str(value) for field_id,field_name in
                ((7,'decorReward'),(8,'outfitReward'),(30,'reward'))
                if (value:=int_field(bodyfields,field_id)) is not None and value>0}
            # ConditionDate: static source payload fingerprint, NOT a live schedule.
            base['staticDatePayloads'] = {field_name:sha(val) for field_id,field_name in
                ((11,'startDate'),(12,'startVotingDate'),(13,'endVotingDate'),(14,'endDate'))
                for n,w,val in bodyfields if (n,w)==(field_id,2)}
            base['tagPayloadSha256'] = [sha(v) for n,w,v in bodyfields if n in (19,20,21) and w==2]
            design.append(base)
        elif name == 'StarPathFTUE':
            base['definitionKind'] = 'starPathIntroductionOnly'
            base['text']={}
            for index,label in ((1,'title'),(2,'description'),(3,'shortDescription'),(4,'currencyName')):
                base['text'][label]=exact_localization(text_field(bodyfields,index),
                    resolver,plain_display,unresolved,name+'.'+label)
            for index,label in ((6,'freeActiveTaskCount'),(7,'premiumActiveTaskCount'),
                                (8,'premiumCurrencyGrant'),(13,'ftueQuestMission'),(15,'starPathIntroFtue')):
                value = int_field(bodyfields,index)
                if value is not None: base[label] = value
            base['rewardPagePayloadSha256']=[sha(val) for n,w,val in bodyfields if (n,w)==(9,2)]
            base['taskConfigSha256']=[sha(val) for n,w,val in bodyfields if n in (10,11,12) and w==2]
            quest = base.get('ftueQuestMission')
            base['ftueQuestLinkStatus'] = ('resolved' if str(quest) in quest_ids else 'unresolved') if quest and quest_ids is not None else 'unchecked'
            ftue.append(base)
        elif class_name in KINDS:
            row = project_entry(name, class_name, data[0], wire_fields, text_field,
                int_field, sha, lambda key, where: exact_localization(key, resolver,
                    plain_display, unresolved, where), quest_ids, duty_ids, world_ids)
            row['source'] = base['source']
            row['envelope'] = base['envelope']
            extra[KINDS[class_name]].append(row)
        else:
            unresolved.append({'kind':'other_starpath_ftue_class_name','entry':name,'type':class_name})
    design.sort(key=lambda rec:rec['id'])
    ftue.sort(key=lambda rec:rec['id'])
    save(out/'guide'/'design-challenges.json', {'schema':SCHEMA,'target':target,
          'records':design,'availability':'not_evaluated'})
    save(out/'guide'/'starpath-ftue.json', {'schema':SCHEMA,'target':target,
          'records':ftue,'availability':'not_evaluated'})
    for family, filename in (('miniEvents','mini-events.json'),
                             ('floatingFestivals','floating-festivals.json'),
                             ('expansions','expansions.json')):
        extra[family].sort(key=lambda row:row['id'])
        save(out/'guide'/filename, {'schema':SCHEMA,'target':target,'family':family,
              'records':extra[family],
              'availability':'archived_source_only_not_current_liveops'})
    manifest={'schema':SCHEMA,'target':target,'status':'STATIC_SOURCE_ONLY',
              'source':{'file':'ddv_Data/StreamingAssets/protoDb.bin','sha256':digest,'bytes':len(raw)},
              'counts':{'designChallenges':len(design),
                        'dreamSnaps':sum(x['definitionKind']=='dreamSnaps' for x in design),
                        'otherDesignChallenges':sum(x['definitionKind']=='otherDesignChallenge' for x in design),
                        'starPathFtue':len(ftue),
                        **{name:len(rows) for name,rows in extra.items()}},'issues':len(unresolved),
              'note':'Archived definitions are not evidence of current server availability.'}
    save(out/'protodb-static-manifest.json',manifest)
    save(out/'protodb-static-unresolved.json',{'schema':SCHEMA,'issues':unresolved})
    return {**manifest['counts'],'status':manifest['status'], 'issues':len(unresolved)}
