<template>
  <view class="page-shell">
    <view class="hero-card">
      <view class="hero-bg" />
      <view class="hero-content">
        <view class="avatar">{{ avatarLetter }}</view>
        <view class="profile-meta">
          <text class="username">{{ user?.username || '—' }}</text>
          <text class="role">{{ user?.role === 'admin' ? '管理员' : '创作者' }}</text>
        </view>
        <CreditPill light :credits="user?.credits ?? 0" />
      </view>
    </view>

    <view class="menu-panel menu-block">
      <view class="menu-row" @click="openConsole">
        <text>在电脑端打开工作台</text>
        <text class="menu-row-arrow">›</text>
      </view>
      <view class="menu-row" @click="copyConsole">
        <text>复制工作台链接</text>
        <text class="menu-row-arrow">›</text>
      </view>
      <view class="menu-row" @click="refreshMe">
        <text>刷新积分</text>
        <text class="menu-row-arrow">›</text>
      </view>
    </view>

    <view class="about-card">
      <text class="about-title">火火指令台</text>
      <text class="about-sub">手机发令 · 电脑精修</text>
    </view>

    <view class="logout-btn" @click="logout">退出登录</view>

    <AppTabBar active="me" />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import AppTabBar from '../../components/AppTabBar.vue'
import CreditPill from '../../components/CreditPill.vue'
import { useAuth } from '../../composables/useAuth'
import { authApi } from '../../api'
import { copyWebLink, openWebConsole } from '../../utils/web-link'

const { user, requireAuth, logout, bootstrap } = useAuth()

const avatarLetter = computed(() => (user.value?.username || '?').charAt(0).toUpperCase())

function openConsole() {
  openWebConsole('/')
}

function copyConsole() {
  copyWebLink('/')
}

async function refreshMe() {
  try {
    user.value = await authApi.me()
    uni.showToast({ title: '已刷新', icon: 'success' })
  } catch {
    uni.showToast({ title: '刷新失败', icon: 'none' })
  }
}

onShow(async () => {
  if (!requireAuth()) return
  await bootstrap()
})
</script>

<style scoped>
.page-shell {
  min-height: 100vh;
  padding: 16px 16px calc(88px + env(safe-area-inset-bottom));
  background: var(--body-bg);
  box-sizing: border-box;
  overflow-x: hidden;
}
.hero-card {
  position: relative;
  border-radius: var(--radius-xl);
  overflow: hidden;
  margin-bottom: 16px;
  border: 1px solid rgba(76, 125, 255, 0.15);
  box-shadow: var(--shadow-card);
}
.hero-bg {
  position: absolute;
  inset: 0;
  background: var(--accent-gradient);
  opacity: 0.95;
}
.hero-content {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 16px;
}
.avatar {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
  font-size: 20px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.28);
}
.profile-meta {
  flex: 1;
  min-width: 0;
}
.username {
  display: block;
  font-size: 17px;
  font-weight: 700;
  color: #fff;
}
.role {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.78);
}
.menu-block {
  margin-bottom: 16px;
}
.about-card {
  text-align: center;
  padding: 16px;
  margin-bottom: 16px;
  border-radius: var(--radius-lg);
  background: var(--bg-0);
  border: 1px solid var(--border-soft);
}
.about-title {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
}
.about-sub {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-3);
}
.logout-btn {
  width: 100%;
  height: 44px;
  line-height: 44px;
  text-align: center;
  border-radius: var(--radius);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-2);
  background: var(--bg-0);
  border: 1px solid var(--border);
  box-sizing: border-box;
}
</style>
