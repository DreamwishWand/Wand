/** Gradually reveal locally parsed Save rows without hiding matches after row 120. */
export const SAVE_LIST_WINDOW_SIZE=120;

export interface SaveListScrollMetrics {
  readonly scrollTop:number;
  readonly clientHeight:number;
  readonly scrollHeight:number;
}

/** Pure UI calculation. No Save bytes, identities or edit permissions. */
export function nextSaveListWindowLimit(
  visibleLimit:number,
  matchedCount:number,
  scroll:SaveListScrollMetrics,
  windowSize:number=SAVE_LIST_WINDOW_SIZE
):number{
  if(![visibleLimit,matchedCount,windowSize].every(Number.isSafeInteger)||
     visibleLimit<0||matchedCount<0||windowSize<1||
     matchedCount<=visibleLimit)return visibleLimit;
  if(![scroll.scrollTop,scroll.clientHeight,scroll.scrollHeight]
       .every(Number.isFinite)||
     scroll.clientHeight<=0||
     scroll.scrollHeight<=scroll.clientHeight)return visibleLimit;
  return scroll.scrollTop+scroll.clientHeight>=scroll.scrollHeight-96
    ?Math.min(matchedCount,visibleLimit+windowSize)
    :visibleLimit;
}
