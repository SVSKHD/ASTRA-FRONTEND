<script setup lang="ts">
import { ref } from 'vue'
import { profileSchema, type Profile } from '@/utils/profile'
import Modal from '@/components/ui/Modal.vue'
import ProfileFields from './ProfileFields.vue'
const props = defineProps<{ profile: Profile; saving: boolean; error: string }>()
const emit = defineEmits<{ save: [Profile]; close: [] }>()
const draft = ref<unknown>(JSON.parse(JSON.stringify(props.profile)))
const validation = ref('')
function save() {
  const result = profileSchema.safeParse(draft.value)
  if (!result.success) {
    validation.value = result.error.issues
      .map((issue) => `${issue.path.join(' ? ')}: ${issue.message}`)
      .join(' ? ')
    return
  }
  validation.value = ''
  emit('save', result.data)
}
</script>
<template>
  <Modal :open="true" title="Edit profile" size="lg" @close="!saving && emit('close')"
    ><div class="profile-page pf-editor">
      <p>Changes are published when you save. Cancel keeps the current profile.</p>
      <fieldset :disabled="saving" class="pf-editor-fields">
        <ProfileFields v-model="draft" label="Profile" />
      </fieldset>
      <p v-if="validation || error" role="alert">{{ validation || error }}</p>
    </div>
    <template #footer
      ><div class="profile-page pf-editor-actions">
        <button :disabled="saving" @click="emit('close')">Cancel</button
        ><button :disabled="saving" @click="save">{{ saving ? 'Saving?' : 'Save profile' }}</button>
      </div></template
    ></Modal
  >
</template>
