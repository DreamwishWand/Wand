//! v1.25 validated generated-native-greedy layout; current build
//! catalog/terrain and save validation are distinct from this compiler.
//! Only the two runtime-tested families are accepted here.
use std::collections::{BTreeMap,BTreeSet};
use super::PatchError;
pub type Point=(i32,i32);
pub const MAX_FENCE_NODES:usize=128;
#[derive(Debug,Clone,Copy,PartialEq,Eq,PartialOrd,Ord)]
pub struct FencePart{pub item:u32,pub x:i32,pub y:i32,pub left:bool,pub diagonal:bool}
pub fn supported_family(base:u32)->bool{matches!(base,40700246|40700268)}
fn edge(a:Point,b:Point)->(Point,Point){if a<b{(a,b)}else{(b,a)}}
fn dir(a:Point,b:Point)->Point{(b.0-a.0,b.1-a.1)}
/// Exact graph, not inferred proximity. Every edge is a single native quantum.
pub fn compile_fence(base:u32,factor:u32,diagonal:bool,nodes:&[Point],edges:&[(Point,Point)])->Result<Vec<FencePart>,PatchError>{
 let bad=PatchError::InvalidTarget;
 if !supported_family(base)||!matches!(factor,1|2)||nodes.is_empty()||nodes.len()>MAX_FENCE_NODES||edges.len()>MAX_FENCE_NODES*4{return Err(bad);}
 let q=factor as i32;
 let points:BTreeSet<_>=nodes.iter().copied().collect();
 if points.len()!=nodes.len()||points.iter().any(|&(x,y)|x<0||y<0||x>131072||y>131072||x%q!=0||y%q!=0){return Err(bad);}
 let mut neighbors:BTreeMap<Point,BTreeSet<Point>>=points.iter().map(|&p|(p,BTreeSet::new())).collect();
 let mut unique=BTreeSet::new();
 for &(a,b) in edges{
  if !points.contains(&a)||!points.contains(&b)||!unique.insert(edge(a,b)){return Err(bad);}
  let (dx,dy)=dir(a,b);
  if if diagonal{dx.abs()!=q||dy.abs()!=q}else{dx.abs()+dy.abs()!=q}{return Err(bad);}
  neighbors.get_mut(&a).ok_or(bad)?.insert(b);neighbors.get_mut(&b).ok_or(bad)?.insert(a);
 }
 // A semantic anchor is an endpoint, corner, junction, or isolated unit.
 let anchors:BTreeSet<_>=neighbors.iter().filter_map(|(&p,ns)|{
  if ns.len()!=2{return Some(p);}
  let mut it=ns.iter();let a=dir(p,*it.next().unwrap());let b=dir(p,*it.next().unwrap());
  (a!=(-b.0,-b.1)).then_some(p)
 }).collect();
 let mut bases=anchors.clone();let mut seen=BTreeSet::new();let mut ext=Vec::new();
 let max_interval=if diagonal{5}else{7};
 for &start in &anchors{
  for &first in &neighbors[&start]{
   if seen.contains(&edge(start,first)){continue;}
   let mut path=vec![start,first];seen.insert(edge(start,first));
   let (mut prev,mut now)=(start,first);
   while !anchors.contains(&now){
    let next=*neighbors[&now].iter().find(|&&p|p!=prev).ok_or(bad)?;
    if !seen.insert(edge(now,next)){return Err(bad);}
    path.push(next);prev=now;now=next;
   }
   // Old compiler orders spans by logical coordinate; use stable positive-X,
   // then positive-Y direction for the generated greedy post spacing.
   if path[0]>*path.last().unwrap(){path.reverse();}
   let mut at=0;
   while at<path.len()-1{
    let end=(at+max_interval).min(path.len()-1);let a=path[at];let b=path[end];
    bases.insert(a);bases.insert(b);
    let key=end-at-1;
    if key>0{
     let (dx,dy)=dir(a,b);
     let (x,y)=(a.0+if dx!=0{q}else{0},a.1+if dy==0{0}else if dx==0||dy>0{q}else{-(key as i32)*q});
     if x<0||y<0{return Err(bad);}
     ext.push(FencePart{item:base+if diagonal{6+key as u32}else{key as u32},x,y,left:dx==0||diagonal&&dy<0,diagonal});
    }
    at=end;
   }
  }
 }
 if seen!=unique{return Err(bad);}
 let mut out:Vec<_>=bases.into_iter().map(|(x,y)|FencePart{item:base,x,y,left:false,diagonal}).collect();out.extend(ext);
 // Native fence anchors cannot coincide even between base/extension roles.
 if out.iter().map(|p|(p.x,p.y)).collect::<BTreeSet<_>>().len()!=out.len(){return Err(bad);}
 out.sort_unstable_by_key(|p|(p.y,p.x,p.item));Ok(out)
}
/// Build a cardinal straight/rectangle graph from cell anchors. Explicit
/// edges are the intersections of the drawn paths; no diagonal guesses.
pub fn cardinal_fence_graph(nodes:&[Point],factor:u32)->Result<Vec<(Point,Point)>,PatchError>{
 if !matches!(factor,1|2)||nodes.len()>MAX_FENCE_NODES{return Err(PatchError::InvalidTarget);}
 let q=factor as i32;
 let points:BTreeSet<_>=nodes.iter().copied().collect();
 if points.len()!=nodes.len()||points.iter().any(|&(x,y)|x<0||y<0||x>131072||y>131072){return Err(PatchError::InvalidTarget);}
 let mut edges=Vec::new();for &(x,y) in &points{for p in [(x+q,y),(x,y+q)]{if points.contains(&p){edges.push(((x,y),p));}}}
 Ok(edges)
}
#[cfg(test)]
mod tests{
 use super::*;
 const B:u32=40700246;
 fn straight(n:i32,vertical:bool,diag:bool)->(Vec<Point>,Vec<(Point,Point)>){
  let nodes:Vec<_>=(0..n).map(|i|if diag{(20+2*i,20+2*i)}else if vertical{(20,20+2*i)}else{(20+2*i,20)}).collect();
  let edges=nodes.windows(2).map(|p|(p[0],p[1])).collect();(nodes,edges)
 }
 #[test]fn exact_straight_v125_cases(){
  for (n,expected) in [(3,3),(8,3),(9,4)]{let (p,e)=straight(n,true,false);let parts=compile_fence(B,2,false,&p,&e).unwrap();assert_eq!(parts.len(),expected);let ext=parts.iter().find(|p|p.item!=B).unwrap();assert_eq!(ext.item,B+if n==3{1}else{6});assert_eq!((ext.x,ext.y,ext.left),(20,22,true));}
  let (p,e)=straight(6,false,true);let parts=compile_fence(B,2,true,&p,&e).unwrap();assert_eq!(parts.len(),3);assert!(parts.iter().any(|p|p.item==B+10&&p.x==22&&p.y==22&&!p.left&&p.diagonal));
  let p=vec![(20,24),(22,22),(24,20)];let e=vec![(p[0],p[1]),(p[1],p[2])];let parts=compile_fence(B,2,true,&p,&e).unwrap();assert!(parts.iter().any(|p|p.item==B+7&&p.x==22&&p.y==22&&p.left));
 }
 #[test]fn corners_junctions_loop_and_erase_split(){
  let p=vec![(0,0),(1,0),(2,0),(2,1),(2,2),(1,2),(0,2),(0,1)];let e=cardinal_fence_graph(&p,1).unwrap();
  let parts=compile_fence(B,1,false,&p,&e).unwrap();assert_eq!(parts.len(),8);assert_eq!(parts.iter().filter(|p|p.item==B).count(),4);
  let p=vec![(0,1),(1,1),(2,1),(3,1),(4,1),(2,0),(2,2)];let e=cardinal_fence_graph(&p,1).unwrap();let parts=compile_fence(B,1,false,&p,&e).unwrap();assert!(parts.iter().any(|p|p.item==B&&p.x==2&&p.y==1));
  let (mut p,_)=straight(9,true,false);p.remove(4);let e=cardinal_fence_graph(&p,2).unwrap();let parts=compile_fence(B,2,false,&p,&e).unwrap();assert_eq!(parts.len(),6);assert_eq!(parts.iter().filter(|p|p.item==B+2).count(),2);
 }
 #[test]fn invalid_edges_fail_closed(){
  assert!(compile_fence(B,1,false,&[(0,0),(2,0)],&[((0,0),(2,0))]).is_err());
  assert!(compile_fence(B,1,false,&[(0,0),(1,1)],&[((0,0),(1,1))]).is_err());
  assert!(compile_fence(40700000,1,false,&[(0,0)],&[]).is_err());
 }
}
