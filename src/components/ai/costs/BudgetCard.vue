<script setup lang="ts">
// The AI budget: today's spend against the daily cap (enforced — at the cap, replies
// stay local) and this month's against the monthly budget (enforced the same way when
// set). Admins change both here; the server applies them without a restart.
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { costApi, num, usd, usedPct, type AiBudget } from '@/ai/costs'

const props = defineProps<{ budget: AiBudget; admin: boolean }>()
const emit = defineEmits<{ saved: [] }>()
const router = useRouter()

const daily = ref('')
const monthly = ref('')
watch(
  () => props.budget,
  (b) => {
    daily.value = b.daily_limit_usd
    monthly.value = b.monthly_limit_usd
  },
  { immediate: true },
)

const dayPct = computed(() => usedPct(props.budget.today_spent_usd, props.budget.daily_limit_usd))
const monthPct = computed(() =>
  usedPct(props.budget.month_spent_usd, props.budget.monthly_limit_usd),
)

const busy = ref(false)
const message = ref('')
const needsPassword = ref(false)
const valid = (v: string) => /^\d+(\.\d{1,6})?$/.test(v.trim())
const dirty = computed(
  () =>
    num(daily.value) !== num(props.budget.daily_limit_usd) ||
    num(monthly.value) !== num(props.budget.monthly_limit_usd),
)

async function save() {
  if (!valid(daily.value) || !valid(monthly.value)) {
    message.value = 'Enter amounts in dollars, like 2 or 0.50.'
    return
  }
  busy.value = true
  message.value = ''
  needsPassword.value = false
  try {
    for (const [key, value, was] of [
      ['OPENROUTER_DAILY_LIMIT_USD', daily.value.trim(), props.budget.daily_limit_usd],
      ['AI_MONTHLY_BUDGET_USD', monthly.value.trim(), props.budget.monthly_limit_usd],
    ] as const) {
      if (num(value) === num(was)) continue
      const r = await costApi.setSetting(key, value)
      if (!r.ok) {
        needsPassword.value = r.needsPassword
        message.value = r.needsPassword
          ? 'This change needs your password: make it in Settings.'
          : r.error || 'The change was refused.'
        return
      }
    }
    message.value = 'Saved. Applied without a restart.'
    emit('saved')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Card title="Budget" data-testid="budget">
    <p v-if="!budget.available" class="tp-note" role="status">
      Spend could not be read from Redis, so every reply stays local until it can.
    </p>
    <div class="bc__rows">
      <div class="bc__row">
        <div class="bc__head">
          <span class="tp-strong">Today</span>
          <Badge v-if="budget.daily_cap_reached" tone="danger" label="Cap reached" />
        </div>
        <span class="tp-num">
          {{ usd(budget.today_spent_usd) }} of
          {{ num(budget.daily_limit_usd) > 0 ? usd(budget.daily_limit_usd) : 'no daily budget' }}
        </span>
        <div
          v-if="dayPct !== null"
          class="bc__bar"
          role="meter"
          aria-label="Spent today"
          :aria-valuenow="dayPct"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <span
            class="bc__fill"
            :class="{ 'is-full': budget.daily_cap_reached }"
            :style="{ width: `${dayPct}%` }"
          />
        </div>
        <span class="tp-note">
          {{
            num(budget.daily_limit_usd) > 0
              ? `${usd(budget.daily_remaining_usd)} left today (UTC). At the cap, replies stay local.`
              : 'With no daily budget, OpenRouter is not used: every reply is local.'
          }}
        </span>
      </div>
      <div class="bc__row">
        <div class="bc__head">
          <span class="tp-strong">This month</span>
          <Badge v-if="budget.monthly_cap_reached" tone="danger" label="Budget reached" />
        </div>
        <span class="tp-num">
          {{ usd(budget.month_spent_usd) }} of
          {{ num(budget.monthly_limit_usd) > 0 ? usd(budget.monthly_limit_usd) : 'no monthly cap' }}
        </span>
        <div
          v-if="monthPct !== null"
          class="bc__bar"
          role="meter"
          aria-label="Spent this month"
          :aria-valuenow="monthPct"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <span
            class="bc__fill"
            :class="{ 'is-full': budget.monthly_cap_reached }"
            :style="{ width: `${monthPct}%` }"
          />
        </div>
        <span v-if="budget.monthly_remaining_usd !== null" class="tp-note">
          {{ usd(budget.monthly_remaining_usd) }} left this month.
        </span>
      </div>
    </div>

    <form v-if="admin" class="bc__form" @submit.prevent="save">
      <TextInput
        v-model="daily"
        label="Daily cap (USD)"
        inputmode="decimal"
        size="sm"
        data-testid="budget-daily"
      />
      <TextInput
        v-model="monthly"
        label="Monthly budget (USD, 0 = none)"
        inputmode="decimal"
        size="sm"
        data-testid="budget-monthly"
      />
      <Button type="submit" size="sm" variant="secondary" :loading="busy" :disabled="!dirty">
        Save limits
      </Button>
    </form>
    <p v-if="message" class="tp-note" role="status" data-testid="budget-message">
      {{ message }}
      <Button v-if="needsPassword" size="sm" variant="ghost" @click="router.push('/settings')">
        Open Settings
      </Button>
    </p>
  </Card>
</template>

<style scoped>
.bc__rows {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--sp-4);
  min-width: 0;
}
.bc__row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.bc__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.bc__bar {
  position: relative;
  height: 6px;
  border-radius: var(--radius-pill);
  overflow: hidden;
  background: color-mix(in oklch, var(--text-secondary) 20%, transparent);
}
.bc__fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: var(--radius-pill);
  background: var(--theme-accent);
}
.bc__fill.is-full {
  background: var(--theme-danger);
}
.bc__form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  align-items: end;
  gap: var(--sp-2);
  margin-top: var(--sp-3);
  min-width: 0;
}
</style>
