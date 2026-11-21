<script lang="ts">
  import {
    makeSaveDiagnosticView, makeSaveCatalogAuditView
  } from './diagnostic-view.mjs';
  import type { SaveSourceCatalogBridge } from './catalog-links.mjs';

  export let decoded: unknown = null;
  export let bridge: SaveSourceCatalogBridge | null = null;

  let previousDecoded: unknown = null;
  let requestSerial = 0;
  let catalogView: ReturnType<typeof makeSaveCatalogAuditView> | null = null;
  let catalogError = '';
  let loadingCatalog = false;

  $: if (previousDecoded !== decoded) {
    previousDecoded = decoded;
    requestSerial++;
    catalogView = null;
    catalogError = '';
    loadingCatalog = false;
  }

  $: summary = decoded === null ? null : makeSaveDiagnosticView(decoded);

  const statusLabels: Record<string,string> = {
    observed_consistent: '観測範囲で整合',
    observed_anomaly: '要確認',
    inconclusive: '未確定',
    invalid_root: 'JSON構造が無効',
    not_observed: '未観測',
    insufficient_evidence: '情報不足',
    sampled_inconclusive: '一部のみ検査',
    shape_candidate: '構造を観測',
    sampled_candidate: '構造を一部観測',
    shape_conflict: '型の不一致',
    catalog_id_candidates: 'カタログID候補',
    partial_catalog_unresolved: '部分カタログに未登録',
    observed_type_issue: '値の型を要確認',
    zero_sentinels_only: 'ゼロ値のみ'
  };
  const labelStatus = (code: string) => statusLabels[code] ?? '未確定';

  async function runCatalogAudit() {
    if (!bridge || decoded === null || loadingCatalog) return;
    const serial = ++requestSerial;
    loadingCatalog = true;
    catalogView = null;
    catalogError = '';
    try {
      const result = await bridge.auditSave(decoded);
      if (serial === requestSerial) catalogView = makeSaveCatalogAuditView(result);
    } catch {
      // Never echo loader exceptions: they may contain local paths or saved data.
      if (serial === requestSerial) catalogError =
        '外部カタログの照合に失敗しました。読込元の整合性を確認してください。';
    } finally {
      if (serial === requestSerial) loadingCatalog = false;
    }
  }
</script>

{#if summary}
  <section class="diagnostic-panel" aria-label="DB-05セーブ構造診断">
    <div class="summary-head">
      <div>
        <p class="eyebrow-small">DB-05 · LOCAL INSPECTION</p>
        <h2>セーブ構造と参照の診断</h2>
        <p class="muted">復号済みの構造を読み取り、固定された公開フィールド定義で集計します。原本は変更しません。</p>
      </div>
      <div class="metrics">
        <div><strong>{summary.knownPublicTemplates}</strong><span>登録フィールド</span></div>
        <div><strong>{summary.referenceRules.length}</strong><span>内部参照ルール</span></div>
      </div>
    </div>

    <div class="diagnostic-status" role="status">
      <strong>参照診断：{labelStatus(summary.referenceStatus)}</strong>
      <span>これは完全な互換性やセーブ編集の安全性を証明するものではありません。</span>
    </div>

    <h3>内部IDの参照関係</h3>
    <div class="table-scroll">
      <table>
        <thead><tr><th scope="col">対象</th><th scope="col">状態</th><th scope="col">観測</th><th scope="col">解決</th><th scope="col">未解決</th><th scope="col">情報不足</th></tr></thead>
        <tbody>
          {#each summary.referenceRules as row (row.id)}
            <tr>
              <th scope="row">{row.label}</th>
              <td>{labelStatus(row.status)}{row.sampled ? ' · 一部' : ''}</td>
              <td>{row.observed}</td><td>{row.resolved}</td>
              <td>{row.unresolved + row.malformed + row.typeIssues}</td><td>{row.missing}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <h3>登録構造の観測範囲</h3>
    <div class="table-scroll">
      <table>
        <thead><tr><th scope="col">領域</th><th scope="col">状態</th><th scope="col">登録</th><th scope="col">観測</th><th scope="col">型の不一致</th></tr></thead>
        <tbody>
          {#each summary.shapeDomains as row (row.domain)}
            <tr><th scope="row">{row.domain}</th><td>{labelStatus(row.status)}</td><td>{row.registered}</td><td>{row.observed}</td><td>{row.conflicting}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="catalog-area">
      <div>
        <h3>DB-01・DB-04カタログ照合</h3>
        <p class="muted">検証済みの非公開DB-01クライアントと部分DB-04カタログが接続された場合のみ照合できます。未登録IDはアイテム不存在を意味しません。</p>
      </div>
      <button type="button" disabled={!bridge || loadingCatalog} on:click={runCatalogAudit}>
        {loadingCatalog ? '照合中…' : 'カタログ参照を確認'}
      </button>
    </div>
    {#if !bridge}
      <p class="muted">カタログの読込元は未接続です。内部参照の診断のみを表示しています。</p>
    {/if}
    {#if catalogError}<p role="alert" class="error">{catalogError}</p>{/if}
    {#if catalogView}
      <p class="catalog-status" role="status">照合：{labelStatus(catalogView.status)}。原本データの完全性・所有権・編集許可は未検証です。</p>
      <div class="table-scroll">
        <table>
          <thead><tr><th scope="col">参照領域</th><th scope="col">状態</th><th scope="col">観測</th><th scope="col">照合</th><th scope="col">部分DB未登録</th></tr></thead>
          <tbody>
            {#each catalogView.families as row (row.id)}
              <tr><th scope="row">{row.label}</th><td>{labelStatus(row.status)}</td><td>{row.observed}</td><td>{row.matched}</td><td>{row.unresolved}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
    <p class="limitations">読み取り専用 · ID実値非表示 · アカウント/所有権未判定 · Codec往復未検証 · Writer/エクスポート禁止</p>
  </section>
{/if}

<style>
  .diagnostic-panel{border:1px solid #ffffff28;border-radius:18px;background:#1d1728;padding:clamp(18px,3vw,32px);color:#f3ecfa;}
  .summary-head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;flex-wrap:wrap;}
  h2{font-size:clamp(21px,3vw,30px);margin:0 0 8px;}
  h3{font-size:16px;margin:24px 0 12px;}
  p{line-height:1.75;}
  .eyebrow-small{font-size:11px;letter-spacing:.16em;color:#c4a0e9;font-weight:700;margin:0 0 8px;}
  .muted{font-size:13px;color:#baadca;max-width:740px;}
  .metrics{display:flex;gap:10px;}
  .metrics div{display:grid;gap:4px;padding:10px 16px;background:#2b203b;border:1px solid #ffffff1c;border-radius:12px;}
  .metrics strong{font-size:24px;}
  .metrics span{font-size:11px;color:#baa9cf;}
  .diagnostic-status{display:flex;align-items:center;gap:12px;flex-wrap:wrap;border-bottom:1px solid #ffffff16;padding:20px 0;}
  .diagnostic-status strong{color:#d9b8ff;}
  .diagnostic-status span{font-size:12px;color:#b8a9c9;}
  .table-scroll{width:100%;overflow-x:auto;}
  table{width:100%;min-width:620px;border-collapse:collapse;font-size:12px;text-align:left;}
  th,td{padding:12px 9px;border-bottom:1px solid #ffffff17;}
  th{color:#daccf2;font-weight:600;}
  thead th{color:#a99abd;}
  td{color:#c9bcd8;font-variant-numeric:tabular-nums;}
  .catalog-area{display:flex;justify-content:space-between;align-items:end;gap:18px;flex-wrap:wrap;}
  .catalog-area h3{margin-bottom:0;}
  button{border:1px solid #b18cd1;background:#38264b;color:#fff;border-radius:10px;padding:11px 16px;font-size:12px;font-weight:600;}
  button:not(:disabled):hover{background:#4b335f;}
  .error{color:#ffbfc9;font-size:12px;}
  .catalog-status{color:#c8b4dd;font-size:12px;}
  .limitations{margin:25px 0 0;padding-top:15px;border-top:1px solid #ffffff18;color:#afa2c1;font-size:11px;}
</style>
