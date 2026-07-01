<template>
  <view class="page-login">
    <view class="brand-block">
      <text class="brand-name">火火指令台</text>
      <text class="brand-slogan">手机发令，电脑精修</text>
    </view>

    <view class="form-card">
      <view class="field">
        <text class="field-label">用户名</text>
        <input v-model="username" class="input" placeholder="请输入用户名" />
      </view>
      <view class="field">
        <text class="field-label">密码</text>
        <input v-model="password" class="input" password placeholder="请输入密码" />
      </view>
      <button class="btn btn-primary btn-block" :disabled="busy" @click="onLogin">
        {{ busy ? '登录中…' : '登录' }}
      </button>
      <button class="btn btn-ghost btn-block" :disabled="busy" @click="onRegister">
        注册账号
      </button>
      <text v-if="error" class="error-text">{{ error }}</text>
    </view>

    <text class="foot-hint">详细编辑请使用 Web 工作台</text>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '../../composables/useAuth'

const { login, register } = useAuth()
const username = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')

async function onLogin() {
  if (!username.value.trim() || !password.value) {
    error.value = '请输入用户名和密码'
    return
  }
  busy.value = true
  error.value = ''
  try {
    await login(username.value, password.value)
    uni.reLaunch({ url: '/pages/projects/index' })
  } catch (e: any) {
    error.value = e?.message || '登录失败'
  } finally {
    busy.value = false
  }
}

async function onRegister() {
  if (!username.value.trim() || password.value.length < 6) {
    error.value = '用户名必填，密码至少 6 位'
    return
  }
  busy.value = true
  error.value = ''
  try {
    await register(username.value, password.value)
    uni.reLaunch({ url: '/pages/projects/index' })
  } catch (e: any) {
    error.value = e?.message || '注册失败'
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.page-login {
  min-height: 100vh;
  padding: 48px 24px 24px;
  background: var(--body-bg);
}
.brand-block {
  margin-bottom: 32px;
}
.brand-name {
  display: block;
  font-size: 28px;
  font-weight: 700;
  color: var(--text-0);
  margin-bottom: 8px;
}
.brand-slogan {
  font-size: 14px;
  color: var(--text-2);
}
.form-card {
  background: var(--bg-0);
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow: var(--shadow-card);
}
.field {
  margin-bottom: 14px;
}
.field-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1);
  margin-bottom: 6px;
}
.error-text {
  display: block;
  margin-top: 12px;
  font-size: 12px;
  color: var(--error);
}
.foot-hint {
  display: block;
  text-align: center;
  margin-top: 24px;
  font-size: 12px;
  color: var(--text-3);
}
</style>
