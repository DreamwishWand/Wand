<script lang="ts">
  /** Small dependency-free SVG set shared by the Wand shell and service cards. */
  export let name:string='sparkles';
  export let size=20;
  export let strokeWidth=1.9;
  const globePath='M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20 M2 12h20 M12 2c-6 5-6 15 0 20 M12 2c6 5 6 15 0 20';
  const paths:Record<string,string>={
    home:'m3 10 9-7 9 7 M5 9v11h14V9 M9 20v-7h6v7',
    settings:'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M10 2h4l.8 2.3 2.2.9 2.1-1 2.8 2.8-1 2.1.9 2.2L24 11v2l-2.3.8-.9 2.2 1 2.1-2.8 2.8-2.1-1-2.2.9L14 23h-4l-.8-2.3-2.2-.9-2.1 1-2.8-2.8 1-2.1-.9-2.2L0 13v-2l2.3-.8.9-2.2-1-2.1L5 3.1l2.1 1 2.2-.9z',
    collection:'M3 6.5 12 3l9 3.5v11L12 21l-9-3.5z M3 6.5l9 4 9-4 M12 10.5V21',
    guide:'M12 5C9 3.6 6 3 3 4v15c3-1 6-.4 9 1 3-1.4 6-2 9-1V4c-3-1-6-.4-9 1z M12 5v15',
    star:'m12 2 2.8 6.1 6.7.8-5 4.7 1.3 6.5-5.8-3.2-5.8 3.2 1.3-6.5-5-4.7 6.7-.8z',
    world:globePath,
    globe:globePath,
    save:'M4 3h13l3 3v15H4z M7 3v7h10V3 M8 21v-8h8v8',
    upload:'M12 16V3 m-5 5 5-5 5 5 M4 16v4h16v-4',
    download:'M12 3v13 m-5-5 5 5 5-5 M4 17v4h16v-4',
    restore:'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5 M12 7v5l3 2',
    history:'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5 M12 7v5l3 2',
    undo:'M9 14l-5-5 5-5 M4 9h10a6 6 0 0 1 0 12h-2',
    redo:'m15 14 5-5-5-5 M20 9H10a6 6 0 0 0 0 12h2',
    help:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20 M9.5 9a2.7 2.7 0 1 1 4.8 1.8c-1.3 1.4-2.3 1.4-2.3 3.2 M12 18h.01',
    close:'M5 5l14 14 M19 5 5 19',
    arrow:'M4 12h16 m-6-6 6 6-6 6',
    link:'M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7 M14 11a5 5 0 0 0-7.1 0l-3 3A5 5 0 0 0 11 21l1.7-1.7',
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
    info:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20 M12 11v6 M12 7h.01',
    alert:'M12 3 2 21h20L12 3z M12 9v5 M12 18h.01',
    owned:'M3 6l9-4 9 4v13l-9 3-9-3z M3 6l9 4 9-4 M8 15l3 3 5-6',
    table:'M3 8h18v4H3z M5 12v9 M19 12v9',
    bed:'M3 5v15 M21 12v8 M3 16h18v-4H3z M6 12V8h6v4',
    storage:'M4 3h16v18H4z M4 10h16 M4 16h16 M10 7h4 M10 13h4 M10 19h4',
    lamp:'M7 3h10l4 10H3z M12 13v7 M7 21h10',
    door:'M5 21V3h14v18 M5 21h14 M15 12h.01',
    path:'M6 2h12L22 22H2z M4 12h16 M9 2l-1 10 1 10',
    fence:'M3 5l2-3 2 3v16H3z M10 5l2-3 2 3v16h-4z M17 5l2-3 2 3v16h-4z M7 9h3 M14 9h3 M7 16h3 M14 16h3',
    chair:'M6 11V4h12v7 M4 11h16v5H4z M6 16v5 M18 16v5',
    plant:'M12 22V10 M12 16C5 16 3 10 3 6c6 0 9 3 9 10 M12 13c0-7 4-10 9-10 0 6-3 10-9 10',
    shirt:'m8 3-5 4 3 5 3-2v11h6V10l3 2 3-5-5-4-4 3z',
    hammer:'M4 20l11-11 M12 4l4 4 M14 2l8 8-3 3-8-8z',
    fish:'M3 12c5-7 13-7 18 0-5 7-13 7-18 0z M3 12l-2-5 M3 12l-2 5 M16 11h.01',
    gem:'m7 3 10 0 5 7-10 12L2 10z M2 10h20 M7 3l-3 7 8 12 8-12-3-7',
    cooking:'M4 11h16v4a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7z M7 4v4 M12 2v6 M17 4v4',
    mountain:'m2 21 8-15 5 9 3-5 4 11z',
    butterfly:'M12 11C7 2 3 3 3 8c0 4 4 5 9 5 M12 11c5-9 9-8 9-3 0 4-4 5-9 5 M12 11v11 M12 18C6 14 3 17 5 21 M12 18c6-4 9-1 7 3',
    puzzle:'M4 4h6c-1 3 1 4 3 3V4h7v6c-3-1-4 1-3 3h3v7h-6c1-3-1-4-3-3v3H4v-7h3c1-2-1-4-3-3z',
    sun:'M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.5 5.5l2 2 M16.5 16.5l2 2 M18.5 5.5l-2 2 M7.5 16.5l-2 2 M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
    sunrise:'M2 19h20 M3 23h18 M12 4v3 M4.2 10.2l2.1 2.1 M19.8 10.2l-2.1 2.1 M3 15h2 M19 15h2 M7 19a5 5 0 0 1 10 0',
    'moon-star':'M20.4 15.4A9 9 0 0 1 8.6 3.6a9 9 0 1 0 11.8 11.8 M18.5 3l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8z',
    book:'M5 3h15v18H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z M5 18h15',
    plus:'M12 4v16 M4 12h16',
    ellipsis:'M5 12h.01 M12 12h.01 M19 12h.01',
    edit:'M4 20h5l12-12-5-5L4 15z M14 5l5 5',
    trash:'M3 6h18 M8 6V4h8v2 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
    languages:'M5 6h12 M11 3v3 M8 6c0 5 5 9 10 11 M15 6c0 5-5 9-10 11 M14 22l4-9 4 9 M15.5 19h5',
    moon:'M20 16.6A9 9 0 0 1 7.4 4 9 9 0 1 0 20 16.6z',
    grid:'M3 3h8v8H3z M13 3h8v8h-8z M3 13h8v8H3z M13 13h8v8h-8z',
    chevron:'m6 9 6 6 6-6'
  };
</script>
<svg width={size} height={size} viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="round"
  stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d={paths[name]??paths.sparkles}/>
</svg>
