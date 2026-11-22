/** Read an increasing visible window in source-enforced pages.
 * Public Guide enforces <=100 per query; this aggregates without weakening
 * that API gate, changing sort order, or creating unbounded DOM by default.
 */
export function collectWindow(fetchPage,wanted,field='rows',maxPage=100){
  if(typeof fetchPage!=='function'||!['rows','results'].includes(field)||
    !Number.isSafeInteger(wanted)||wanted<1||wanted>20000||
    !Number.isSafeInteger(maxPage)||maxPage<1||maxPage>100)
    throw new TypeError('WAND_WINDOW_INVALID');
  let offset=0,total=0;
  const all=[];
  while(offset<wanted){
    const page=fetchPage(offset,Math.min(maxPage,wanted-offset));
    const chunk=page?.[field];
    if(!Number.isSafeInteger(page?.total)||page.total<0||
      !Array.isArray(chunk)||chunk.length>Math.min(maxPage,wanted-offset)||
      (offset>0&&page.total!==total)||
      (!chunk.length&&offset<page.total))throw new TypeError('WAND_WINDOW_PAGE_INVALID');
    total=page.total;
    if(!chunk.length)break;
    all.push(...chunk);
    offset+=chunk.length;
    if(offset>=total)break;
  }
  return {total,[field]:all,nextOffset:offset<total?offset:null};
}
