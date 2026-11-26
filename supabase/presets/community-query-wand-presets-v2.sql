-- Read-only public catalog for compact Wand artifacts.
-- Service role only; no direct public table grants. No account identity,
-- arbitrary metadata, storage key or historical revision is exposed by the API.
create or replace function public.community_query_wand_presets_v2(
 p_query text default null,p_kind text default null,p_limit integer default 30,p_offset integer default 0,
 p_work_id uuid default null,p_revision_id uuid default null
) returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if p_limit is null or p_limit not between 1 and 50 or p_offset is null or p_offset not between 0 and 10000
 or char_length(coalesce(p_query,''))>100
 or (p_kind is not null and p_kind not in ('scene','support','region','biome','island','world','room','floor','building','design','network'))
 or (p_work_id is null)<>(p_revision_id is null) then raise exception 'PRESET_QUERY_INVALID'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'workId',x.work_id,'revisionId',x.preset_revision_id,'artifactId',x.preset_artifact_id,
   'title',x.title,'creatorProfileId',x.creator_profile_id,'creatorName',x.display_name,
   'publishedAt',x.published_at,'receipt',jsonb_build_object(
    'schemaVersion',2,'schema',x.metadata->>'schema','kind',x.metadata->>'kind','gameVersion','1.26.2',
    'byteSize',x.byte_size,'contentType',x.content_type,'checksumSha256',x.checksum_sha256,
    'distinctObjectTypes',x.metadata->'distinctObjectTypes','totalObjects',x.metadata->'totalObjects'),
   'mediaId',x.media_id,'storageKey',case when p_work_id is not null then x.storage_key else null end
  ) order by x.published_at desc,x.work_id),'[]'::jsonb) into result
 from (
   select w.work_id,pr.preset_revision_id,pa.preset_artifact_id,w.creator_profile_id,cp.display_name,
    w.published_at,wr.shared_metadata->>'title' title,pr.metadata,b.byte_size,b.content_type,b.checksum_sha256,b.storage_key,
    (select rm.media_id from public.work_revision_media rm
     join public.media_assets m on m.media_id=rm.media_id and m.owner_account_id=w.owner_account_id
     where rm.work_revision_id=coalesce(g.current_published_revision_id,w.current_published_revision_id)
       and m.processing_state='ready' and m.moderation_state='clear' and m.purged_at is null
     order by rm.ordinal limit 1) media_id
   from public.community_works w
   join public.community_entities we on we.entity_id=w.work_id and we.deleted_at is null
   join public.community_entity_origins wo on wo.entity_id=w.work_id and wo.origin_kind in ('user','staff_public')
   join public.creator_profiles cp on cp.creator_profile_id=w.creator_profile_id and cp.owner_account_id=w.owner_account_id
   join public.preset_artifacts pa on pa.community_work_id=w.work_id and pa.owner_account_id=w.owner_account_id and pa.creator_profile_id=w.creator_profile_id
   join public.community_entities pe on pe.entity_id=pa.preset_artifact_id and pe.deleted_at is null
   join public.community_entity_origins po on po.entity_id=pa.preset_artifact_id and po.origin_kind in ('user','staff_public')
   join public.community_work_revisions wr on wr.revision_id=w.current_published_revision_id and wr.work_id=w.work_id
   join public.preset_revision_publications pp on pp.work_revision_id=wr.revision_id
   join public.preset_revisions pr on pr.preset_revision_id=pp.preset_revision_id and pr.preset_artifact_id=pa.preset_artifact_id
   join public.artifact_blobs b on b.blob_id=pr.artifact_blob_id and b.owner_account_id=w.owner_account_id and b.purged_at is null
   left join public.community_works g on g.work_id=pa.associated_gallery_work_id
   where w.work_type='preset' and w.lifecycle_state='published' and w.visibility='public' and w.moderation_state='clear'
    and cp.profile_visibility='public' and cp.moderation_state='clear'
    and w.published_at is not null and char_length(coalesce(wr.shared_metadata->>'title','')) between 1 and 240
    and pa.preset_type not in ('tom_furniture','tom_clothing')
    and (pa.associated_gallery_work_id is null or (
      g.work_type='gallery' and g.lifecycle_state='published' and g.visibility='public' and g.moderation_state='clear'
      and g.owner_account_id=w.owner_account_id and g.creator_profile_id=w.creator_profile_id
      and exists(select 1 from public.community_entity_origins go where go.entity_id=g.work_id and go.origin_kind in ('user','staff_public'))
      and exists(select 1 from public.community_entities ge where ge.entity_id=g.work_id and ge.deleted_at is null)
      and exists(select 1 from public.gallery_revision_presets gp where gp.gallery_revision_id=g.current_published_revision_id and gp.preset_revision_id=pr.preset_revision_id)
    ))
    and b.schema_version=2 and b.byte_size between 1 and 16000000 and b.content_type in ('application/json','application/gzip')
    and b.checksum_sha256 ~ '^[0-9a-f]{64}$'
    and b.storage_key ~ ('^published/'||w.owner_account_id::text||'/[0-9a-f-]{36}\.wandpreset$')
    and pr.metadata->>'gameVersion'='1.26.2'
    and pr.metadata->>'kind' in ('scene','support','region','biome','island','world','room','floor','building','design','network')
    and pr.metadata->>'schema' in ('wand.preset.scene@1','wand.preset.mixed-scene@1','wand.preset.area-scene@1','wand.preset.support-scene@1','wand.preset.whole-area-design@1','wand.preset.biome-network@1','wand.preset.biome-decoration@1','wand.preset.floating-island-design@1','wand.preset.floating-island-decoration@1','wand.preset.world-decoration@1','wand.preset.region-decoration@1','wand.preset.indoor-decoration@1','wand.room-design@1','wand.world-design@1','wand.mainland-design@1','wand.world-scope-design@1')
    and jsonb_typeof(pr.metadata->'distinctObjectTypes')='number' and jsonb_typeof(pr.metadata->'totalObjects')='number'
    and (p_kind is null or pr.metadata->>'kind'=p_kind)
    and (p_query is null or strpos(lower(wr.shared_metadata->>'title'),lower(p_query))>0 or strpos(lower(cp.display_name),lower(p_query))>0)
    and (p_work_id is null or (w.work_id=p_work_id and pr.preset_revision_id=p_revision_id))
    and exists (
     select 1 from public.work_revision_media rm join public.media_assets m on m.media_id=rm.media_id
     where rm.work_revision_id=coalesce(g.current_published_revision_id,w.current_published_revision_id)
       and m.owner_account_id=w.owner_account_id and m.processing_state='ready' and m.moderation_state='clear' and m.purged_at is null
    )
   order by w.published_at desc,w.work_id limit p_limit offset p_offset
 ) x;
 return result;
end $$;
revoke all on function public.community_query_wand_presets_v2(text,text,integer,integer,uuid,uuid) from public,anon,authenticated;
grant execute on function public.community_query_wand_presets_v2(text,text,integer,integer,uuid,uuid) to service_role;
