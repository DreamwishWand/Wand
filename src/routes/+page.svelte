<script lang="ts">import { base } from '$app/paths';</script>
<svelte:head><title>Dreamwish Wand</title><meta name="description" content="Dreamwish Wand - collection and decorating tools for Disney Dreamlight Valley" /></svelte:head>
<section class="welcome">
  <div class="eyebrow">DREAMWISH WAND</div>
  <h1>Dreamlight Valleyを、<br /><em>もっと自由に。</em></h1>
  <p>ゲームの情報、創作、コミュニティをつなぐWand。Collectionと公開クエストガイドを利用できます。World Source PreviewとGuide原本検証画面は開発用機能です。</p>
  <a class="primary-action" href="{base}/collection/">Collectionを開く <span aria-hidden="true">→</span></a>
  <div class="coming-services"><span>Decorate</span><span><a href="{base}/guide/quests/">Guide（公開クエスト）</a></span><span><a href="{base}/world/preview/">World原本プレビュー（ローカル）</a></span><span>Presets</span><span>Gallery</span><span>DreamSnaps</span><span>Community Help Center</span></div>
  <p class="secondary-note">Guideの公開クエスト情報はファイル不要で閲覧できます。World原本プレビューとGuide開発用検証は手元のデータファイルが必要です。その他のサービスは未実装です。機能が完成するまで、利用できるようには表示しません。</p>
</section>
