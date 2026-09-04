<script setup lang="ts">
// One pull request's conversation (section 40).
//
// All three kinds in one column, in the order they were written. An issue
// comment, a review's summary and a line comment on a diff are one conversation
// — splitting them into three lists is what makes a review thread unreadable,
// and the whole reason to mirror them at all is to be able to read it.
//
// Each row is a PREVIEW and a link. ~280 characters of the comment, then GitHub.
// The same rule the news follows, for the same reason: this is an index of a
// conversation that lives somewhere else.
import EmptyState from '@/components/ui/EmptyState.vue'
import { dayLabel, orDash } from '@/utils/format'
import { IST, hhmmOn, ymdOn } from '@/utils/tradeTime'
import type { GhComment, GhCommentKind } from '@/types'

defineProps<{ comments: GhComment[]; loading: boolean }>()

const KIND_LABEL: Record<GhCommentKind, string> = {
  issue: 'comment',
  review: 'review',
  review_comment: 'on a line',
}
</script>

<template>
  <div class="cthread">
    <p v-if="loading" class="cthread__note">Reading the thread…</p>

    <EmptyState
      v-else-if="!comments.length"
      title="Nothing said yet"
      description="Comments arrive from the webhook within a second of being posted."
    />

    <ol v-else class="cthread__list">
      <li v-for="c in comments" :key="c.id" class="cthread__row" :class="`is-${c.kind}`">
        <span class="cthread__when ui-mono">
          {{ dayLabel(ymdOn(IST, c.createdAt)) }} {{ hhmmOn(IST, c.createdAt) }}
        </span>
        <span class="cthread__who">{{ orDash(c.author) }}</span>
        <span class="cthread__kind">{{ KIND_LABEL[c.kind] }}</span>
        <!-- A line comment says which line, because that is most of what it
             means; the others have nothing to say here and say nothing. -->
        <span v-if="c.path" class="cthread__where ui-mono">
          {{ c.path }}<template v-if="c.line">:{{ c.line }}</template>
        </span>
        <a class="cthread__body" :href="c.url" target="_blank" rel="noopener noreferrer">
          {{ c.bodyPreview || '—' }}
        </a>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.cthread {
  min-width: 0;
  padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-4);
}
.cthread__note {
  margin: 0;
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.cthread__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
  /* The thread's own left rule: one line down the conversation, so a reply
     reads as part of the same column rather than as a new list. */
  border-left: 1px solid var(--layer-raised-border);
  padding-left: var(--sp-3);
}
.cthread__row {
  display: grid;
  grid-template-columns: auto auto auto minmax(0, 1fr);
  align-items: baseline;
  gap: var(--sp-2);
  min-width: 0;
}
.cthread__when,
.cthread__kind,
.cthread__where {
  min-width: 0;
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  color: var(--text-muted, var(--theme-dim));
}
.cthread__who {
  min-width: 0;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--text-secondary, var(--theme-dim));
}
.cthread__where {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 24ch;
}
/* The preview wraps: a comment cut to one line is a comment nobody can judge,
   and it is already cut to 280 characters upstream. */
.cthread__body {
  grid-column: 1 / -1;
  min-width: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
  text-decoration: none;
  overflow-wrap: anywhere;
}
.cthread__body:hover,
.cthread__body:focus-visible {
  text-decoration: underline;
}
</style>
