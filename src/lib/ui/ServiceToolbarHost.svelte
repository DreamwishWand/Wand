<script lang="ts">
  import {serviceToolbar} from './service-toolbar';
</script>
{#if $serviceToolbar}
  <div class="header-service-toolbar">{@render $serviceToolbar()}</div>
{/if}
