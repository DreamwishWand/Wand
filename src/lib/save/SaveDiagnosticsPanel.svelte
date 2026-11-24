<script lang="ts">
  import {
    makeSaveDiagnosticView, makeSaveCatalogAuditView, sanitizeSaveDiagnosticView
  } from './diagnostic-view.mjs';
  import type { SaveSourceCatalogBridge } from './catalog-links.mjs';

  export let decoded: unknown = null;
  /** The Worker returns this anonymous summary; never raw save data. */
  export let report: ReturnType<typeof makeSaveDiagnosticView> | null = null;
  export let bridge: SaveSourceCatalogBridge | null = null;

  let previousDecoded: unknown = null;
  let previousReport: typeof report = null;
  let requestSerial = 0;
  let catalogView: ReturnType<typeof makeSaveCatalogAuditView> | null = null;
  let catalogError = '';
  let loadingCatalog = false;

  $: if (previousDecoded !== decoded || previousReport !== report) {
    previousDecoded = decoded;
    previousReport = report;
    requestSerial++;
    catalogView = null;
    catalogError = '';
    loadingCatalog = false;
  }

  $: summary = report !== null ? sanitizeSaveDiagnosticView(report) :
    (decoded === null ? null : makeSaveDiagnosticView(decoded));

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
  const achievementStatusLabels: Record<string,string> = {
    not_observed:'記録なし（削除または未保存の可能性）',
    observed_empty:'空の実績記録',
    container_type_difference:'配列形式との差異を観測',
    observed_kind_difference:'保存データの型の差異を観測',
    sampled_observation:'一部の記録のみ検査',
    observed_field_kinds:'公開定義の型を観測'
  };

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

    <h3>実績フィールドの観測（改変セーブ対応）</h3>
    <p class="muted">
      {achievementStatusLabels[summary.achievementObservation.status]} · 検査した記録 {summary.achievementObservation.inspectedRows} 件
      {summary.achievementObservation.sampled ? ' · 一部のみ検査' : ''}
    </p>
    <p class="muted">
      保存済みのフィールドの有無と型だけを検査します。ミッション関連オブジェクトや実績の欠落を
      破損・未達成と判定せず、自動補完も行いません。状態名・進捗値・達成条件・報酬の意味は未検証です。
    </p>
    <div class="table-scroll">
      <table>
        <thead><tr><th scope="col">実績フィールド</th><th scope="col">観測</th><th scope="col">未記録</th><th scope="col">型の差異</th><th scope="col">配列検査数</th></tr></thead>
        <tbody>
          {#each summary.achievementObservation.fields as field (field.id)}
            <tr>
              <th scope="row">{field.label}</th>
              <td>{field.observed}</td>
              <td>{field.absent}</td>
              <td>{field.typeIssues + field.nestedTypeIssues}</td>
              <td>{field.checkedElements}{field.sampled ? ' · 一部' : ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="catalog-area">
      <div>
        <h3>DB-01・DB-04カタログ照合</h3>
        <p class="muted">検証済みの非公開DB-01クライアントと部分DB-04カタログが接続された場合のみ照合できます。未登録IDはアイテム不存在を意味しません。</p>
      </div>
      <button type="button" disabled={!bridge || decoded === null || loadingCatalog} on:click={runCatalogAudit}>
        {loadingCatalog ? '照合中…' : 'カタログ参照を確認'}
      </button>
    </div>
    {#if !bridge || decoded === null}
      <p class="muted">カタログの読込元、または別途検証済みの復号済みデータは未接続です。内部参照の診断のみを表示しています。</p>
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
  .diagnostic-panel{border:1px solid var(--wand-subtle-line);border-radius:18px;background:var(--wand-surface);padding:clamp(18px,3vw,32px);color:var(--wand-text);}
  .summary-head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;flex-wrap:wrap;}
  h2{font-size:clamp(21px,3vw,30px);margin:0 0 8px;}
  h3{font-size:16px;margin:24px 0 12px;}
  p{line-height:1.75;}
  .eyebrow-small{font-size:11px;letter-spacing:.16em;color:var(--wand-muted);font-weight:700;margin:0 0 8px;}
  .muted{font-size:13px;color:var(--wand-muted);max-width:740px;}
  .metrics{display:flex;gap:10px;}
  .metrics div{display:grid;gap:4px;padding:10px 16px;background:var(--wand-surface-raised);border:1px solid var(--wand-subtle-line);border-radius:12px;}
  .metrics strong{font-size:24px;}
  .metrics span{font-size:11px;color:var(--wand-muted);}
  .diagnostic-status{display:flex;align-items:center;gap:12px;flex-wrap:wrap;border-bottom:1px solid var(--wand-subtle-line);padding:20px 0;}
  .diagnostic-status strong{color:var(--wand-muted);}
  .diagnostic-status span{font-size:12px;color:var(--wand-muted);}
  .table-scroll{width:100%;overflow-x:auto;}
  table{width:100%;min-width:620px;border-collapse:collapse;font-size:12px;text-align:left;}
  th,td{padding:12px 9px;border-bottom:1px solid var(--wand-subtle-line);}
  th{color:var(--wand-text);font-weight:600;}
  thead th{color:var(--wand-muted);}
  td{color:var(--wand-text);font-variant-numeric:tabular-nums;}
  .catalog-area{display:flex;justify-content:space-between;align-items:end;gap:18px;flex-wrap:wrap;}
  .catalog-area h3{margin-bottom:0;}
  button{border:1px solid var(--wand-line);background:var(--wand-control);color:var(--wand-text);border-radius:10px;padding:11px 16px;font-size:12px;font-weight:600;}
  button:not(:disabled):hover{background:var(--wand-control-hover);}
  .error{color:var(--wand-danger);font-size:12px;}
  .catalog-status{color:var(--wand-muted);font-size:12px;}
  .limitations{margin:25px 0 0;padding-top:15px;border-top:1px solid var(--wand-subtle-line);color:var(--wand-muted);font-size:11px;}
</style>
