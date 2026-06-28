<template>
  <div class="card auth-card">
    <h1 class="auth-heading">{{ tm.register.title }}</h1>
    <p class="auth-hint">{{ tm.register.hint }}</p>

    <form class="auth-form" @submit.prevent="attemptRegister">
      <div class="field">
        <label class="field-label" for="reg-user">{{ tm.register.username }}</label>
        <input
          id="reg-user"
          v-model="username"
          class="input"
          type="text"
          autocomplete="username"
          :placeholder="tm.register.placeholderUser"
          required
        />
      </div>
      <div class="field">
        <label class="field-label" for="reg-pass">{{ tm.register.password }}</label>
        <input
          id="reg-pass"
          v-model="password"
          class="input"
          type="password"
          autocomplete="new-password"
          :placeholder="tm.register.placeholderPass"
          required
        />
      </div>
      <button type="submit" class="btn btn-primary auth-submit" :disabled="authBusy">
        {{ authBusy ? tm.register.submitting : tm.register.submit }}
      </button>
    </form>

    <p class="auth-footer">
      {{ tm.register.footerPrefix }}
      <NuxtLink to="/login" class="auth-link">{{ tm.register.login }}</NuxtLink>
    </p>
  </div>
</template>

<script setup lang="ts">
// ── 注册：新账号创建与会话写入 ───────────────────────────────
import { toast } from 'vue-sonner'
import { authAPI } from '~/composables/use-api'
import { useAuth } from '~/composables/useAuth'
import { useNavModules } from '~/composables/use-nav-modules'
import { useI18n } from '~/composables/use-i18n'

definePageMeta({ layout: 'auth' })

const { messages: tm, init } = useI18n()
onMounted(() => init())

const username = ref('')
const password = ref('')
const authBusy = ref(false)
const { setSession } = useAuth()
const { setNavModules } = useNavModules()

async function attemptRegister() {
  authBusy.value = true
  try {
    const data = await authAPI.register(username.value.trim(), password.value)
    setSession(data.token, data.user)
    setNavModules(data.user.nav_modules)
    toast.success(tm.value.register.success)
    await navigateTo('/')
  } catch (e: any) {
    toast.error(e.message || tm.value.register.fail)
  } finally {
    authBusy.value = false
  }
}
</script>

<style scoped>
.auth-card {
  padding: var(--sp-8);
}
.auth-heading {
  font-size: 1.35rem;
  text-align: center;
  margin-bottom: var(--sp-2);
}
.auth-hint {
  text-align: center;
  color: var(--text-2);
  font-size: 13px;
  margin-bottom: var(--sp-6);
  line-height: 1.5;
}
.auth-form {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}
.field-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
  margin-bottom: var(--sp-2);
}
.auth-submit {
  width: 100%;
  margin-top: var(--sp-2);
  padding: 10px 16px;
}
.auth-footer {
  text-align: center;
  margin-top: var(--sp-6);
  font-size: 13px;
  color: var(--text-2);
}
.auth-link {
  color: var(--accent-text);
  font-weight: 600;
  text-decoration: none;
}
.auth-link:hover {
  text-decoration: underline;
}
</style>
