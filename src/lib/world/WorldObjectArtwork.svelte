<script lang="ts">
 export let href:string;
 export let x=0;
 export let y=0;
 export let width:number;
 export let height:number;
 export let opacity=.92;
 let failed=false,previous='';
 $: if(href!==previous){previous=href;failed=false;}
</script>
{#if href&&!failed}
 <image class="world-object-artwork" {href} x={x+width*.06} y={y+height*.06} width={width*.88} height={height*.88} preserveAspectRatio="xMidYMid meet" {opacity} pointer-events="none" on:error={()=>failed=true}/>
{/if}
