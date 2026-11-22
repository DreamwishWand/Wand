<script lang="ts">
  import '../app.css';
  import { base } from '$app/paths';
</script>
<div class="site-shell">
  <header class="site-header">
    <a class="brand" href="{base}/" aria-label="Dreamwish Wand home">
      <span class="brand-mark">✦</span><span>Dreamwish <strong>Wand</strong></span>
    </a>
    <nav aria-label="Main navigation" class="site-nav"><a href="{base}/collection/" class="nav-link">Collection</a><a href="{base}/guide/quests/" class="nav-link">Guide</a><a href="{base}/guide/star-path/" class="nav-link">Star Path</a><a href="{base}/world/preview/" class="nav-link">World（ローカル）</a></nav>
    <span class="site-label">Unofficial fan project</span>
  </header>
  <main><slot /></main>
  <footer class="site-footer">Dreamwish Wand · Unofficial fan project · Not affiliated with Disney or Gameloft.</footer>
</div>
