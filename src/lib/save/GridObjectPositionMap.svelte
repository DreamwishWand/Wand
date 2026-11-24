<script lang="ts">
  import type {LocalGridInstance} from './save-amount-preview.worker';
  import {searchLocalGridPositions} from './grid-cross-grid-search';
  import type {LocalGridSearchHit} from './grid-cross-grid-search';
  import {draftGridGroupQuarterTurn} from './grid-group-quarter-turn';
  import type {GridQuarterTurnDirection} from './grid-group-quarter-turn';

  // Only UI-local group/row ordinals are accepted. Native Save grid IDs,
  // native World positions and DB-04 layout IDs must never enter this view.
  export let rows:readonly LocalGridInstance[]=[];
  export let selectedOrdinal:number|null=null;
  /** Incremented on explicit parent-row selection, even for the same row. */
  export let focusRevision=0;
  export let disabled=false;
  export let onPick:(localOrdinal:number)=>void;
  /** Public item names are display/search aids only, never Save identities. */
  export let itemName:(itemId:string)=>string=()=>'';
  /** Candidate only: these UI values do not authorize a Save mutation. */
  export let draftX:number|null=null;
  export let draftY:number|null=null;
  export let onDraftMove:(x:number,y:number)=>void=()=>{};
  /** Stage 2–16 existing objects through the parent's Rust/WASM batch path. */
  export let queuedOrdinals:readonly number[]=[];
  /** Existing UI-only staging receipts, not Rust-validated placement. */
  export let stagedMoves:readonly {
    localOrdinal:number;expectedX:number;expectedY:number;
    replacementX:number;replacementY:number;
  }[]=[];
  export let onStageGroupMove:
    (ordinals:readonly number[],dx:number,dy:number)=>boolean=()=>false;
  export let mixedQueuedOrdinals:readonly number[]=[];
  export let onStageGroupRotation:
    (ordinals:readonly number[],direction:GridQuarterTurnDirection,
      pivotOrdinal:number)=>boolean=()=>false;
  let rotationDirection:GridQuarterTurnDirection|null=null;
  let rotationPivotOrdinal:number|null=null;
  let placing=false;
  let groupMode=false;
  let groupPlacing=false;
  let groupOrdinals:number[]=[];
  let groupOffsetX='0';
  let groupOffsetY='0';
  let groupIssue='';
  let markerQuery='';
  let lastRows:readonly LocalGridInstance[]|null=null;

  type Point=LocalGridInstance&{x:number;y:number};
  type Marker={x:number;y:number;ordinals:number[]};
  let selectedGrid=0;
  let lastFocusRevision=-1;

  function hasCoordinates(row:LocalGridInstance):row is Point{
    return row.coordinatesObserved&&row.x!==null&&row.y!==null;
  }
  function aggregate(input:readonly Point[]):Marker[]{
    const positions=new Map<string,Marker>();
    for(const row of input){
      const key=row.x+':'+row.y;
      let marker=positions.get(key);
      if(!marker){
        marker={x:row.x,y:row.y,ordinals:[]};
        positions.set(key,marker);
      }
      marker.ordinals.push(row.localOrdinal);
    }
    return [...positions.values()];
  }
  function summarize(input:readonly LocalGridInstance[]){
    const map=new Map<number,{
      id:number;kind:LocalGridInstance['recordKind'];
      total:number;positioned:number
    }>();
    for(const row of input){
      let group=map.get(row.localGridOrdinal);
      if(!group){
        group={id:row.localGridOrdinal,kind:row.recordKind,
          total:0,positioned:0};
        map.set(row.localGridOrdinal,group);
      }
      group.total++;
      if(hasCoordinates(row))group.positioned++;
    }
    return [...map.values()];
  }
  function chooseSearchHit(hit:LocalGridSearchHit){
    if(hit.localGridOrdinal!==selectedGrid){
      // A group is a transaction on ONE saved local Grid only. Selecting a
      // search hit from another Grid must never mix unrelated coordinates.
      selectedGrid=hit.localGridOrdinal;
      placing=false;
      groupPlacing=false;
      rotationDirection=null;
      rotationPivotOrdinal=null;
      groupOrdinals=[];
      groupIssue='';
    }
    choose({x:hit.x,y:hit.y,ordinals:[...hit.ordinals]});
    markerQuery='';
  }
  function choose(marker:Marker){
    if(groupMode){
      // A changed selection needs an explicit new destination click.
      groupPlacing=false;
      rotationDirection=null;
      rotationPivotOrdinal=null;
      // Same-point objects must be selected as a unit on the map;
      // the original coordinates and unique ordinals are not altered.
      const allSelected=marker.ordinals.every(id=>groupOrdinals.includes(id));
      if(allSelected){
        groupOrdinals=groupOrdinals.filter(id=>!marker.ordinals.includes(id));
        groupIssue='';
      }else{
        const next=[...new Set([...groupOrdinals,...marker.ordinals])];
        if(next.length>16){
          groupIssue='一度に選択できる配置は16件までです。';
          return;
        }
        groupOrdinals=next;
        groupIssue='';
      }
      return;
    }
    // Identical saved numeric coordinates are real overlapping markers:
    // cycle their distinct existing objects, never invent a visual offset.
    const current=selectedOrdinal===null?-1:
      marker.ordinals.indexOf(selectedOrdinal);
    onPick(marker.ordinals[(current+1)%marker.ordinals.length]);
  }
  const I32_MIN=-2147483648;
  const I32_MAX=2147483647;
  function offsetNumber(text:string):number|null{
    if(!/^(?:0|-?[1-9][0-9]*)$/.test(text))return null;
    const value=Number(text);
    return Number.isSafeInteger(value)&&value>=I32_MIN&&value<=I32_MAX
      ?value:null;
  }
  function moveCandidates(
    source:readonly Point[],ordinals:readonly number[],
    offsetX:string,offsetY:string
  ):readonly {ordinal:number;x:number;y:number}[]|null{
    const dx=offsetNumber(offsetX),dy=offsetNumber(offsetY);
    if(dx===null||dy===null||(dx===0&&dy===0)||
      ordinals.length<2||ordinals.length>16)return null;
    const selected=new Set(ordinals);
    const matched=source.filter(row=>selected.has(row.localOrdinal));
    if(matched.length!==ordinals.length)return null;
    const result=matched.map(row=>({
      ordinal:row.localOrdinal,x:row.x+dx,y:row.y+dy
    }));
    return result.every(row=>Number.isSafeInteger(row.x)&&
      Number.isSafeInteger(row.y)&&row.x>=I32_MIN&&row.x<=I32_MAX&&
      row.y>=I32_MIN&&row.y<=I32_MAX)?result:null;
  }
  function stageGroup(){
    if(disabled||!groupMode||!groupReady||groupDeltaX===null||
      groupDeltaY===null)return;
    if(onStageGroupMove([...groupOrdinals],groupDeltaX,groupDeltaY)){
      groupOrdinals=[];
      groupMode=false;
      groupPlacing=false;
      groupIssue='';
    }else{
      groupIssue='選択済みの編集と重複している可能性があります。';
    }
  }
  function rotationCandidates(
    direction:GridQuarterTurnDirection|null,pivot:number|null
  ){
    if(!direction||pivot===null||groupOrdinals.length<2||
       groupOrdinals.length>16)return null;
    const selected=groupOrdinals.map(id=>
      points.find(row=>row.localOrdinal===id));
    if(selected.some(row=>row===undefined))return null;
    return draftGridGroupQuarterTurn(selected as Point[],direction,pivot);
  }
  function stageRotation(){
    if(!groupMode||disabled||!rotationDirection||!rotationReady||
       effectiveRotationPivot===null)return;
    if(onStageGroupRotation(
      [...groupOrdinals],rotationDirection,effectiveRotationPivot
    )){
      groupOrdinals=[];
      groupMode=false;
      groupPlacing=false;
      rotationDirection=null;
      rotationPivotOrdinal=null;
      groupIssue='';
    }else{
      groupIssue='回転対象の状態または編集キューを確認してください。';
    }
  }
  function paddedBounds(input:readonly {x:number;y:number}[],field:'x'|'y'):{
    min:number;max:number
  }{
    if(!input.length)return {min:-8,max:8};
    const values=input.map(p=>p[field]);
    const min=Math.min(...values),max=Math.max(...values);
    // Navigation bounds are based only on observed Save coordinates, with
    // room to propose a new point outside a one-object bounding box.
    // Never use the native DB-04 floor width/height as Save edit limits.
    const padding=Math.max(8,Math.min(1000000,Math.ceil((max-min)*0.05)));
    return {
      min:Math.max(I32_MIN,min-padding),
      max:Math.min(I32_MAX,max+padding)
    };
  }
  function percentage(value:number,min:number,max:number):number{
    return max===min?50:5+90*(value-min)/(max-min);
  }
  function proposal(event:MouseEvent){
    if(disabled||(!placing&&!groupPlacing))return;
    if(placing&&!selectedInGrid)return;
    if(groupPlacing&&(!groupMode||groupOrdinals.length<2))return;
    const rect=event.currentTarget instanceof HTMLElement
      ?event.currentTarget.getBoundingClientRect():null;
    if(!rect||rect.width<=0||rect.height<=0)return;
    const clamp=(v:number)=>Math.max(0.05,Math.min(0.95,v));
    const tx=(clamp((event.clientX-rect.left)/rect.width)-0.05)/0.9;
    const ty=(clamp((event.clientY-rect.top)/rect.height)-0.05)/0.9;
    const x=Math.round(xBounds.min+tx*(xBounds.max-xBounds.min));
    const y=Math.round(yBounds.min+ty*(yBounds.max-yBounds.min));
    if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||
       x<I32_MIN||x>I32_MAX||y<I32_MIN||y>I32_MAX)return;
    if(groupPlacing){
      // The first selected saved object is the anchor. No native Grid
      // coordinate conversion or collision assumption is made here.
      const anchor=points.find(row=>row.localOrdinal===groupOrdinals[0]);
      if(!anchor)return;
      const dx=x-anchor.x,dy=y-anchor.y;
      if(!moveCandidates(points,groupOrdinals,String(dx),String(dy))){
        groupIssue='選択した配置をその移動先へ移動できません。';
        return;
      }
      groupOffsetX=String(dx);
      groupOffsetY=String(dy);
      groupIssue='';
      return;
    }
    onDraftMove(x,y);
  }

  $: grids=summarize(rows);
  $: if(!grids.some(g=>g.id===selectedGrid))
    selectedGrid=grids[0]?.id??0;
  // Explicit parent list/queue selections navigate the map to their local
  // Grid. Manual Grid changes do not immediately snap back to an old row.
  $: if(focusRevision!==lastFocusRevision){
    lastFocusRevision=focusRevision;
    const selected=rows.find(row=>row.localOrdinal===selectedOrdinal);
    if(selected&&selected.localGridOrdinal!==selectedGrid){
      selectedGrid=selected.localGridOrdinal;
      placing=false;groupMode=false;groupPlacing=false;
      rotationDirection=null;rotationPivotOrdinal=null;
      groupOrdinals=[];groupIssue='';
    }
  }
  $: currentRows=rows.filter(row=>row.localGridOrdinal===selectedGrid);
  $: points=currentRows.filter(hasCoordinates);
  $: allMarkers=aggregate(points);
  $: pointByOrdinal=new Map(points.map(row=>[row.localOrdinal,row]));
  // Keep the first 256 markers for a bounded default DOM, but always render
  // an explicitly selected object even when it lies later in the Save.
  $: markers=[
    ...allMarkers.slice(0,256),
    ...allMarkers.slice(256).filter(marker=>
      marker.ordinals.includes(selectedOrdinal??-1)||
      (groupMode&&marker.ordinals.some(id=>groupOrdinals.includes(id))))
  ];
  $: anyPositioned=rows.some(hasCoordinates);
  $: searchedMarkers=searchLocalGridPositions(rows,markerQuery,itemName);
  // Discard stale ordinals, changed source coordinates and invalid staged
  // numbers. Staged positions are visual hints, never export authorization.
  $: stagedTargets=stagedMoves.filter(move=>{
    const original=points.find(row=>row.localOrdinal===move.localOrdinal);
    return original!==undefined&&original.x===move.expectedX&&
      original.y===move.expectedY&&
      Number.isSafeInteger(move.replacementX)&&
      Number.isSafeInteger(move.replacementY)&&
      move.replacementX>=I32_MIN&&move.replacementX<=I32_MAX&&
      move.replacementY>=I32_MIN&&move.replacementY<=I32_MAX&&
      (move.replacementX!==original.x||move.replacementY!==original.y);
  });
  $: selectedInGrid=currentRows.some(row=>
    row.localOrdinal===selectedOrdinal&&hasCoordinates(row));
  $: draftIsChanged=selectedInGrid&&draftX!==null&&draftY!==null&&
    currentRows.some(row=>row.localOrdinal===selectedOrdinal&&
      (row.x!==draftX||row.y!==draftY));
  // A new file replaces every ephemeral ordinal and all prior selections.
  $: if(rows!==lastRows){
    lastRows=rows;
    groupOrdinals=[];
    groupMode=false;
    groupPlacing=false;
    markerQuery='';
    rotationDirection=null;
    rotationPivotOrdinal=null;
    groupIssue='';
  }
  $: groupDeltaX=offsetNumber(groupOffsetX);
  $: groupDeltaY=offsetNumber(groupOffsetY);
  $: groupTargets=groupMode
    ?moveCandidates(points,groupOrdinals,groupOffsetX,groupOffsetY):null;
  $: groupReady=groupTargets!==null&&
    queuedOrdinals.length+groupOrdinals.length<=16&&
    !groupOrdinals.some(id=>queuedOrdinals.includes(id));
  $: effectiveRotationPivot=groupOrdinals.includes(rotationPivotOrdinal??-1)
    ?rotationPivotOrdinal:groupOrdinals[0]??null;
  $: rotationTargets=groupMode
    ?rotationCandidates(rotationDirection,effectiveRotationPivot):null;
  $: rotationReady=rotationTargets!==null&&
    mixedQueuedOrdinals.length+groupOrdinals.length<=16&&
    !groupOrdinals.some(id=>
      queuedOrdinals.includes(id)||mixedQueuedOrdinals.includes(id));
  // Fit to all observed positions AND valid proposed destinations, including
  // temporary translation/rotation previews and single-object input drafts.
  // This is still a saved-integer-coordinate sketch, not DB-04 terrain.
  $: rotationCoordinates=rotationTargets?.flatMap(target=>
    target.replacementX!==null&&target.replacementY!==null
      ?[{x:target.replacementX,y:target.replacementY}]:[])??[];
  $: validDraft=draftIsChanged&&Number.isSafeInteger(draftX)&&
    Number.isSafeInteger(draftY)&&
    draftX!==null&&draftY!==null&&
    draftX>=I32_MIN&&draftX<=I32_MAX&&
    draftY>=I32_MIN&&draftY<=I32_MAX;
  $: mapBoundsPoints=[
    ...points.map(row=>({x:row.x,y:row.y})),
    ...stagedTargets.map(move=>({x:move.replacementX,y:move.replacementY})),
    ...(groupTargets?.map(target=>({x:target.x,y:target.y}))??[]),
    ...rotationCoordinates,
    ...(validDraft&&draftX!==null&&draftY!==null?[{x:draftX,y:draftY}]:[])
  ];
  $: xBounds=paddedBounds(mapBoundsPoints,'x');
  $: yBounds=paddedBounds(mapBoundsPoints,'y');
  $: draftVisible=validDraft&&draftX!==null&&draftY!==null&&
    draftX>=xBounds.min&&draftX<=xBounds.max&&
    draftY>=yBounds.min&&draftY<=yBounds.max;
  $: visibleTargets=groupTargets?.filter(
    target=>target.x>=xBounds.min&&target.x<=xBounds.max&&
      target.y>=yBounds.min&&target.y<=yBounds.max)??[];
  $: visibleRotationTargets=rotationTargets?.filter(target=>
    target.replacementX!==null&&target.replacementY!==null&&
    target.replacementX>=xBounds.min&&target.replacementX<=xBounds.max&&
    target.replacementY>=yBounds.min&&target.replacementY<=yBounds.max)??[];
</script>

<div class="grid-map" role="region" aria-label="セーブ内Grid配置マップ">
  <div class="toolbar">
    <label for="save-grid-map-select">Gridを表示</label>
    <select id="save-grid-map-select" aria-label="表示するセーブGrid"
      bind:value={selectedGrid} disabled={disabled||grids.length===0}
      on:change={()=>{
        placing=false;groupMode=false;groupPlacing=false;
        rotationDirection=null;rotationPivotOrdinal=null;
        groupOrdinals=[];groupIssue='';
      }}>
      {#each grids as grid}
        <option value={grid.id}>
          {grid.kind==='full'?'通常Grid':'差分Grid'}（ローカル #{grid.id}）
          · {grid.total}件
        </option>
      {/each}
    </select>
    <span class="count" role="status">
      {points.length}件の座標を表示
      {#if stagedTargets.length>0} · 編集候補 {stagedTargets.length}件{/if}
    </span>
    <input type="search" class="marker-search"
      aria-label="マップ内の配置を検索"
      placeholder="全Gridから配置番号・アイテムを検索" bind:value={markerQuery}
      disabled={disabled||!anyPositioned} />
    <button type="button" class="placement-mode"
      aria-pressed={placing}
      disabled={disabled||!selectedInGrid}
      on:click={()=>{
        placing=!placing;groupMode=false;groupPlacing=false;
        rotationDirection=null;rotationPivotOrdinal=null;groupOrdinals=[];
      }}>
      {placing?'移動先の指定を終了':'移動先をマップで指定'}
    </button>
    <button type="button" class="placement-mode"
      aria-pressed={groupMode}
      disabled={disabled||points.length<2}
      on:click={()=>{
        groupMode=!groupMode;placing=false;groupPlacing=false;
        rotationDirection=null;rotationPivotOrdinal=null;
        groupOrdinals=[];groupIssue='';
      }}>
      {groupMode?'複数選択を終了':'複数配置を一括移動'}
    </button>
  </div>
  {#if markerQuery.trim()&&anyPositioned}
    <div class="marker-search-results" role="group" aria-label="マップ配置検索結果">
      {#each searchedMarkers as marker (`${marker.localGridOrdinal}:${marker.x}:${marker.y}`)}
        <button type="button" class="marker-search-result"
          disabled={disabled}
          aria-label={`検索結果: 配置 #${marker.ordinals.join(', #')} を${groupMode?'グループに追加または除外':'選択'}`}
          on:click={()=>chooseSearchHit(marker)}>
          <span>#{marker.ordinals.join(', #')} · {
            itemName(marker.matchedItemId)||marker.matchedItemId
          }</span>
          <small>{marker.recordKind==='full'?'通常Grid':'差分Grid'}
            · ローカル #{marker.localGridOrdinal}
            · X {marker.x} / Y {marker.y}</small>
        </button>
      {/each}
      {#if searchedMarkers.length===0}
        <small>該当する配置はありません。</small>
      {:else if searchedMarkers.length===20}
        <small>先頭20座標を表示。検索語を追加して絞り込めます。</small>
      {/if}
    </div>
  {/if}
  {#if points.length>0}
    <div class="coordinate-plane" role="group"
      aria-label="保存済みX/Y座標の相対表示">
      <button type="button" class="placement-surface"
        aria-label={groupPlacing?'グループの移動先をマップで指定':'マップ上で移動先を指定'}
        disabled={disabled||!((placing&&selectedInGrid)||
          (groupPlacing&&groupMode&&groupOrdinals.length>=2))}
        on:click={proposal}></button>
      <div class="x-axis">X {xBounds.min} ～ {xBounds.max}</div>
      <div class="y-axis">Y {yBounds.min} ～ {yBounds.max}</div>
      {#each visibleTargets as target (`group-${target.ordinal}`)}
        <div class="draft-marker group-ghost"
          aria-hidden="true"
          title={`移動先候補 #${target.ordinal} X ${target.x} Y ${target.y}`}
          style={`left:${percentage(target.x,xBounds.min,xBounds.max)}%;top:${percentage(target.y,yBounds.min,yBounds.max)}%`}>
          <span>+</span>
        </div>
      {/each}
      {#each visibleRotationTargets as target (`rotated-${target.localOrdinal}`)}
        <div class="draft-marker group-ghost" aria-hidden="true"
          title={`90度回転候補 #${target.localOrdinal} X ${target.replacementX} Y ${target.replacementY}`}
          style={`left:${percentage(target.replacementX!,xBounds.min,xBounds.max)}%;top:${percentage(target.replacementY!,yBounds.min,yBounds.max)}%`}>
          <span>+</span>
        </div>
      {/each}
      {#each stagedTargets as staged}
        <div class="draft-marker queued-ghost" aria-hidden="true"
          title={`編集候補 #${staged.localOrdinal} X ${staged.replacementX} Y ${staged.replacementY}`}
          style={`left:${percentage(staged.replacementX,xBounds.min,xBounds.max)}%;top:${percentage(staged.replacementY,yBounds.min,yBounds.max)}%`}>
          <span>+</span>
        </div>
      {/each}
      {#if draftVisible&&draftX!==null&&draftY!==null}
        <div class="draft-marker" role="status"
          aria-label={`移動先の候補 X ${draftX} Y ${draftY}`}
          style={`left:${percentage(draftX,xBounds.min,xBounds.max)}%;top:${percentage(draftY,yBounds.min,yBounds.max)}%`}>
          <span>+</span>
        </div>
      {/if}
      {#each markers as marker}
        <button type="button"
          class:selected={groupMode
            ?marker.ordinals.every(id=>groupOrdinals.includes(id))
            :marker.ordinals.includes(selectedOrdinal??-1)}
          class:pivot={groupMode&&groupOrdinals.length>=2&&
            marker.ordinals.includes(effectiveRotationPivot??-1)}
          class="marker" disabled={disabled}
          aria-pressed={groupMode
            ?marker.ordinals.every(id=>groupOrdinals.includes(id))
            :marker.ordinals.includes(selectedOrdinal??-1)}
          aria-label={groupMode
            ?(marker.ordinals.every(id=>groupOrdinals.includes(id))
              ?`配置 ${marker.ordinals.join(',')} をグループから除外`
              :`配置 ${marker.ordinals.join(',')} をグループへ追加`)
            :marker.ordinals.length===1
            ?`配置 #${marker.ordinals[0]} をマップから選択`
            :`座標 X ${marker.x} Y ${marker.y} の配置 ${marker.ordinals.length}件から選択`}
          title={`X ${marker.x} / Y ${marker.y} · ${marker.ordinals.length}件`}
          style={`left:${percentage(marker.x,xBounds.min,xBounds.max)}%;top:${percentage(marker.y,yBounds.min,yBounds.max)}%`}
          on:click={()=>choose(marker)}>
          {marker.ordinals.length>1?marker.ordinals.length:''}
        </button>
      {/each}
    </div>
    {#if groupMode}
      <div class="group-controls" role="group" aria-label="グループ座標移動">
        <span role="status">選択 {groupOrdinals.length} / 16件
          {#if queuedOrdinals.length>0} · 編集登録済み {queuedOrdinals.length}件{/if}
        </span>
        <label>移動X
          <input type="text" inputmode="numeric" bind:value={groupOffsetX}
            aria-label="グループ移動X" disabled={disabled} />
        </label>
        <label>移動Y
          <input type="text" inputmode="numeric" bind:value={groupOffsetY}
            aria-label="グループ移動Y" disabled={disabled} />
        </label>
        <button type="button" class="placement-mode"
          aria-pressed={groupPlacing}
          disabled={disabled||groupOrdinals.length<2}
          on:click={()=>{groupPlacing=!groupPlacing;groupIssue='';}}>
          {groupPlacing?'マップ指定を終了':'グループの移動先をマップで指定'}
        </button>
        <button type="button" class="placement-mode"
          disabled={disabled||!groupReady}
          on:click={stageGroup}>
          選択した{groupOrdinals.length}件を座標編集に追加
        </button>
        {#if groupOrdinals.length>=2}
          <label>回転中心
            <select aria-label="回転中心"
              value={effectiveRotationPivot??''}
              disabled={disabled}
              on:change={event=>{
                rotationPivotOrdinal=Number(event.currentTarget.value);
                groupIssue='';
              }}>
              {#each groupOrdinals as ordinal}
                <option value={ordinal}>配置 #{ordinal}</option>
              {/each}
            </select>
          </label>
        {/if}
        <button type="button" class="placement-mode"
          aria-pressed={rotationDirection==='counterclockwise'}
          disabled={disabled||groupOrdinals.length<2}
          on:click={()=>{
            rotationDirection='counterclockwise';groupPlacing=false;groupIssue='';
          }}>左へ90°（数値座標）</button>
        <button type="button" class="placement-mode"
          aria-pressed={rotationDirection==='clockwise'}
          disabled={disabled||groupOrdinals.length<2}
          on:click={()=>{
            rotationDirection='clockwise';groupPlacing=false;groupIssue='';
          }}>右へ90°（数値座標）</button>
        <button type="button" class="placement-mode"
          disabled={disabled||!rotationReady}
          on:click={stageRotation}>
          {groupOrdinals.length}件の回転を配置編集に追加
        </button>
        {#if groupOrdinals.length>0}
          <button type="button" class="placement-mode"
            disabled={disabled}
            on:click={()=>{
              groupOrdinals=[];groupPlacing=false;
              rotationDirection=null;rotationPivotOrdinal=null;groupIssue='';
            }}>
            選択を解除
          </button>
        {/if}
        {#if groupIssue}<small role="alert">{groupIssue}</small>{/if}
        {#if groupOrdinals.length>=2&&groupTargets===null}
          <small>移動量を確認してください。0移動、整数範囲外、または未確認座標は登録できません。</small>
        {/if}
      </div>
      <small class="map-hint">同一Gridのマーカーを選択します。座標が重複する配置は同時選択されます。マップ指定では最初に選択した配置をクリック位置へ移動する移動量を算出します。回転では指定した配置物の座標を中心に数値X/Yと上下左右の向きを90°変更します。座標範囲外・向き不明・既存編集と重複する候補は登録できません。編集キューへ追加してもセーブは変更されません。</small>
    {/if}
    {#if draftIsChanged&&draftX!==null&&draftY!==null}
      <small class="map-hint" role="status">
        移動先候補 X {draftX} / Y {draftY}。セーブはまだ変更されていません。

      </small>
    {/if}
    {#if stagedTargets.length>0}
      <small class="map-hint">緑色の＋は編集キュー内の移動先候補です。保存・ゲーム内反映はまだ行われていません。</small>
    {/if}
    {#if allMarkers.length>256}
      <small class="map-hint">表示点は先頭256座標です。上の検索欄から他のGrid・表示範囲外の配置も選択できます。</small>
    {/if}
  {:else}
    <p class="empty">このGridに表示可能なX/Y座標はありません。</p>
  {/if}
  <small class="map-hint">セーブ内の同一Gridにある数値座標の相対表示です。Xは右方向、Yは下方向に増加します。クリックによる移動先は編集案のみです。実際の地形、配置範囲、衝突判定やワールド座標ではありません。</small>
</div>

<style>
  .grid-map{display:grid;gap:10px;width:100%;padding:10px 0;}
  .toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
  .marker-search{min-width:170px;max-width:330px;flex:1;
    padding:10px 12px;border:1px solid var(--wand-line);border-radius:7px;
    background:var(--wand-control);color:var(--wand-text);}
  .marker-search-results{display:flex;gap:6px;flex-wrap:wrap;}
  .marker-search-result{display:flex;gap:7px;align-items:center;
    border:1px solid var(--wand-line);background:var(--wand-control);color:var(--wand-text);
    padding:7px 10px;border-radius:7px;cursor:pointer;}
  .marker-search-result small{opacity:.75;font-size:11px;}
  .marker-search-result:disabled{opacity:.55;cursor:not-allowed;}
  .marker-search-results>small{font-size:11px;color:var(--wand-muted);}
  .toolbar label{flex:none;font-size:13px;color:var(--wand-text);}
  select{min-width:180px;max-width:420px;flex:1;padding:10px 12px;
    background:var(--wand-control);color:var(--wand-text);border:0;border-radius:7px;}
  .count{font-size:12px;color:var(--wand-muted);white-space:nowrap;}
  .group-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;
    border:1px solid var(--wand-line);border-radius:9px;padding:9px;}
  .group-controls span,.group-controls small{font-size:12px;color:var(--wand-muted);}
  .group-controls label{display:flex;align-items:center;gap:6px;
    font-size:12px;color:var(--wand-text);}
  .group-controls input{width:90px;max-width:32vw;padding:8px 9px;
    color:var(--wand-text);background:var(--wand-control);border:0;border-radius:6px;}
  .placement-mode{border:1px solid var(--wand-line);border-radius:8px;
    background:var(--wand-surface-raised);color:var(--wand-text);padding:9px 12px;cursor:pointer;}
  .placement-mode[aria-pressed=true]{background:var(--wand-selected);}
  .placement-mode:disabled{opacity:.55;cursor:not-allowed;}
  .coordinate-plane{position:relative;min-height:320px;width:100%;
    overflow:hidden;border:1px solid #745b8b;border-radius:12px;
    background-color:#201728;
    background-image:linear-gradient(#ffffff0e 1px,transparent 1px),
      linear-gradient(90deg,#ffffff0e 1px,transparent 1px);
    background-size:24px 24px;}
  .placement-surface{position:absolute;inset:0;z-index:0;
    display:block;width:100%;height:100%;padding:0;margin:0;
    border:0;border-radius:0;background:transparent;cursor:crosshair;}
  .placement-surface:disabled{cursor:default;}
  .draft-marker{position:absolute;z-index:3;transform:translate(-50%,-50%);
    display:grid;place-items:center;width:22px;height:22px;border-radius:50%;
    border:2px dashed #ffe2a1;background:#f7d77c33;color:#ffecbe;
    pointer-events:none;}
  .draft-marker span{font-weight:800;font-size:18px;line-height:1;}
  .group-ghost{background:#89b7f633;border-color:#99c6fe;color:#c6e4ff;}
  .queued-ghost{background:#1b9e5d44;border-color:#9bffc5;color:#dbffea;}
  .x-axis,.y-axis{position:absolute;z-index:1;font-size:11px;
    background:#201728dd;color:#d4c2df;padding:4px 6px;
    pointer-events:none;}
  .x-axis{bottom:3px;right:5px;}.y-axis{top:3px;left:5px;}
  .marker{position:absolute;transform:translate(-50%,-50%);z-index:2;
    display:grid;place-items:center;min-width:15px;min-height:15px;
    width:22px;height:22px;padding:0;border:2px solid #e6d1fa;
    border-radius:50%;background:#a37ac8;color:#fff;font-size:10px;
    font-weight:700;cursor:pointer;}
  .marker:hover,.marker:focus-visible,.marker.selected{
    border-color:#fff;background:#f3c66b;color:#2a1b25;
    outline:2px solid #f3c66b;outline-offset:2px;z-index:3;}
  .marker.pivot{box-shadow:0 0 0 4px #5cdcc5;}
  .marker:disabled{opacity:.55;cursor:not-allowed;}
  .empty{margin:0;font-size:13px;color:var(--wand-muted);}
  .map-hint{font-size:11px;color:var(--wand-muted);line-height:1.4;}
  @media(max-width:580px){
    .coordinate-plane{min-height:260px;}
    select{min-width:150px;}
    .marker-search{min-width:135px;}
  }
</style>
