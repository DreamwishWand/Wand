/** Viewer-facing presentation of verified UTC instants.
 * UTC stays the database authority; calendar-only announcements do not
 * enter this formatter (there is no verified clock time to convert).
 */
const UTC_INSTANT=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
export function viewerEventDateTime(
  utc:string,timeZone:string,locale='ja-JP'
):string{
  const date=new Date(utc);
  if(!UTC_INSTANT.test(utc)||!Number.isFinite(date.getTime())||
    date.toISOString().replace('.000Z','Z')!==utc)
    throw new TypeError('Guide: invalid original UTC boundary');
  return new Intl.DateTimeFormat(locale,{
    timeZone,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'
  }).format(date);
}
