<script lang="ts">import { base } from '$app/paths';</script>
<svelte:head><title>Dreamwish Wand</title><meta name="description" content="Dreamwish Wand - collection and decorating tools for Disney Dreamlight Valley" /></svelte:head>
<section class="welcome">
  <div class="eyebrow">DREAMWISH WAND</div>
  <h1>Dreamlight Valleyを、<br /><em>もっと自由に。</em></h1>
  <p>ゲームの情報、創作、コミュニティをつなぐWand。Collectionを公開しています。Guideはローカルデータを読み込む試験機能として利用できます。</p>
  <a class="primary-action" href="{base}/collection/">Collectionを開く <span aria-hidden="true">→</span></a>
  <div class="coming-services"><span>Decorate</span><span><a href="{base}/guide/">Guide（ローカルデータ）</a></span><span>Presets</span><span>Gallery</span><span>DreamSnaps</span><span>Community Help Center</span></div>
  <p class="secondary-note">Guideは手元のデータファイルが必要です。その他のサービスは未実装です。機能が完成するまで、利用できるようには表示しません。</p>
</section>
