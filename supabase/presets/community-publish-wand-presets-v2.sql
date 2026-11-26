-- Staging migration: additive support for compact v2 publication.
-- Existing v1 RPCs and their existing rows are unchanged.
alter table public.preset_artifacts drop constraint preset_artifacts_preset_type_check;
alter table public.preset_artifacts add constraint preset_artifacts_preset_type_check check (preset_type in ('scene','biome','floating_island','tom_furniture','tom_clothing','world','room','floor','building','region','support','design','network'));
update storage.buckets set allowed_mime_types=array['application/json','application/gzip'] where id='wand-preset-artifacts-staging' and public=false and allowed_mime_types=array['application/json'];
CREATE OR REPLACE FUNCTION public.community_publish_wand_preset_v2(p_auth_subject uuid, p_preset_type text, p_existing_preset_artifact_id uuid, p_creator_profile_id uuid, p_title text, p_description text, p_artifact_storage_key text, p_schema_version integer, p_content_type text, p_byte_size bigint, p_checksum_sha256 text, p_metadata jsonb, p_media_ids uuid[], p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'pg_catalog', 'extensions', 'public', 'private'
AS $function$
declare
  v_account_id uuid;
  v_preset public.preset_artifacts%rowtype;
  v_preset_work public.community_works%rowtype;
  v_gallery_work public.community_works%rowtype;
  v_blob_id uuid;
  v_preset_id uuid;
  v_preset_revision_id uuid;
  v_preset_revision_number integer;
  v_preset_work_id uuid;
  v_preset_work_revision_id uuid;
  v_preset_work_revision_number integer;
  v_gallery_work_id uuid;
  v_gallery_revision_id uuid;
  v_gallery_revision_number integer;
  v_media_id uuid;
  v_ordinal integer:=0;
  v_media_ids uuid[];
  v_media_count integer;
  v_response jsonb;
  v_request_hash text;
  v_existing_hash text;
begin
  v_account_id:=private.resolve_active_account(p_auth_subject);

  if coalesce(char_length(btrim(p_title)),0) not between 1 and 240 then
    raise exception 'Wand Preset public title must be 1-240 characters';
  end if;
  if p_description is not null and char_length(p_description)>20000 then
    raise exception 'Wand Preset description exceeds 20000 characters';
  end if;
  if p_schema_version is distinct from 2 then
    raise exception 'Unsupported Wand Preset schema version';
  end if;
  if p_content_type is null or p_content_type not in ('application/json','application/gzip') then
    raise exception 'Wand Preset artifact content type is invalid';
  end if;
  if p_byte_size is null or p_byte_size<=0 or p_byte_size>16000000 then
    raise exception 'Wand Preset artifact byte size is invalid';
  end if;
  if p_artifact_storage_key is null or p_artifact_storage_key !~ ('^published/'||v_account_id::text||'/[0-9a-f-]{36}[.]wandpreset$') then
    raise exception 'Wand Preset artifact storage key is required';
  end if;
  if p_checksum_sha256 is null or p_checksum_sha256 !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'Invalid Wand Preset SHA-256 checksum';
  end if;
  if coalesce(char_length(btrim(p_idempotency_key)),0) not between 1 and 128 then
    raise exception 'Idempotency key required';
  end if;

  -- Server-derived receipt only; no caller-provided arbitrary metadata.
  if p_preset_type is null or p_preset_type not in ('scene','support','region','biome','floating_island','world','room','floor','building','design','network')
     or p_metadata is null or jsonb_typeof(p_metadata)<>'object'
     or (p_metadata-'schemaVersion'-'schema'-'kind'-'gameVersion'-'byteSize'-'contentType'-'checksumSha256'-'distinctObjectTypes'-'totalObjects')<>'{}'::jsonb
     or (p_metadata->>'schemaVersion') is distinct from '2'
     or (p_metadata->>'gameVersion') is distinct from '1.26.2'
     or (p_metadata->>'byteSize') is distinct from p_byte_size::text
     or (p_metadata->>'contentType') is distinct from p_content_type
     or (p_metadata->>'checksumSha256') is distinct from lower(p_checksum_sha256)
     or (case when p_metadata->>'kind'='island' then 'floating_island' else p_metadata->>'kind' end) is distinct from p_preset_type
     or coalesce(p_metadata->>'schema','') not in ('wand.preset.scene@1','wand.preset.mixed-scene@1','wand.preset.area-scene@1','wand.preset.support-scene@1','wand.preset.whole-area-design@1','wand.preset.biome-network@1','wand.preset.biome-decoration@1','wand.preset.floating-island-design@1','wand.preset.floating-island-decoration@1','wand.preset.world-decoration@1','wand.preset.region-decoration@1','wand.preset.indoor-decoration@1','wand.room-design@1','wand.world-design@1','wand.mainland-design@1','wand.world-scope-design@1')
     or coalesce(p_metadata->>'totalObjects','') !~ '^[0-9]{1,6}$'
     or coalesce(p_metadata->>'distinctObjectTypes','') !~ '^[0-9]{1,6}$'
  then raise exception 'PRESET_RECEIPT_INVALID'; end if;
  if (p_metadata->>'totalObjects')::int>200000 or (p_metadata->>'distinctObjectTypes')::int>(p_metadata->>'totalObjects')::int then raise exception 'PRESET_COUNTS_INVALID'; end if;
  if coalesce(cardinality(p_media_ids),0) not between 1 and 10 then raise exception 'PUBLIC_IMAGE_REQUIRED'; end if;
  if not exists(select 1 from storage.objects where bucket_id='wand-preset-artifacts-staging' and name=p_artifact_storage_key) then raise exception 'PRESET_STORAGE_UNAVAILABLE'; end if;

  if not exists(
    select 1 from public.creator_profiles c
    where c.creator_profile_id=p_creator_profile_id
      and c.owner_account_id=v_account_id
      and c.moderation_state='clear'
      and c.profile_visibility='public'
  ) then
    raise exception 'CreatorProfile is not owned, public, and moderation-clear';
  end if;

  v_media_ids:=coalesce(p_media_ids,array[]::uuid[]);
  v_media_count:=cardinality(v_media_ids);
  if p_existing_preset_artifact_id is null then
    if v_media_count not between 1 and 10 then
      raise exception 'Initial Wand Preset publication requires 1-10 public images';
    end if;
  elsif v_media_count>10 then
    raise exception 'Wand Preset publication supports at most 10 public images';
  end if;

  if v_media_count>0 and
     (select count(*) from unnest(v_media_ids) x)
     <> (select count(distinct x) from unnest(v_media_ids) x) then
    raise exception 'Wand Preset media IDs must be unique';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_account_id::text || ':' || p_idempotency_key,0)
  );

  v_request_hash:=encode(digest(
    concat_ws('|',
      'wand_preset_product_v2',p_preset_type,
      coalesce(p_existing_preset_artifact_id::text,'NEW'),
      p_creator_profile_id::text,
      btrim(p_title),
      coalesce(p_description,''),
      p_artifact_storage_key,
      p_schema_version::text,
      p_content_type,
      p_byte_size::text,
      lower(p_checksum_sha256),
      coalesce(p_metadata,'{}'::jsonb)::text,
      array_to_string(v_media_ids,',')
    ),'sha256'
  ),'hex');

  select request_hash,response into v_existing_hash,v_response
  from public.idempotency_keys
  where account_id=v_account_id and idempotency_key=p_idempotency_key;

  if v_existing_hash is not null then
    if v_existing_hash<>v_request_hash then
      raise exception 'Idempotency key reused with a different request';
    end if;
    return v_response;
  end if;

  foreach v_media_id in array v_media_ids loop
    if not exists(
      select 1 from public.media_assets m
      where m.media_id=v_media_id
        and m.owner_account_id=v_account_id
        and m.processing_state='ready'
        and m.moderation_state='clear'
        and m.purged_at is null
    ) then
      raise exception 'Wand Preset public image is not owner-controlled and READY';
    end if;
  end loop;

  insert into public.idempotency_keys(
    account_id,idempotency_key,command_name,request_hash
  ) values(
    v_account_id,p_idempotency_key,'wand_preset_product_v2',v_request_hash
  );

  v_blob_id:=gen_random_uuid();
  insert into public.artifact_blobs(
    blob_id,owner_account_id,storage_key,schema_version,content_type,byte_size,checksum_sha256
  ) values(
    v_blob_id,v_account_id,p_artifact_storage_key,p_schema_version,p_content_type,p_byte_size,
    lower(p_checksum_sha256)
  );

  if p_existing_preset_artifact_id is null then
    v_preset_id:=gen_random_uuid();
    v_preset_work_id:=gen_random_uuid();
    v_gallery_work_id:=gen_random_uuid();

    insert into public.community_entities(entity_id,entity_type) values
      (v_preset_id,'preset_artifact'),
      (v_preset_work_id,'community_work'),
      (v_gallery_work_id,'community_work');

    insert into public.community_works(
      work_id,owner_account_id,creator_profile_id,work_type,lifecycle_state,visibility
    ) values
      (v_preset_work_id,v_account_id,p_creator_profile_id,'preset','draft','public'),
      (v_gallery_work_id,v_account_id,p_creator_profile_id,'gallery','draft','public');

    insert into public.gallery_works(work_id,gallery_kind)
    values(v_gallery_work_id,'preset_scene');
    insert into public.gallery_work_settings(work_id,comments_enabled)
    values(v_gallery_work_id,true);

    insert into public.preset_artifacts(
      preset_artifact_id,owner_account_id,creator_profile_id,community_work_id,
      associated_gallery_work_id,preset_type
    ) values(
      v_preset_id,v_account_id,p_creator_profile_id,v_preset_work_id,
      v_gallery_work_id,p_preset_type
    );

    insert into public.community_entity_origins(entity_id,origin_kind) values
      (v_preset_id,private.community_origin_kind_for_account(v_account_id)),
      (v_preset_work_id,private.community_origin_kind_for_account(v_account_id)),
      (v_gallery_work_id,private.community_origin_kind_for_account(v_account_id));

    v_preset_revision_number:=1;
    v_preset_work_revision_number:=1;
    v_gallery_revision_number:=1;
  else
    select * into v_preset
    from public.preset_artifacts
    where preset_artifact_id=p_existing_preset_artifact_id
    for update;

    if v_preset.preset_artifact_id is null then
      raise exception 'Wand Preset master not found';
    end if;
    if v_preset.owner_account_id<>v_account_id
       or v_preset.creator_profile_id<>p_creator_profile_id then
      raise exception 'Actor does not own Wand Preset master';
    end if;
    if v_preset.preset_type<>p_preset_type then
      raise exception 'Only Wand Presets are supported by this vertical';
    end if;
    if not exists(select 1 from public.preset_revisions pr join public.artifact_blobs b on b.blob_id=pr.artifact_blob_id where pr.preset_artifact_id=v_preset.preset_artifact_id and b.schema_version=2) then raise exception 'LEGACY_PRESET_UPDATE_UNSUPPORTED'; end if;
    if v_preset.community_work_id is null
       or v_preset.associated_gallery_work_id is null then
      raise exception 'Wand Preset publication relationship is incomplete';
    end if;

    v_preset_id:=v_preset.preset_artifact_id;
    v_preset_work_id:=v_preset.community_work_id;
    v_gallery_work_id:=v_preset.associated_gallery_work_id;

    select * into v_preset_work
    from public.community_works where work_id=v_preset_work_id for update;
    select * into v_gallery_work
    from public.community_works where work_id=v_gallery_work_id for update;

    if v_preset_work.owner_account_id<>v_account_id
       or v_preset_work.work_type<>'preset'
       or v_preset_work.moderation_state<>'clear'
       or v_preset_work.lifecycle_state not in ('published','unpublished') then
      raise exception 'Wand Preset publication is not updateable';
    end if;
    if v_gallery_work.owner_account_id<>v_account_id
       or v_gallery_work.work_type<>'gallery'
       or v_gallery_work.moderation_state<>'clear'
       or v_gallery_work.lifecycle_state not in ('published','unpublished') then
      raise exception 'Associated Gallery Work is not updateable';
    end if;

    if v_media_count=0 then
      select coalesce(array_agg(wrm.media_id order by wrm.ordinal),array[]::uuid[])
      into v_media_ids
      from public.work_revision_media wrm
      where wrm.work_revision_id=v_gallery_work.current_published_revision_id;
      v_media_count:=cardinality(v_media_ids);
      if v_media_count not between 1 and 10 then
        raise exception 'Publish Update requires existing or replacement public image';
      end if;
    end if;

    select coalesce(max(revision_number),0)+1 into v_preset_revision_number
    from public.preset_revisions where preset_artifact_id=v_preset_id;
    select coalesce(max(revision_number),0)+1 into v_preset_work_revision_number
    from public.community_work_revisions where work_id=v_preset_work_id;
    select coalesce(max(revision_number),0)+1 into v_gallery_revision_number
    from public.community_work_revisions where work_id=v_gallery_work_id;
  end if;

  v_preset_revision_id:=gen_random_uuid();
  insert into public.preset_revisions(
    preset_revision_id,preset_artifact_id,revision_number,artifact_blob_id,metadata,created_by_account_id
  ) values(
    v_preset_revision_id,v_preset_id,v_preset_revision_number,v_blob_id,
    coalesce(p_metadata,'{}'::jsonb),v_account_id
  );

  v_preset_work_revision_id:=gen_random_uuid();
  insert into public.community_work_revisions(
    revision_id,work_id,revision_number,created_by_account_id,shared_metadata
  ) values(
    v_preset_work_revision_id,v_preset_work_id,v_preset_work_revision_number,v_account_id,
    jsonb_build_object(
      'title',btrim(p_title),
      'description',p_description,
      'associatedGalleryWorkId',v_gallery_work_id,
      'presetType',p_preset_type
    )
  );
  insert into public.preset_revision_publications(work_revision_id,preset_revision_id)
  values(v_preset_work_revision_id,v_preset_revision_id);

  v_gallery_revision_id:=gen_random_uuid();
  insert into public.community_work_revisions(
    revision_id,work_id,revision_number,created_by_account_id,shared_metadata
  ) values(
    v_gallery_revision_id,v_gallery_work_id,v_gallery_revision_number,v_account_id,
    jsonb_build_object(
      'origin','wand-preset-publication',
      'presetArtifactId',v_preset_id,
      'presetRevisionId',v_preset_revision_id
    )
  );
  insert into public.gallery_work_revisions(revision_id,title,description,metadata)
  values(
    v_gallery_revision_id,btrim(p_title),p_description,
    jsonb_build_object(
      'publicationSource','wand_preset',
      'presetType',p_preset_type,
      'presetArtifactId',v_preset_id
    )
  );

  v_ordinal:=0;
  foreach v_media_id in array v_media_ids loop
    insert into public.work_revision_media(work_revision_id,media_id,ordinal,role)
    values(v_gallery_revision_id,v_media_id,v_ordinal,'gallery');
    v_ordinal:=v_ordinal+1;
  end loop;

  insert into public.gallery_revision_presets(gallery_revision_id,preset_revision_id)
  values(v_gallery_revision_id,v_preset_revision_id);

  update public.community_works
  set lifecycle_state='published',
      visibility='public',
      current_published_revision_id=v_preset_work_revision_id,
      published_at=coalesce(published_at,now()),
      updated_at=now()
  where work_id=v_preset_work_id
  returning * into v_preset_work;

  update public.community_works
  set lifecycle_state='published',
      visibility='public',
      current_published_revision_id=v_gallery_revision_id,
      published_at=coalesce(published_at,now()),
      updated_at=now()
  where work_id=v_gallery_work_id
  returning * into v_gallery_work;

  insert into public.search_documents(
    entity_id,work_id,work_type,creator_profile_id,title,text_content,tags,facets,published_at,updated_at
  ) values(
    v_preset_work_id,v_preset_work_id,'preset',p_creator_profile_id,btrim(p_title),
    coalesce(p_description,''),array[]::text[],
    jsonb_build_object(
      'presetType',p_preset_type,
      'presetArtifactId',v_preset_id,
      'presetRevisionId',v_preset_revision_id,
      'galleryWorkId',v_gallery_work_id
    ),
    v_preset_work.published_at,now()
  )
  on conflict(entity_id) do update set
    creator_profile_id=excluded.creator_profile_id,
    title=excluded.title,
    text_content=excluded.text_content,
    tags=excluded.tags,
    facets=excluded.facets,
    published_at=excluded.published_at,
    updated_at=now();

  insert into public.search_documents(
    entity_id,work_id,work_type,creator_profile_id,title,text_content,tags,facets,published_at,updated_at
  ) values(
    v_gallery_work_id,v_gallery_work_id,'gallery',p_creator_profile_id,btrim(p_title),
    coalesce(p_description,''),array[]::text[],
    jsonb_build_object(
      'galleryKind','preset_scene',
      'commentsEnabled',true,
      'presetArtifactId',v_preset_id,
      'presetRevisionId',v_preset_revision_id
    ),
    v_gallery_work.published_at,now()
  )
  on conflict(entity_id) do update set
    creator_profile_id=excluded.creator_profile_id,
    title=excluded.title,
    text_content=excluded.text_content,
    tags=excluded.tags,
    facets=excluded.facets,
    published_at=excluded.published_at,
    updated_at=now();

  insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,dedupe_key)
  values(
    'community_work',v_preset_work_id,'work.published',
    jsonb_build_object(
      'workId',v_preset_work_id,
      'revisionId',v_preset_work_revision_id,
      'presetArtifactId',v_preset_id,
      'presetRevisionId',v_preset_revision_id,
      'galleryWorkId',v_gallery_work_id,
      'galleryRevisionId',v_gallery_revision_id
    ),
    'wand_preset_product_v2.published:' || v_preset_revision_id::text
  );

  insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,dedupe_key)
  values(
    'community_work',v_gallery_work_id,'work.published',
    jsonb_build_object(
      'workId',v_gallery_work_id,
      'revisionId',v_gallery_revision_id,
      'presetArtifactId',v_preset_id,
      'presetRevisionId',v_preset_revision_id
    ),
    'wand_preset_gallery_v2.published:' || v_gallery_revision_id::text
  );

  v_response:=jsonb_build_object(
    'presetArtifactId',v_preset_id,
    'presetRevisionId',v_preset_revision_id,
    'presetRevisionNumber',v_preset_revision_number,
    'workId',v_preset_work_id,
    'workRevisionId',v_preset_work_revision_id,
    'galleryWorkId',v_gallery_work_id,
    'galleryWorkRevisionId',v_gallery_revision_id,
    'galleryRevisionNumber',v_gallery_revision_number,
    'title',btrim(p_title),
    'presetType',p_preset_type,
    'mediaIds',to_jsonb(v_media_ids)
  );

  update public.idempotency_keys
  set response=v_response,completed_at=now()
  where account_id=v_account_id and idempotency_key=p_idempotency_key;

  return v_response;
end
$function$
;
revoke all on function public.community_publish_wand_preset_v2(uuid,text,uuid,uuid,text,text,text,integer,text,bigint,text,jsonb,uuid[],text) from public,anon,authenticated;
grant execute on function public.community_publish_wand_preset_v2(uuid,text,uuid,uuid,text,text,text,integer,text,bigint,text,jsonb,uuid[],text) to service_role;

CREATE OR REPLACE FUNCTION public.community_unpublish_wand_preset_v2(p_auth_subject uuid, p_preset_artifact_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'pg_catalog', 'extensions', 'public', 'private'
AS $function$
declare
  v_account_id uuid;
  v_preset public.preset_artifacts%rowtype;
  v_response jsonb;
  v_request_hash text;
  v_existing_hash text;
begin
  v_account_id:=private.resolve_active_account(p_auth_subject);
  if coalesce(char_length(btrim(p_idempotency_key)),0) not between 1 and 128 then raise exception 'IDEMPOTENCY_REQUIRED'; end if;
  perform pg_advisory_xact_lock(
    hashtextextended(v_account_id::text || ':' || p_idempotency_key,0)
  );
  v_request_hash:=encode(digest(
    concat_ws('|','unpublish_wand_preset_v2',p_preset_artifact_id::text),
    'sha256'
  ),'hex');

  select request_hash,response into v_existing_hash,v_response
  from public.idempotency_keys
  where account_id=v_account_id and idempotency_key=p_idempotency_key;
  if v_existing_hash is not null then
    if v_existing_hash<>v_request_hash then
      raise exception 'Idempotency key reused with a different request';
    end if;
    return v_response;
  end if;

  select * into v_preset
  from public.preset_artifacts
  where preset_artifact_id=p_preset_artifact_id
  for update;

  if v_preset.preset_artifact_id is null
     or v_preset.owner_account_id<>v_account_id
     or v_preset.preset_type not in ('scene','support','region','biome','floating_island','world','room','floor','building','design','network')
     or v_preset.associated_gallery_work_id is null
     or not exists(select 1 from public.preset_revisions pr join public.artifact_blobs b on b.blob_id=pr.artifact_blob_id where pr.preset_artifact_id=v_preset.preset_artifact_id and b.schema_version=2) then
    raise exception 'Owned Wand Preset not found';
  end if;

  if not exists(
    select 1 from public.community_works
    where work_id=v_preset.community_work_id and lifecycle_state='published'
  ) then raise exception 'Wand Preset is not published'; end if;

  insert into public.idempotency_keys(account_id,idempotency_key,command_name,request_hash)
  values(v_account_id,p_idempotency_key,'unpublish_wand_preset_v2',v_request_hash);

  update public.community_works
  set lifecycle_state='unpublished',updated_at=now()
  where work_id in (v_preset.community_work_id,v_preset.associated_gallery_work_id);

  delete from public.search_documents
  where entity_id in (v_preset.community_work_id,v_preset.associated_gallery_work_id);

  insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,dedupe_key)
  values
    ('community_work',v_preset.community_work_id,'work.unpublished',
      jsonb_build_object('workId',v_preset.community_work_id),
      'wand_preset_v2.unpublished:' || v_preset.community_work_id::text || ':' || p_idempotency_key),
    ('community_work',v_preset.associated_gallery_work_id,'work.unpublished',
      jsonb_build_object('workId',v_preset.associated_gallery_work_id),
      'wand_preset_gallery_v2.unpublished:' || v_preset.associated_gallery_work_id::text || ':' || p_idempotency_key);

  v_response:=jsonb_build_object(
    'presetArtifactId',v_preset.preset_artifact_id,
    'workId',v_preset.community_work_id,
    'galleryWorkId',v_preset.associated_gallery_work_id,
    'lifecycleState','unpublished'
  );

  update public.idempotency_keys set response=v_response,completed_at=now()
  where account_id=v_account_id and idempotency_key=p_idempotency_key;
  return v_response;
end
$function$
;
revoke all on function public.community_unpublish_wand_preset_v2(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.community_unpublish_wand_preset_v2(uuid,uuid,text) to service_role;

CREATE OR REPLACE FUNCTION public.community_delete_wand_preset_v2(p_auth_subject uuid, p_preset_artifact_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'pg_catalog', 'extensions', 'public', 'private'
AS $function$
declare
  v_account_id uuid;
  v_preset public.preset_artifacts%rowtype;
  v_response jsonb;
  v_request_hash text;
  v_existing_hash text;
begin
  v_account_id:=private.resolve_active_account(p_auth_subject);
  if coalesce(char_length(btrim(p_idempotency_key)),0) not between 1 and 128 then raise exception 'IDEMPOTENCY_REQUIRED'; end if;
  perform pg_advisory_xact_lock(
    hashtextextended(v_account_id::text || ':' || p_idempotency_key,0)
  );
  v_request_hash:=encode(digest(
    concat_ws('|','delete_wand_preset_v2',p_preset_artifact_id::text),
    'sha256'
  ),'hex');

  select request_hash,response into v_existing_hash,v_response
  from public.idempotency_keys
  where account_id=v_account_id and idempotency_key=p_idempotency_key;
  if v_existing_hash is not null then
    if v_existing_hash<>v_request_hash then
      raise exception 'Idempotency key reused with a different request';
    end if;
    return v_response;
  end if;

  select * into v_preset
  from public.preset_artifacts
  where preset_artifact_id=p_preset_artifact_id
  for update;

  if v_preset.preset_artifact_id is null
     or v_preset.owner_account_id<>v_account_id
     or v_preset.preset_type not in ('scene','support','region','biome','floating_island','world','room','floor','building','design','network')
     or v_preset.associated_gallery_work_id is null
     or not exists(select 1 from public.preset_revisions pr join public.artifact_blobs b on b.blob_id=pr.artifact_blob_id where pr.preset_artifact_id=v_preset.preset_artifact_id and b.schema_version=2) then
    raise exception 'Owned Wand Preset not found';
  end if;

  insert into public.idempotency_keys(account_id,idempotency_key,command_name,request_hash)
  values(v_account_id,p_idempotency_key,'delete_wand_preset_v2',v_request_hash);

  update public.community_works
  set lifecycle_state='deleted',updated_at=now()
  where work_id in (v_preset.community_work_id,v_preset.associated_gallery_work_id);

  update public.community_entities
  set deleted_at=coalesce(deleted_at,now())
  where entity_id in (
    v_preset.preset_artifact_id,
    v_preset.community_work_id,
    v_preset.associated_gallery_work_id
  );

  delete from public.search_documents
  where entity_id in (v_preset.community_work_id,v_preset.associated_gallery_work_id);

  insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,dedupe_key)
  values
    ('community_work',v_preset.community_work_id,'work.deleted',
      jsonb_build_object('workId',v_preset.community_work_id),
      'wand_preset_v2.deleted:' || v_preset.community_work_id::text || ':' || p_idempotency_key),
    ('community_work',v_preset.associated_gallery_work_id,'work.deleted',
      jsonb_build_object('workId',v_preset.associated_gallery_work_id),
      'wand_preset_gallery_v2.deleted:' || v_preset.associated_gallery_work_id::text || ':' || p_idempotency_key);

  v_response:=jsonb_build_object(
    'presetArtifactId',v_preset.preset_artifact_id,
    'workId',v_preset.community_work_id,
    'galleryWorkId',v_preset.associated_gallery_work_id,
    'lifecycleState','deleted'
  );

  update public.idempotency_keys set response=v_response,completed_at=now()
  where account_id=v_account_id and idempotency_key=p_idempotency_key;
  return v_response;
end
$function$
;
revoke all on function public.community_delete_wand_preset_v2(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.community_delete_wand_preset_v2(uuid,uuid,text) to service_role;
