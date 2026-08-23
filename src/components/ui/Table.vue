<script setup lang="ts">
// A data table with a real <table> underneath, so a screen reader reads rows and
// columns rather than a wall of divs. Wide tables scroll inside their own box
// rather than pushing the page sideways.
export interface Column {
  key: string
  label: string
  align?: 'left' | 'right'
}

defineProps<{ columns: Column[]; rows: Record<string, unknown>[]; caption?: string }>()
</script>

<template>
  <div class="ui-table__wrap">
    <table class="ui-table">
      <caption v-if="caption" class="ui-sr-only">
        {{
          caption
        }}
      </caption>
      <thead>
        <tr>
          <th v-for="col in columns" :key="col.key" :style="{ textAlign: col.align || 'left' }">
            {{ col.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="String(row.id ?? i)">
          <td v-for="col in columns" :key="col.key" :style="{ textAlign: col.align || 'left' }">
            {{ row[col.key] }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.ui-table__wrap {
  overflow-x: auto;
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
}
.ui-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
  color: var(--theme-text);
}
.ui-table th,
.ui-table td {
  padding: var(--sp-2) var(--sp-3);
  border-bottom: 1px solid var(--glass-border);
  white-space: nowrap;
}
.ui-table th {
  font-size: var(--text-2xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--theme-dim);
}
.ui-table tbody tr:last-child td {
  border-bottom: none;
}
</style>
