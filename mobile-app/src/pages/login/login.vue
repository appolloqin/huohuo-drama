<template>
  <view class="page-login">
    <view class="brand-block">
      <view class="brand-mark">
        <AppIcon name="command" size="lg" color="#4c7dff" />
      </view>
      <text class="brand-name">火火指令台</text>
      <text class="brand-slogan">手机发令，电脑精修</text>
    </view>

    <view class="form-card panel">
      <view class="field">
        <text class="field-label">用户名</text>
        <input v-model="username" class="input" placeholder="请输入用户名" />
      </view>
      <view class="field">
        <text class="field-label">密码</text>
        <input v-model="password" class="input" password placeholder="请输入密码" />
      </view>
      <view class="btn btn-primary btn-block login-btn tappable" @click="onLogin">
        {{ busy ? '登录中…' : '登录' }}
      </view>
      <view class="btn btn-ghost btn-block tappable" @click="onRegister">注册账号</view>
      <text v-if="error" class="error-text">{{ error }}</text>
    </view>

    <text class="foot-hint">详细编辑请使用 Web 工作台</text>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from '../../components/AppIcon.vue'
import { useAuth } from '../../composables/useAuth'

const { login, register } = useAuth()
const username = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')

async function onLogin() {
  if (busy.value) return
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
  if (busy.value) return
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
  padding: 64px 24px 24px;
  background: var(--body-bg);
  box-sizing: border-box;
}
.brand-block {
  margin-bottom: 36px;
}
.brand-mark {
  width: 60px;
  height: 60px;
  margin-bottom: 18px;
  border-radius: 18px;
  background: var(--accent-bg);
  border: 1px solid var(--accent-line);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-soft);
}
.brand-name {
  display: block;
  font-size: 30px;
  font-weight: 700;
  color: var(--text-0);
  margin-bottom: 8px;
  letter-spacing: -0.03em;
}
.brand-slogan {
  font-size: 15px;
  color: var(--text-2);
}
.form-card {
  padding: 22px 18px;
}
.login-btn {
  margin-bottom: 10px;
}
.error-text {
  display: block;
  margin-top: 12px;
  font-size: 13px;
  color: var(--error);
  text-align: center;
}
.foot-hint {
  display: block;
  text-align: center;
  margin-top: 28px;
  font-size: 13px;
  color: var(--text-3);
}
</style>
