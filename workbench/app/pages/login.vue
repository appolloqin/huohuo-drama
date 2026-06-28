<template>
  <div class="card auth-card">
    <h1 class="auth-heading">{{ tm.login.title }}</h1>
    <p class="auth-hint">{{ tm.login.hint }}</p>

    <form class="auth-form" @submit.prevent="attemptLogin">
      <div class="field">
        <label class="field-label" for="login-user">{{ tm.login.username }}</label>
        <input
          id="login-user"
          v-model="username"
          class="input"
          type="text"
          autocomplete="username"
          :placeholder="tm.login.placeholderUser"
          required
        />
      </div>
      <div class="field">
        <label class="field-label" for="login-pass">{{ tm.login.password }}</label>
        <input
          id="login-pass"
          v-model="password"
          class="input"
          type="password"
          autocomplete="current-password"
          :placeholder="tm.login.placeholderPass"
          required
        />
      </div>
      <button type="submit" class="btn btn-primary auth-submit" :disabled="authBusy">
        {{ authBusy ? tm.login.submitting : tm.login.submit }}
      </button>
    </form>

    <p class="auth-footer">
      {{ tm.login.footerPrefix }}
      <NuxtLink to="/register" class="auth-link">{{ tm.login.register }}</NuxtLink>
    </p>
  </div>
</template>

<script setup lang="ts">
// ── 登录：凭证提交与会话写入 ─────────────────────────────────
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

async function attemptLogin() {
  authBusy.value = true
  try {
    const data = await authAPI.login(username.value.trim(), password.value)
    setSession(data.token, data.user)
    setNavModules(data.user.nav_modules)
    toast.success(tm.value.login.welcome)
    await navigateTo('/')
  } catch (e: any) {
    toast.error(e.message || tm.value.login.fail)
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
