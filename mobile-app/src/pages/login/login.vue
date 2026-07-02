<template>
  <view class="page-login">
    <view class="login-glow login-glow-a" />
    <view class="login-glow login-glow-b" />

    <view class="brand-block">
      <view class="brand-mark">火</view>
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
      <view class="btn btn-primary btn-block login-btn" @click="onLogin">
        {{ busy ? '登录中…' : '登录' }}
      </view>
      <view class="btn btn-ghost btn-block" @click="onRegister">注册账号</view>
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
  padding: 56px 24px 24px;
  background: var(--body-bg);
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
}
.login-glow {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}
.login-glow-a {
  width: 220px;
  height: 220px;
  top: -60px;
  right: -40px;
  background: radial-gradient(circle, rgba(76, 125, 255, 0.18) 0%, transparent 70%);
}
.login-glow-b {
  width: 180px;
  height: 180px;
  bottom: 80px;
  left: -60px;
  background: radial-gradient(circle, rgba(122, 167, 255, 0.12) 0%, transparent 70%);
}
.brand-block {
  position: relative;
  margin-bottom: 36px;
}
.brand-mark {
  width: 56px;
  height: 56px;
  margin-bottom: 16px;
  border-radius: 16px;
  background: var(--accent-gradient);
  color: #fff;
  font-size: 26px;
  font-weight: 700;
  line-height: 56px;
  text-align: center;
  box-shadow: 0 10px 24px rgba(76, 125, 255, 0.32);
}
.brand-name {
  display: block;
  font-size: 30px;
  font-weight: 700;
  color: var(--text-0);
  margin-bottom: 8px;
  letter-spacing: -0.02em;
}
.brand-slogan {
  font-size: 14px;
  color: var(--text-2);
}
.form-card {
  position: relative;
  padding: 22px 18px;
}
.login-btn {
  margin-bottom: 10px;
}
.error-text {
  display: block;
  margin-top: 12px;
  font-size: 12px;
  color: var(--error);
  text-align: center;
}
.foot-hint {
  display: block;
  position: relative;
  text-align: center;
  margin-top: 28px;
  font-size: 12px;
  color: var(--text-3);
}
</style>
