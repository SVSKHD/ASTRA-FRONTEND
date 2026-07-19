<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, merge, rowBase } from '@/styles'
import type { Todo } from '@/types'

const app = useAppStore()
const { c, s, panelStyle } = useStyles()
const { todos, burst, editing, draft } = storeToRefs(app)

const input = ref('')
const todoInputRef = ref<HTMLInputElement | null>(null)
defineExpose({ focus: () => todoInputRef.value?.focus() })

const sorted = computed(() => [...todos.value].sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0)))

function add() {
  app.addTodo(input.value)
  input.value = ''
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter') add()
}
function isEditing(t: Todo) {
  return editing.value.type === 'todo' && editing.value.id === t.id
}

const checkIcon = pxify({ display: 'block' })
function boxStyle(t: Todo) {
  return pxify({
    position: 'relative',
    flexShrink: 0,
    width: 25,
    height: 25,
    borderRadius: 8,
    border: '1.5px solid ' + (t.done ? c.value.accent : c.value.border),
    background: t.done ? c.value.accent : 'transparent',
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    boxShadow: t.done ? 'inset 0 1px 0 rgba(255,255,255,0.35)' : 'none',
    transition: 'background .3s cubic-bezier(.5,1.5,.5,1), border-color .3s ease, box-shadow .3s ease',
  })
}
function textStyle(t: Todo) {
  return pxify({
    flex: 1,
    fontSize: 14,
    lineHeight: 1.4,
    color: c.value.text,
    cursor: 'pointer',
    textDecoration: t.done ? 'line-through' : 'none',
    textDecorationColor: c.value.dim,
  })
}
function rowStyle(t: Todo) {
  return merge(rowBase(c.value), { opacity: t.done ? 0.5 : 1 })
}

const particles = [0, 1, 2, 3, 4, 5]
function particleStyle(i: number) {
  const a = (i * Math.PI) / 3
  return pxify({
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: c.value.accent,
    boxShadow: '0 0 6px ' + c.value.accent,
    pointerEvents: 'none',
    '--tx': (Math.cos(a) * 22).toFixed(1) + 'px',
    '--ty': (Math.sin(a) * 22).toFixed(1) + 'px',
    animation: 'burst .6s ease-out forwards',
  })
}
</script>

<template>
  <div :style="panelStyle">
    <div :style="s.inputRow">
      <input
        ref="todoInputRef"
        :style="s.input"
        placeholder="Add a todo… (N)"
        v-model="input"
        @keydown="onKey"
      />
      <button :style="s.addBtn" v-hover-style="s.addBtnHover" @click="add">+</button>
    </div>
    <div v-if="todos.length === 0" :style="s.empty">Nothing yet — add your first todo.</div>
    <div :style="s.list">
      <div v-for="t in sorted" :key="t.id" :style="rowStyle(t)" v-hover-style="s.rowHover">
        <template v-if="isEditing(t)">
          <input
            :style="s.editInput"
            :value="(draft.text as string)"
            @input="app.setDraft('text', ($event.target as HTMLInputElement).value)"
            autofocus
          />
          <button :style="s.saveBtn" @click="app.saveEdit()">Save</button>
          <button :style="s.cancelBtn" @click="app.cancelEdit()">Cancel</button>
        </template>
        <template v-else>
          <button :style="boxStyle(t)" @click="app.toggleTodo(t.id)">
            <svg
              v-if="t.done"
              :style="checkIcon"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              :stroke="c.onAccent"
              stroke-width="3.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12" style="animation: popIn .35s cubic-bezier(.3,1.6,.5,1)" />
            </svg>
            <template v-if="burst === t.id">
              <span v-for="i in particles" :key="i" :style="particleStyle(i)"></span>
            </template>
          </button>
          <span :style="textStyle(t)" @click="app.startEdit('todo', t)">{{ t.text }}</span>
          <button :style="s.shareBtn" @click="app.share('todo', t)">↗</button>
          <button :style="s.del" @click="app.deleteWithUndo('todos', 'todo', t.id)">×</button>
        </template>
      </div>
    </div>
  </div>
</template>
