<script lang="ts">
  import '../app.css';
  import { base } from '$app/paths';
</script>
<div class="site-shell">
  <header class="site-header">
    <a class="brand" href="{base}/" aria-label="Dreamwish Wand home">
      <span class="brand-mark">✦</span><span>Dreamwish <strong>Wand</strong></span>
    </a>
    <nav aria-label="Main navigation" style="display:flex; gap:20px;"><a href="{base}/collection/" class="nav-link">Collection</a><a href="{base}/guide/" class="nav-link">Guide（ローカル）</a><a href="{base}/world/preview/" class="nav-link">World（ローカル）</a></nav>
    <span class="site-label">Local-first · Development</span>
  </header>
  <main><slot /></main>
  <footer class="site-footer">Dreamwish Wand · Unofficial fan project · Not affiliated with Disney or Gameloft.</footer>
</div>
