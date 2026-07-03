<template>
  <view class="page-shell">
    <view class="hero-card">
      <view class="hero-content">
        <view class="avatar">{{ avatarLetter }}</view>
        <view class="profile-meta">
          <text class="username">{{ user?.username || '—' }}</text>
          <text class="role">{{ user?.role === 'admin' ? '管理员' : '创作者' }}</text>
        </view>
        <CreditPill :credits="user?.credits ?? 0" />
      </view>
    </view>

    <view class="menu-panel menu-block">
      <view class="menu-row tappable" @click="openConsole">
        <view class="menu-row-left">
          <view class="menu-icon"><AppIcon name="web" size="md" color="#4c7dff" /></view>
          <text class="menu-row-text">在电脑端打开工作台</text>
        </view>
        <AppIcon name="chevron" size="sm" color="#8b97ab" />
      </view>
      <view class="menu-row tappable" @click="copyConsole">
        <view class="menu-row-left">
          <view class="menu-icon"><AppIcon name="link" size="md" color="#5c6b82" /></view>
          <text class="menu-row-text">复制工作台链接</text>
        </view>
        <AppIcon name="chevron" size="sm" color="#8b97ab" />
      </view>
      <view class="menu-row tappable" @click="refreshMe">
        <view class="menu-row-left">
          <view class="menu-icon"><AppIcon name="refresh" size="md" color="#5c6b82" /></view>
          <text class="menu-row-text">刷新积分</text>
        </view>
        <AppIcon name="chevron" size="sm" color="#8b97ab" />
      </view>
    </view>

    <view class="about-card">
      <text class="about-title">火火指令台</text>
      <text class="about-sub">手机发令 · 电脑精修</text>
    </view>

    <view class="logout-btn tappable" @click="logout">
      <AppIcon name="logout" size="sm" color="#5c6b82" />
      <text>退出登录</text>
    </view>

    <AppTabBar active="me" />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import AppIcon from '../../components/AppIcon.vue'
import AppTabBar from '../../components/AppTabBar.vue'
import CreditPill from '../../components/CreditPill.vue'
import { useAuth } from '../../composables/useAuth'
import { authApi } from '../../api'
import { copyWebLink, openWebConsole } from '../../utils/web-link'

const { user, requireAuth, logout, bootstrap } = useAuth()
const avatarLetter = computed(() => (user.value?.username || '?').charAt(0).toUpperCase())

function openConsole() { openWebConsole('/') }
function copyConsole() { copyWebLink('/') }

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
  padding: 16px 16px calc(92px + env(safe-area-inset-bottom));
  background: var(--body-bg);
  box-sizing: border-box;
  overflow-x: hidden;
}
.hero-card {
  border-radius: var(--radius-xl);
  overflow: hidden;
  margin-bottom: 16px;
  background: var(--bg-0);
  border: 1px solid var(--border-soft);
  box-shadow: var(--shadow-card);
}
.hero-content {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 16px;
}
.avatar {
  width: 50px;
  height: 50px;
  border-radius: 14px;
  background: var(--accent-bg);
  color: var(--accent-text);
  font-size: 20px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--accent-line);
}
.profile-meta {
  flex: 1;
  min-width: 0;
}
.username {
  display: block;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-0);
}
.role {
  display: block;
  margin-top: 2px;
  font-size: 13px;
  color: var(--text-3);
}
.menu-block { margin-bottom: 16px; }
.menu-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--accent-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}
.about-card {
  text-align: center;
  padding: 18px;
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 46px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-2);
  background: var(--bg-0);
  border: 1px solid var(--border);
  box-sizing: border-box;
}
</style>
