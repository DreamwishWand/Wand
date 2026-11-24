import {writable} from 'svelte/store';
export type GuideHelpSubjectKind='quest'|'character'|'system'|'star-path'|'event'|'floating-festival';
export type GuideHelpSubject=Readonly<{kind:GuideHelpSubjectKind;id:string}>;
export type GuideHelpPostKind='issue'|'tip'|'question';
export type GuideHelpPost=Readonly<{
  id:string;subject:GuideHelpSubject;kind:GuideHelpPostKind;title:string;
  summary?:string;answerCount?:number;score?:number;status?:'open'|'resolved';
}>;
/** Community owns queries, visibility/moderation, ranking, authentication and routing.
 * list returns public, ranked posts for the exact subject. Guide never writes posts.
 * Register once when the real Help Center is available; null means not connected.
 */
export interface GuideHelpProvider {
  list(subject:GuideHelpSubject,signal:AbortSignal):Promise<readonly GuideHelpPost[]>;
  browseHref(subject:GuideHelpSubject,kind:GuideHelpPostKind):string;
  createHref(subject:GuideHelpSubject,kind:GuideHelpPostKind):string;
  threadHref(postId:string):string;
}
export const guideHelpProvider=writable<GuideHelpProvider|null>(null);
export const GUIDE_HELP_KINDS=['issue','tip','question'] as const;
export function guideHelpPostsFor(posts:readonly GuideHelpPost[],subject:GuideHelpSubject,kind:GuideHelpPostKind){
  return posts.filter(post=>post.subject.kind===subject.kind&&post.subject.id===subject.id&&post.kind===kind).slice(0,3);
}
