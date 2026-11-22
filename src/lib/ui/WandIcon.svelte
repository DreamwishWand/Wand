<script lang="ts">
  /** Small dependency-free SVG set shared by the Wand shell and service cards. */
  export let name:string='sparkles';
  export let size=20;
  export let strokeWidth=1.9;
  const paths:Record<string,string>={
    home:'m3 10 9-7 9 7 M5 9v11h14V9 M9 20v-7h6v7',
    collection:'M3 6.5 12 3l9 3.5v11L12 21l-9-3.5z M3 6.5l9 4 9-4 M12 10.5V21',
    guide:'M12 5C9 3.6 6 3 3 4v15c3-1 6-.4 9 1 3-1.4 6-2 9-1V4c-3-1-6-.4-9 1z M12 5v15',
    star:'m12 2 2.8 6.1 6.7.8-5 4.7 1.3 6.5-5.8-3.2-5.8 3.2 1.3-6.5-5-4.7 6.7-.8z',
    world:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20 M2 12h20 M12 2c-6 5-6 15 0 20 M12 2c6 5 6 15 0 20',
    save:'M4 3h13l3 3v15H4z M7 3v7h10V3 M8 21v-8h8v8',
    upload:'M12 16V3 m-5 5 5-5 5 5 M4 16v4h16v-4',
    download:'M12 3v13 m-5-5 5 5 5-5 M4 17v4h16v-4',
    restore:'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5 M12 7v5l3 2',
    help:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20 M9.5 9a2.7 2.7 0 1 1 4.8 1.8c-1.3 1.4-2.3 1.4-2.3 3.2 M12 18h.01',
    close:'M5 5l14 14 M19 5 5 19',
    arrow:'M4 12h16 m-6-6 6 6-6 6',
    lock:'M6 10V7a6 6 0 0 1 12 0v3 M5 10h14v11H5z',
    search:'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16 M17 17l5 5',
    filter:'M3 5h18 M7 12h10 M10 19h4',
    check:'M4 12l5 5L20 6',
    folder:'M3 6h7l2 3h9v12H3z',
    palette:'M12 2a10 10 0 1 0 0 20h2a2 2 0 0 0 1-3.7 2 2 0 0 1 1-3.8h2.5A5.5 5.5 0 0 0 23 9a10 10 0 0 0-11-7 M7 12h.01 M9 7h.01 M16 7h.01',
    gallery:'M3 3h18v18H3z M3 16l6-6 5 5 3-3 4 4 M16 8h.01',
    camera:'M3 7h4l2-3h6l2 3h4v13H3z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
    community:'M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M16 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 20v-2a6 6 0 0 1 12 0v2 M12 20v-2a6 6 0 0 1 10-4.4',
    sparkles:'m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z',
    character:'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10 M3 22v-2a9 9 0 0 1 18 0v2',
    info:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20 M12 11v6 M12 7h.01'
  };
</script>
<svg width={size} height={size} viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="round"
  stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d={paths[name]??paths.sparkles}/>
</svg>
