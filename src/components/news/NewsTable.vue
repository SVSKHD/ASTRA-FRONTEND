<script setup lang="ts">
// The headlines (section 39), in the same clothes as every other table here.
//
// Sticky header, one date per day, a rail in the left channel, hover on the
// row — the trade log's treatment, because it is the same reading task on a
// different record. The rail is the category rather than a sign: news has no
// sign, and the question a reader asks of this list is "which of these is about
// my thing".
//
// EVERY ROW IS A LINK OUT. What is stored is a headline and a URL, never the
// article — this is an index of other people's writing, and the piece belongs on
// the page of whoever wrote it.
import { computed } from 'vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import IconForex from '@/components/feedicons/IconForex.vue'
import IconAi from '@/components/feedicons/IconAi.vue'
import IconCode from '@/components/feedicons/IconCode.vue'
import { dayLabel, orDash } from '@/utils/format'
import { IST, hhmmOn, ymdOn } from '@/utils/tradeTime'
import type { NewsCategory, NewsItem } from '@/types'

const props = withDefaults(
  defineProps<{
    items: NewsItem[]
    /**
     * The list is being replaced under the reader (section 43, item 6).
     *
     * This is the shimmer's one and only job, and the news is the one place in
     * the app it actually happens: toggling a category re-queries without
     * clearing what is on screen, so there IS something being refreshed. The
     * trade log clears its rows before the round trip, which makes a month
     * change a first paint — a skeleton, not a sweep.
     */
    refreshing?: boolean
  }>(),
  { refreshing: false },
)

const CATEGORY_ICON = {
  forex: IconForex,
  ai: IconAi,
  code: IconCode,
} satisfies Record<NewsCategory, unknown>

/** One dated divider per day, on the first row of it. */
const firstOfDay = computed(() => {
  const seen = new Set<string>()
  const out = new Set<string>()
  for (const item of props.items) {
    const day = ymdOn(IST, item.publishedAt)
    if (seen.has(day)) continue
    seen.add(day)
    out.add(item.id)
  }
  return out
})

function day(item: NewsItem): string {
  return ymdOn(IST, item.publishedAt)
}
</script>

<template>
  <div v-if="items.length" class="ntable__wrap" :class="{ 'ui-shimmer': refreshing }">
    <table class="ntable">
      <caption class="ui-sr-only">
        Headlines, newest first, grouped by day
      </caption>
      <thead>
        <tr>
          <th scope="col" class="ntable__rail"><span class="ui-sr-only">Category</span></th>
          <th scope="col">Day</th>
          <th scope="col">IST</th>
          <th scope="col">Source</th>
          <th scope="col">Headline</th>
          <th scope="col">Tags</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="item in items"
          :key="item.id"
          :class="[`is-${item.category}`, { 'is-dayStart': firstOfDay.has(item.id) }]"
        >
          <td class="ntable__rail" aria-hidden="true"></td>
          <td class="is-mono ntable__day">
            <span v-if="firstOfDay.has(item.id)">{{ dayLabel(day(item)) }}</span>
            <span v-else class="ui-sr-only">{{ day(item) }}</span>
          </td>
          <td class="is-mono ntable__time">{{ hhmmOn(IST, item.publishedAt) }}</td>
          <td class="ntable__source">
            <span class="ntable__with">
              <component :is="CATEGORY_ICON[item.category]" :size="14" />
              {{ item.source }}
            </span>
          </td>
          <!-- The whole row's point. New tab and `noopener`, because this is
               somebody else's page and it does not get a handle on ours. -->
          <td class="ntable__title">
            <a :href="item.link" target="_blank" rel="noopener noreferrer">{{ item.title }}</a>
          </td>
          <td class="ntable__tags">{{ orDash(item.tags.join(' · ')) }}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <EmptyState
    v-else
    title="No headlines yet"
    description="The feeds are read every fifteen minutes by a scheduled function; the first pull fills this in."
  />
</template>

<style scoped>
/* The page carries the height (section 42). No `max-height` and no vertical
   overflow: a list in a 420px window inside a page that could not scroll was
   two broken things agreeing with each other. Sideways only, and only where a
   phone needs it — an overflow of any kind makes this the scrollport a sticky
   header sticks to, which is the header's whole job undone. */
.ntable__wrap {
  min-width: 0;
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
  box-shadow: var(--layer-raised-shadow);
}
.ntable {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
}
.ntable th,
.ntable td {
  padding: var(--sp-2) var(--sp-3);
  text-align: left;
  white-space: nowrap;
}
.ntable thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  /* Opaque, and the one surface in the system that must be (section 43,
     item 3): rows scroll UNDER this, so a translucent header is a header
     with figures moving through it at exactly the moment it is read. */
  background: var(--glass-solid, var(--layer-overlay-bg));
  border-bottom: 1px solid var(--layer-raised-border);
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary, var(--theme-dim));
}
/* A day scrolled to must not land under the sticky header. */
.ntable tbody tr.is-dayStart {
  scroll-margin-top: 64px;
}
.ntable tbody tr.is-dayStart td {
  border-top: 1px solid var(--layer-raised-border);
}
.ntable tbody tr:first-child td {
  border-top: none;
}
.ntable tbody tr:hover td {
  background: color-mix(in oklch, var(--text-primary, currentcolor) 5%, transparent);
}
.ntable th.ntable__rail,
.ntable td.ntable__rail {
  width: 3px;
  min-width: 3px;
  padding: 0;
}
/* The category, as a channel of colour rather than as colour on the text —
   three hues that are none of the P/L pair, so nothing here reads as a gain or
   a loss. */
.ntable tbody tr.is-forex td.ntable__rail {
  background: var(--accent, var(--theme-accent));
}
.ntable tbody tr.is-ai td.ntable__rail {
  background: var(--theme-info, var(--text-secondary));
}
.ntable tbody tr.is-code td.ntable__rail {
  background: var(--text-muted, var(--theme-dim));
}
.ntable tbody tr.is-dayStart td.ntable__rail {
  border-top: none;
}
.ntable__day,
.ntable__time,
.ntable__tags {
  color: var(--text-secondary, var(--theme-dim));
}
.ntable__tags {
  font-size: var(--text-xs);
}
.ntable__with {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
}
/* The one column allowed to be long. It wraps rather than truncating: a
   headline cut at 40 characters is a headline nobody can judge.

   The width lives on the ANCHOR, not on the cell. A `max-width` on a `td` is
   advisory under automatic table layout and a long headline simply ignores it —
   which is exactly what happened, and the headline ran under the tags column.
   A block child with a width is a real constraint on the cell's preferred
   width, so the cell can no longer grow past it. */
/* `.ntable td` is the more specific selector for `white-space`, so a bare
   `.ntable__title` loses to it and the headline never wrapped at all. The
   element is part of the selector for that reason. */
.ntable td.ntable__title {
  white-space: normal;
  /* A floor as well as a ceiling. Without one, a phone squeezed this column to
     about five characters and broke words down the middle, because it is the
     only cell allowed to wrap and so the only one that can be crushed. With it
     the table overflows and the wrapper scrolls sideways — the same behaviour
     the trade log already has at this width. */
  min-width: 32ch;
}
.ntable__title a {
  display: block;
  min-width: 0;
  max-width: 62ch;
  color: var(--text-primary, var(--theme-text));
  text-decoration: none;
  overflow-wrap: anywhere;
}
.ntable__title a:hover,
.ntable__title a:focus-visible {
  text-decoration: underline;
}
.ntable .is-mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

/* The phone's bargain: sideways scrolling instead of a page-sticky header. */
@media (max-width: 700px) {
  .ntable__wrap {
    overflow-x: auto;
  }
}
</style>
