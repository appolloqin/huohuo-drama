<template>
  <view class="page-shell">
    <view class="profile-card">
      <view class="avatar">{{ avatarLetter }}</view>
      <view class="profile-meta">
        <text class="username">{{ user?.username || '—' }}</text>
        <text class="role">{{ user?.role === 'admin' ? '管理员' : '创作者' }}</text>
      </view>
      <CreditPill :credits="user?.credits ?? 0" />
    </view>

    <view class="menu">
      <view class="menu-item" @click="openConsole">
        <text>在电脑端打开工作台</text>
        <text class="arrow">›</text>
      </view>
      <view class="menu-item" @click="copyConsole">
        <text>复制工作台链接</text>
        <text class="arrow">›</text>
      </view>
      <view class="menu-item" @click="refreshMe">
        <text>刷新积分</text>
        <text class="arrow">›</text>
      </view>
    </view>

    <view class="about">
      <text class="about-title">火火指令台</text>
      <text class="about-sub">手机发令 · 电脑精修 · 复用现有 API</text>
    </view>

    <button class="btn btn-ghost logout-btn" @click="logout">退出登录</button>

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
  padding: 16px 16px calc(70px + env(safe-area-inset-bottom));
  background: var(--body-bg);
}
.profile-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-0);
  border-radius: var(--radius-lg);
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: var(--shadow-card);
}
.avatar {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--accent-gradient);
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.profile-meta {
  flex: 1;
  min-width: 0;
}
.username {
  display: block;
  font-size: 16px;
  font-weight: 600;
}
.role {
  font-size: 12px;
  color: var(--text-3);
}
.menu {
  background: var(--bg-0);
  border-radius: var(--radius-lg);
  overflow: hidden;
  margin-bottom: 20px;
  box-shadow: var(--shadow-card);
}
.menu-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
}
.menu-item:last-child {
  border-bottom: none;
}
.arrow {
  color: var(--text-3);
}
.about {
  text-align: center;
  margin-bottom: 20px;
}
.about-title {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
}
.about-sub {
  font-size: 11px;
  color: var(--text-3);
}
.logout-btn {
  width: 100%;
}
</style>
