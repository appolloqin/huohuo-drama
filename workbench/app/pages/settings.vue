<template>
  <div class="settings-layout">
    <div v-if="!isAdmin" class="settings-content">
      <div class="settings-scroll">
        <div class="settings-head">
          <h2 class="settings-title">{{ tm.settings.modelTitle }}</h2>
          <p class="settings-desc">{{ tm.settings.modelDesc }}</p>
        </div>
        <div class="user-settings-sections sections">
        <section class="settings-type-section card account-panel">
          <div class="section-head">
            <div class="section-head-text">
              <span class="section-title">{{ tm.settings.accountTitle }}</span>
              <div class="section-subtitle">{{ tm.settings.accountDesc }}</div>
            </div>
          </div>
          <div class="account-form">
            <label class="field">
              <span class="field-label">{{ tm.settings.currentPassword }}</span>
              <input v-model="passwordCurrentInput" class="input" type="password" autocomplete="current-password" />
            </label>
            <label class="field">
              <span class="field-label">{{ tm.settings.newPassword }}</span>
              <input v-model="passwordNewInput" class="input" type="password" autocomplete="new-password" />
            </label>
            <label class="field">
              <span class="field-label">{{ tm.settings.confirmPassword }}</span>
              <input v-model="passwordConfirmInput" class="input" type="password" autocomplete="new-password" />
            </label>
          </div>
          <div class="modal-actions" style="margin-top:12px">
            <button type="button" class="btn btn-primary" :disabled="passwordChangeSaving" @click="savePassword">
              {{ passwordChangeSaving ? tm.settings.changingPassword : tm.settings.changePassword }}
            </button>
          </div>
        </section>
        <section class="settings-type-section">
          <div class="section-head">
            <div class="section-head-text">
              <span class="section-title">{{ tm.settings.defaultModels }}</span>
              <div class="section-subtitle">{{ tm.settings.onlyAdminEnabled }}</div>
            </div>
          </div>
          <div class="config-grid">
            <label class="config-card">
              <span class="config-card-kicker">{{ tm.settings.modelPrefKickerText }}</span>
              <span class="field-label">{{ tm.settings.textModel }}</span>
              <BaseSelect v-model="preferredTextConfigId" :options="textConfigPickerRows" :placeholder="tm.settings.pickText" searchable />
            </label>
            <label class="config-card">
              <span class="config-card-kicker">{{ tm.settings.modelPrefKickerImage }}</span>
              <span class="field-label">{{ tm.settings.imageModel }}</span>
              <BaseSelect v-model="preferredImageConfigId" :options="imageConfigPickerRows" :placeholder="tm.settings.pickImage" searchable />
            </label>
            <label class="config-card">
              <span class="config-card-kicker">{{ tm.settings.modelPrefKickerVideo }}</span>
              <span class="field-label">{{ tm.settings.videoModel }}</span>
              <BaseSelect v-model="preferredVideoConfigId" :options="videoConfigPickerRows" :placeholder="tm.settings.pickVideo" searchable />
            </label>
            <label class="config-card">
              <span class="config-card-kicker">{{ tm.settings.modelPrefKickerAudio }}</span>
              <span class="field-label">{{ tm.settings.audioModel }}</span>
              <BaseSelect v-model="preferredAudioConfigId" :options="audioConfigPickerRows" :placeholder="tm.settings.pickAudio" searchable />
            </label>
          </div>
          <div class="modal-actions" style="margin-top:12px">
            <button type="button" class="btn btn-primary" @click="saveUserModelPrefs">{{ tm.settings.saveDefaultModels }}</button>
          </div>
        </section>
        <section class="setup-panel card">
          <div class="setup-panel-head">
            <div>
              <div class="setup-kicker">{{ tm.settings.huohuoPresetKicker }}</div>
              <div class="setup-title">{{ tm.settings.oneClick }}</div>
              <div class="setup-desc">{{ tm.settings.userHuohuoPresetDesc }}</div>
            </div>
            <button class="btn btn-primary" @click="bundledPresetSheetOpen = true">
              <Sparkles :size="14" /> {{ tm.settings.oneClick }}
            </button>
          </div>
          <div class="preset-grid">
            <article v-for="preset in bundledPresetCardRows" :key="preset.presetKey" class="preset-card">
              <div class="preset-card-top">
                <span class="preset-service">{{ preset.label }}</span>
                <span class="tag tag-accent">{{ preset.provider }}</span>
              </div>
              <div class="preset-model mono">{{ preset.model }}</div>
              <div class="preset-base mono">{{ preset.baseUrl }}</div>
            </article>
          </div>
        </section>
        </div>
      </div>
    </div>
    <template v-else>
    <aside class="settings-nav">
      <div class="nav-group">
        <div class="nav-group-label">{{ tm.settings.navBasic }}</div>
        <button v-for="t in accountSettingsTabs" :key="t.id" :class="['nav-item', { active: tab === t.id }]" @click="tab = t.id">
          <component :is="t.icon" :size="14" />
          {{ t.label }}
        </button>
      </div>
      <div class="nav-advanced">
        <label class="advanced-toggle">
          <span>{{ tm.settings.agentToggle }}</span>
          <input type="checkbox" v-model="advancedSectionOpen" />
          <span class="advanced-slider"></span>
        </label>
        </div>
      <div v-if="advancedSectionOpen" class="nav-group">
        <div class="nav-group-label">{{ tm.settings.navAdvanced }}</div>
        <button v-for="t in adminSettingsTabs" :key="t.id" :class="['nav-item', { active: tab === t.id }]" @click="tab = t.id">
          <component :is="t.icon" :size="14" />
          {{ t.label }}
        </button>
      </div>
    </aside>

    <div class="settings-content">

      <!-- ===== AI 服务配置 ===== -->
      <div v-if="tab === 'ai'" class="settings-scroll">
        <div class="settings-head">
          <div class="settings-brand">
            <div class="settings-brand-mark">
              <img v-if="brandLogoVisible" :src="brandLogo" :alt="tm.brand.logoAlt" class="settings-brand-logo" @error="brandLogoVisible = false" />
              <span v-else class="settings-brand-fallback">{{ (tm.brand.name || '').charAt(0) }}</span>
            </div>
            <div class="settings-brand-copy">
              <div class="settings-brand-kicker">{{ tm.brand.sub }}</div>
              <div class="settings-brand-name">{{ tm.brand.name }}</div>
            </div>
          </div>
          <h2 class="settings-title">{{ tm.settings.aiTitle }}</h2>
          <p class="settings-desc">{{ tm.settings.aiDesc }}</p>
        </div>
        <section class="setup-panel card">
          <div class="setup-panel-head">
            <div>
              <div class="setup-kicker">{{ tm.settings.quickKicker }}</div>
              <div class="setup-title">{{ tm.settings.quickTitle }}</div>
              <div class="setup-desc">{{ tm.settings.quickDesc }}</div>
            </div>
            <button class="btn btn-primary" @click="bundledPresetSheetOpen = true">
              <Sparkles :size="14" /> {{ tm.settings.oneClick }}
            </button>
          </div>
          <div class="preset-grid">
            <article v-for="preset in bundledPresetCardRows" :key="preset.presetKey" class="preset-card">
              <div class="preset-card-top">
                <span class="preset-service">{{ preset.label }}</span>
                <span class="tag tag-accent">{{ preset.provider }}</span>
                <span class="tag tag-soft">{{ sourceTagLabel(preset.source) }}</span>
              </div>
              <div class="preset-model mono">{{ preset.model }}</div>
              <div class="preset-base mono">{{ preset.baseUrl }}</div>
            </article>
          </div>
        </section>
        <section class="setup-panel card">
          <div class="setup-panel-head compact">
            <div>
              <div class="setup-title">{{ tm.settings.templateTitle }}</div>
              <div class="setup-desc">{{ tm.settings.templateDesc }}</div>
            </div>
          </div>
          <div class="template-row">
            <button
              v-for="st in serviceTypes"
              :key="st.type"
              class="template-type-chip"
              @click="showCreateServiceConfigSheet(st.type)"
            >
              {{ st.label }}
            </button>
          </div>
        </section>
        <div class="sections">
          <section v-for="st in serviceTypes" :key="st.type" class="settings-type-section">
            <div class="section-head">
              <div class="section-head-text">
                <span class="section-title">{{ st.label }}</span>
                <div class="section-subtitle">{{ serviceTypeMeta[st.type].desc }}</div>
              </div>
              <div class="section-head-actions">
                <span v-if="countActiveConfigsForType(st.type)" class="tag tag-accent">{{ tx(tm.settings.activeServiceCount, { n: countActiveConfigsForType(st.type) }) }}</span>
                <button class="btn btn-ghost btn-sm" type="button" @click="showCreateServiceConfigSheet(st.type)"><Plus :size="13" /> {{ tm.settings.addShort }}</button>
              </div>
            </div>
            <div class="config-list">
              <div v-for="c in selectConfigsByServiceType(st.type)" :key="c.id" class="card config-row">
                <div class="config-info">
                  <div class="config-main">
                    <div class="config-line">
                      <span class="config-provider">{{ formatProviderLabel(c.provider) }}</span>
                      <span class="config-name">{{ c.name || `${c.provider}-${c.service_type}` }}</span>
                    </div>
                    <span class="config-model mono truncate">{{ formatModelListDisplay(c.model) }}</span>
                    <span class="config-credit">{{ formatBillingCreditCaption(c) }}</span>
                    <span class="config-base mono truncate">{{ c.base_url || tm.settings.baseUrlMissing }}</span>
                  </div>
                </div>
                <div class="config-actions">
                  <span :class="['tag', c.api_key ? 'tag-success' : 'tag-error']">{{ c.api_key ? tm.settings.apiKeyOk : tm.settings.apiKeyMissing }}</span>
                  <button type="button" class="btn btn-ghost btn-sm" @click="probeSavedServiceConfig(c)">{{ tm.settings.test }}</button>
                  <label class="toggle"><input type="checkbox" :checked="c.is_active" @change="toggleServiceConfigActive(c)"><span /></label>
                  <button type="button" class="btn btn-ghost btn-icon" @click="showEditServiceConfigSheet(c)"><Pencil :size="13" /></button>
                  <button type="button" class="btn btn-ghost btn-icon" @click="deleteServiceConfigRow(c.id)"><Trash2 :size="13" /></button>
                </div>
              </div>
              <p v-if="!selectConfigsByServiceType(st.type).length" class="config-empty">{{ tm.settings.configListEmpty }}</p>
            </div>
          </section>
        </div>
      </div>

      <!-- ===== Agent 配置 ===== -->
      <div v-else-if="tab === 'agents'" class="settings-scroll">
        <div class="settings-head">
          <div class="settings-brand">
            <div class="settings-brand-mark">
              <img v-if="brandLogoVisible" :src="brandLogo" :alt="tm.brand.logoAlt" class="settings-brand-logo" @error="brandLogoVisible = false" />
              <span v-else class="settings-brand-fallback">{{ (tm.brand.name || '').charAt(0) }}</span>
            </div>
            <div class="settings-brand-copy">
              <div class="settings-brand-kicker">{{ tm.brand.sub }}</div>
              <div class="settings-brand-name">{{ tm.brand.name }}</div>
            </div>
          </div>
          <h2 class="settings-title">{{ tm.settings.agentsPageTitle }}</h2>
          <p class="settings-desc">{{ tm.settings.agentsPageDesc }}</p>
          <p class="settings-desc dim">{{ tm.settings.agentsKindTabsHint }}</p>
          <div class="agent-kind-tabs">
            <button
              v-for="k in agentCatalogKindTabs"
              :key="k.id"
              type="button"
              :class="['agent-kind-tab', { active: agentCatalogKind === k.id }]"
              @click="switchAgentCatalogKind(k.id)"
            >{{ k.label }}</button>
          </div>
        </div>
        <div class="agent-list">
          <div v-for="a in visibleAgentDefinitions" :key="a.type" class="card agent-card">
            <div class="agent-card-head" @click="toggleAgentConfigEdit(a.type)">
              <div class="agent-type-badge">{{ a.icon }}</div>
              <div class="agent-card-titles">
                <div class="agent-card-title">{{ a.label }}</div>
                <div class="agent-card-meta dim">{{ a.type }}</div>
              </div>
              <span v-if="lookupAgentConfigRow(a.type)" class="tag tag-success">{{ tm.settings.agentCfgTag }}</span>
              <span v-else class="tag">{{ tm.settings.agentCfgDefault }}</span>
              <ChevronDown :size="14" :style="{ transform: editingAgentType === a.type ? 'rotate(180deg)' : '', transition: '0.2s' }" />
            </div>
            <div v-if="editingAgentType === a.type" class="agent-card-body">
              <label class="field">
                <span class="field-label">{{ tm.settings.agentModelField }} <span class="dim">{{ tm.settings.agentModelFieldHint }}</span></span>
                <BaseSelect v-model="agentConfigFormState.model" :options="textModelPickerOptions" :placeholder="tm.settings.agentModelSelectPlaceholder" searchable />
              </label>
              <div class="field-row">
                <label class="field">
                  <span class="field-label">{{ tm.settings.agentTemperature }}</span>
                  <input v-model.number="agentConfigFormState.temperature" class="input" type="number" min="0" max="2" step="0.1" />
                </label>
                <label class="field">
                  <span class="field-label">{{ tm.settings.agentMaxTokens }}</span>
                  <input v-model.number="agentConfigFormState.max_tokens" class="input" type="number" min="100" max="32000" />
                </label>
              </div>
              <label class="field">
                <span class="field-label">{{ tm.settings.agentSystemPromptLabel }}</span>
                <textarea v-model="agentConfigFormState.system_prompt" class="textarea" rows="12" :placeholder="tm.settings.agentSystemPromptPlaceholder" />
              </label>
              <div class="agent-card-foot">
                <button class="btn btn-ghost btn-sm" @click="restoreAgentDefaultPrompt(a.type)">{{ tm.settings.resetAgentDefaults }}</button>
                <span v-if="agentConfigSavedFlag === a.type" class="tag tag-success" style="margin-left:8px">
                  <Check :size="10" /> {{ tm.settings.tagSaved }}
                </span>
                <button class="btn btn-primary btn-sm ml-auto" :disabled="agentConfigSaving" @click="persistAgentConfigRow(a.type)">
                  <Loader2 v-if="agentConfigSaving" :size="12" class="animate-spin" />
                  {{ tm.settings.save }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 账户安全 ===== -->
      <div v-else-if="tab === 'account'" class="settings-scroll">
        <div class="settings-head">
          <h2 class="settings-title">{{ tm.settings.accountTitle }}</h2>
          <p class="settings-desc">{{ tm.settings.accountDesc }}</p>
        </div>
        <section class="setup-panel card account-panel">
          <div class="account-form">
            <label class="field">
              <span class="field-label">{{ tm.settings.currentPassword }}</span>
              <input v-model="passwordCurrentInput" class="input" type="password" autocomplete="current-password" />
            </label>
            <label class="field">
              <span class="field-label">{{ tm.settings.newPassword }}</span>
              <input v-model="passwordNewInput" class="input" type="password" autocomplete="new-password" />
            </label>
            <label class="field">
              <span class="field-label">{{ tm.settings.confirmPassword }}</span>
              <input v-model="passwordConfirmInput" class="input" type="password" autocomplete="new-password" />
            </label>
          </div>
          <div class="modal-actions" style="margin-top:12px">
            <button type="button" class="btn btn-primary" :disabled="passwordChangeSaving" @click="savePassword">
              {{ passwordChangeSaving ? tm.settings.changingPassword : tm.settings.changePassword }}
            </button>
          </div>
        </section>
      </div>

      <!-- ===== 支付配置 ===== -->
      <div v-else-if="tab === 'payments'" class="settings-scroll">
        <div class="settings-head">
          <div class="settings-brand">
            <div class="settings-brand-mark">
              <img v-if="brandLogoVisible" :src="brandLogo" :alt="tm.brand.logoAlt" class="settings-brand-logo" @error="brandLogoVisible = false" />
              <span v-else class="settings-brand-fallback">{{ (tm.brand.name || '').charAt(0) }}</span>
            </div>
            <div class="settings-brand-copy">
              <div class="settings-brand-kicker">{{ tm.brand.sub }}</div>
              <div class="settings-brand-name">{{ tm.brand.name }}</div>
            </div>
          </div>
          <h2 class="settings-title">{{ tm.settings.tabPayments }}</h2>
          <p class="settings-desc">{{ tm.settings.paymentsIntro }}</p>
        </div>
        <section class="setup-panel card">
          <div class="setup-panel-head compact">
            <div>
              <div class="setup-title">{{ tm.settings.paymentChannelsTitle }}</div>
              <div class="setup-desc">{{ tm.settings.paymentChannelsDesc }}</div>
            </div>
            <button class="btn btn-primary btn-sm" type="button" @click="savePaymentProviders">{{ tm.settings.savePayments }}</button>
          </div>
          <div class="config-list">
            <div v-for="p in paymentProviderRows" :key="p.code" class="card config-row payment-provider-row">
              <div class="config-info">
                <div class="config-main">
                  <div class="config-line">
                    <span class="config-provider">{{ p.name }}</span>
                    <span class="config-name">{{ p.code }}</span>
                  </div>
                  <span class="config-model mono truncate">{{ p.methods.join(', ') }}</span>
                  <span class="config-base mono truncate">{{ p.note }}</span>
                  <template v-if="isCnyPaymentProvider(p.code)">
                    <div class="field" style="margin-top:8px;max-width:220px">
                      <span class="field-label">{{ tm.settings.labelCreditPerCny }}</span>
                      <input v-model.number="p.settings.credit_per_cny" class="input" type="number" min="1" step="1" />
                    </div>
                    <div class="field" style="margin-top:8px;max-width:220px">
                      <span class="field-label">{{ tm.settings.labelCustomMaxCny }}</span>
                      <input v-model.number="p.settings.custom_max_cny" class="input" type="number" min="1" step="1" />
                    </div>
                    <div class="field" style="margin-top:8px;max-width:220px">
                      <span class="field-label">{{ tm.settings.labelUsdToCnyRate }}</span>
                      <input v-model.number="p.settings.usd_to_cny_rate" class="input" type="number" min="0.01" step="0.01" />
                    </div>
                  </template>
                  <template v-else>
                    <div class="field" style="margin-top:8px;max-width:220px">
                      <span class="field-label">{{ tm.settings.labelCreditPerUsd }}</span>
                      <input v-model.number="p.settings.credit_per_usd" class="input" type="number" min="1" step="1" />
                    </div>
                    <div class="field" style="margin-top:8px;max-width:220px">
                      <span class="field-label">{{ tm.settings.labelCustomMaxUsd }}</span>
                      <input v-model.number="p.settings.custom_max_usd" class="input" type="number" min="1" step="1" />
                    </div>
                  </template>
                  <div class="field" style="margin-top:8px">
                    <span class="field-label">{{ tm.settings.labelBonusTiers }}</span>
                    <div class="config-list">
                      <div v-for="(tier, idx) in p.settings.bonus_tiers" :key="`${p.code}-${idx}`" class="admin-credit-row">
                        <input
                          v-if="isCnyPaymentProvider(p.code)"
                          v-model.number="tier.threshold_cny"
                          class="input admin-credit-input"
                          type="number"
                          min="1"
                          step="1"
                          :placeholder="tm.settings.phTierThresholdCny"
                        />
                        <input
                          v-else
                          v-model.number="tier.threshold_usd"
                          class="input admin-credit-input"
                          type="number"
                          min="1"
                          step="1"
                          :placeholder="tm.settings.phTierThresholdUsd"
                        />
                        <input v-model.number="tier.bonus_percent" class="input admin-credit-input" type="number" min="1" step="1" :placeholder="tm.settings.phTierBonusPercent" />
                        <button type="button" class="btn btn-ghost btn-sm" @click="removeBonusTier(p, idx)">{{ tm.settings.btnDelete }}</button>
                      </div>
                    </div>
                    <button type="button" class="btn btn-ghost btn-sm" style="margin-top:6px" @click="addBonusTier(p)">{{ tm.settings.btnAddTier }}</button>
                  </div>
                  <div v-if="p.code === 'pingpong'" class="field-row" style="margin-top:8px">
                    <label class="field">
                      <span class="field-label">{{ tm.settings.labelPingpongAccId }}</span>
                      <input v-model="p.settings.acc_id" class="input" :placeholder="tm.settings.phPingpongAccIdField" />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ tm.settings.labelPingpongClientId }}</span>
                      <input v-model="p.settings.client_id" class="input" :placeholder="tm.settings.phPingpongClientIdField" />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ tm.settings.labelPingpongSalt }}</span>
                      <input v-model="p.settings.salt" class="input" type="password" :placeholder="tm.settings.phPingpongSaltField" />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ tm.settings.labelPingpongRegion }}</span>
                      <BaseSelect
                        v-model="p.settings.region"
                        :options="pingpongRegionOptions"
                        :placeholder="tm.settings.phPingpongRegion"
                      />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ tm.settings.labelSignAlgo }}</span>
                      <BaseSelect
                        v-model="p.settings.sign_type"
                        :options="signAlgoOptions"
                        :placeholder="tm.settings.phSignType"
                      />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ tm.settings.labelEnvironment }}</span>
                      <BaseSelect
                        v-model="p.settings.env"
                        :options="paymentEnvOptions"
                        :placeholder="tm.settings.phPickEnvironment"
                      />
                    </label>
                  </div>
                  <div v-if="p.code === 'paypal'" class="field-row" style="margin-top:8px">
                    <label class="field">
                      <span class="field-label">{{ tm.settings.labelPaypalClientId }}</span>
                      <input v-model="p.settings.client_id" class="input" :placeholder="tm.settings.phPaypalClientId" />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ tm.settings.labelPaypalClientSecret }}</span>
                      <input v-model="p.settings.client_secret" class="input" type="password" :placeholder="tm.settings.phPaypalSecret" />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ tm.settings.labelEnvironment }}</span>
                      <BaseSelect
                        v-model="p.settings.env"
                        :options="paymentEnvOptions"
                        :placeholder="tm.settings.phPickEnvironment"
                      />
                    </label>
                  </div>
                  <div v-if="p.code === 'wechat'" class="field-row" style="margin-top:8px">
                    <label class="field">
                      <span class="field-label">{{ tm.settings.labelWechatAppId }}</span>
                      <input v-model="p.settings.app_id" class="input" :placeholder="tm.settings.phWechatAppId" />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ tm.settings.labelWechatMchId }}</span>
                      <input v-model="p.settings.mch_id" class="input" :placeholder="tm.settings.phWechatMchId" />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ tm.settings.labelWechatApiV3Key }}</span>
                      <input v-model="p.settings.api_v3_key" class="input" type="password" :placeholder="tm.settings.phWechatApiV3Key" />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ tm.settings.labelWechatSerialNo }}</span>
                      <input v-model="p.settings.serial_no" class="input" :placeholder="tm.settings.phWechatSerialNo" />
                    </label>
                    <label class="field" style="grid-column: 1 / -1">
                      <span class="field-label">{{ tm.settings.labelWechatPrivateKey }}</span>
                      <textarea v-model="p.settings.private_key" class="textarea mono" rows="4" :placeholder="tm.settings.phWechatPrivateKey" />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ tm.settings.labelEnvironment }}</span>
                      <BaseSelect v-model="p.settings.env" :options="paymentEnvOptions" :placeholder="tm.settings.phPickEnvironment" />
                    </label>
                  </div>
                  <div v-if="p.code === 'alipay'" class="field-row" style="margin-top:8px">
                    <label class="field">
                      <span class="field-label">{{ tm.settings.labelAlipayAppId }}</span>
                      <input v-model="p.settings.app_id" class="input" :placeholder="tm.settings.phAlipayAppId" />
                    </label>
                    <label class="field" style="grid-column: 1 / -1">
                      <span class="field-label">{{ tm.settings.labelAlipayPrivateKey }}</span>
                      <textarea v-model="p.settings.private_key" class="textarea mono" rows="4" :placeholder="tm.settings.phAlipayPrivateKey" />
                    </label>
                    <label class="field" style="grid-column: 1 / -1">
                      <span class="field-label">{{ tm.settings.labelAlipayPublicKey }}</span>
                      <textarea v-model="p.settings.alipay_public_key" class="textarea mono" rows="4" :placeholder="tm.settings.phAlipayPublicKey" />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ tm.settings.labelEnvironment }}</span>
                      <BaseSelect v-model="p.settings.env" :options="paymentEnvOptions" :placeholder="tm.settings.phPickEnvironment" />
                    </label>
                  </div>
                </div>
              </div>
              <div class="config-actions">
                <span :class="['tag', p.ready ? 'tag-success' : 'tag-error']">{{ p.ready ? tm.settings.providerReady : tm.settings.providerNeedsKeys }}</span>
                <button type="button" class="btn btn-ghost btn-sm" @click="testPaymentProvider(p)">{{ tm.settings.testPaymentCfg }}</button>
                <label class="toggle"><input type="checkbox" :checked="p.enabled" @change="togglePaymentProvider(p.code)"><span /></label>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- ===== 导航权限 ===== -->
      <div v-else-if="tab === 'nav'" class="settings-scroll">
        <div class="settings-head">
          <h2 class="settings-title">{{ tm.settings.navModulesTitle }}</h2>
          <p class="settings-desc">{{ tm.settings.navModulesDesc }}</p>
        </div>
        <section class="setup-panel card">
          <div class="setup-panel-head compact">
            <div class="setup-title">{{ tm.settings.navModulesRoleSection }}</div>
            <button class="btn btn-primary btn-sm" type="button" @click="saveNavModulesConfig">{{ tm.settings.navModulesSave }}</button>
          </div>
          <div class="nav-role-add">
            <input
              v-model="navigationNewRoleInput"
              class="input nav-role-add-input"
              :placeholder="tm.settings.navModulesAddRolePlaceholder"
              @keydown.enter.prevent="addNavigationRole"
            />
            <button class="btn btn-ghost btn-sm" type="button" @click="addNavigationRole">{{ tm.settings.navModulesAddRole }}</button>
          </div>
          <div class="nav-modules-grid">
            <div v-for="role in navigationRoleRows" :key="role" class="nav-modules-role card">
              <div class="nav-modules-role-title">{{ navRoleLabel(role) }}</div>
              <div class="nav-modules-checks">
                <label v-for="mod in navigationModuleCatalog" :key="`${role}-${mod.id}`" class="nav-module-check">
                  <input
                    type="checkbox"
                    :checked="navigationRoleMatrix[role]?.includes(mod.id)"
                    :disabled="role === 'admin' && mod.id === 'settings'"
                    @change="toggleNavModule(role, mod.id, $event)"
                  />
                  <span>{{ navModuleAdminLabel(mod.id) }}</span>
                </label>
              </div>
            </div>
          </div>
        </section>

        <section class="setup-panel card nav-user-panel">
          <div class="setup-panel-head compact">
            <div class="setup-title">{{ tm.settings.navModulesUserSection }}</div>
            <button
              class="btn btn-primary btn-sm"
              type="button"
              :disabled="!navPermSelectedUserId"
              @click="saveUserNavAccess"
            >
              {{ tm.settings.navModulesUserSave }}
            </button>
          </div>
          <div class="nav-user-form">
            <label class="nav-user-field">
              <span>{{ tm.settings.navModulesSelectUser }}</span>
              <AdminUserSearchPicker
                v-model="navPermSelectedUserId"
                :selected-label="navPermSelectedUser ? `${navPermSelectedUser.username}（${navRoleLabel(navPermSelectedUser.role)}）` : ''"
                :role-label="navRoleLabel"
                :placeholder="tm.settings.navModulesSearchPlaceholder"
                @select="onNavPermUserPicked"
              />
            </label>
            <template v-if="navPermSelectedUserId">
              <label class="nav-user-field">
                <span>{{ tm.settings.navModulesUserRole }}</span>
                <select v-model="navPermUserRole" class="input">
                  <option v-for="role in navigationRoleRows" :key="`user-role-${role}`" :value="role">
                    {{ navRoleLabel(role) }}
                  </option>
                </select>
              </label>
              <label class="nav-module-check nav-user-inherit">
                <input v-model="navPermInheritRole" type="checkbox" />
                <span>{{ tm.settings.navModulesInheritRole }}</span>
              </label>
              <div v-if="!navPermInheritRole" class="nav-modules-checks">
                <label v-for="mod in navigationModuleCatalog" :key="`user-mod-${mod.id}`" class="nav-module-check">
                  <input
                    type="checkbox"
                    :checked="navPermUserModules.includes(mod.id)"
                    :disabled="navPermUserRole === 'admin' && mod.id === 'settings'"
                    @change="toggleNavPermUserModule(mod.id, $event)"
                  />
                  <span>{{ navModuleAdminLabel(mod.id) }}</span>
                </label>
              </div>
              <p v-if="navPermEffectiveHint" class="nav-user-effective text-muted">{{ navPermEffectiveHint }}</p>
            </template>
          </div>
        </section>
      </div>

      <!-- ===== 平台账号（管理员） ===== -->
      <div v-else-if="tab === 'users' && isAdmin" class="settings-scroll">
        <div class="settings-head">
          <h2 class="settings-title">{{ tm.settings.usersTitle }}</h2>
          <p class="settings-desc">{{ tm.settings.usersDesc }}</p>
        </div>
        <section class="setup-panel card">
          <div class="setup-panel-head compact">
            <div>
              <div class="setup-kicker">{{ tm.settings.usersTitle }}</div>
              <div class="setup-desc">{{ tm.settings.usersDesc }}</div>
            </div>
            <div class="setup-panel-actions">
              <button class="btn btn-primary" @click="openUsersCreateSheet">
                <Plus :size="14" /> {{ tm.settings.usersCreate }}
              </button>
            </div>
          </div>

          <div v-if="usersListLoading" class="admin-users-loading">
            <Loader2 :size="16" class="spin" /> {{ tm.common.loading }}
          </div>

          <div v-else-if="!usersList.length" class="admin-users-empty">
            {{ tm.settings.usersEmpty }}
          </div>

          <div v-else class="admin-users-table-wrap">
            <table class="admin-users-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{{ tm.settings.usersFieldUsername }}</th>
                  <th>{{ tm.settings.usersFieldRole }}</th>
                  <th>{{ tm.settings.usersFieldCredits }}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in usersList" :key="u.id" :class="{ 'is-self': u.id === user?.id }">
                  <td class="cell-id">#{{ u.id }}</td>
                  <td class="cell-name">
                    {{ u.username }}
                    <span v-if="u.id === user?.id" class="self-badge">{{ tm.settings.usersSelfBadge }}</span>
                  </td>
                  <td>
                    <span :class="['role-chip', `role-${u.role}`]">{{ roleLabel(u.role) }}</span>
                  </td>
                  <td class="cell-credits">{{ formatCredits(u.credits) }}</td>
                  <td class="cell-actions">
                    <button class="btn btn-sm" @click="openUsersEditSheet(u)" :title="tm.settings.usersEditing">
                      <Pencil :size="12" />
                    </button>
                    <button
                      class="btn btn-sm btn-danger"
                      :disabled="u.id === user?.id"
                      :title="u.id === user?.id ? tm.settings.usersCannotDeleteSelf : tm.settings.usersConfirmDelete"
                      @click="confirmDeleteUser(u)"
                    >
                      <Trash2 :size="12" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <!-- ===== 创建账号弹窗 ===== -->
      <div v-if="usersCreateSheetOpen" class="overlay">
        <form class="modal card users-modal" @submit.prevent="submitUsersCreate">
          <div class="modal-head-simple">
            <h2 class="modal-title">{{ tm.settings.usersCreate }}</h2>
            <button type="button" class="modal-close-btn" :aria-label="tm.common.closeAria" @click="closeUsersSheet">
              <X :size="18" :stroke-width="2" />
            </button>
          </div>
          <div class="users-modal-body">
            <label class="field">
              <span class="field-label">{{ tm.settings.usersFieldUsername }} *</span>
              <input v-model="usersCreateForm.username" class="input" autocomplete="off" />
            </label>
            <label class="field">
              <span class="field-label">{{ tm.settings.usersFieldRole }} *</span>
              <BaseSelect
                v-model="usersCreateForm.role"
                :options="usersRoleOptions"
                :placeholder="tm.settings.usersFieldRole"
              />
            </label>
            <label class="field">
              <span class="field-label">{{ tm.settings.usersFieldCredits }}</span>
              <input
                v-model.number="usersCreateForm.credits"
                type="number"
                min="0"
                step="1"
                class="input"
              />
            </label>
            <label class="field">
              <span class="field-label">{{ tm.settings.usersFieldAutoPassword }}</span>
              <input v-model="usersCreateForm.password" type="text" class="input" :placeholder="tm.settings.usersFieldAutoPassword" autocomplete="off" />
            </label>
            <p class="users-hint">{{ tm.settings.usersInitialPasswordHint }}</p>

            <div v-if="usersCreatedPassword" class="users-password-card">
              <code class="users-password-text">{{ usersCreatedPassword }}</code>
              <button type="button" class="btn btn-sm" @click="copyUsersPassword">
                <Copy :size="12" /> {{ tm.settings.usersCopyPassword }}
              </button>
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn" @click="closeUsersSheet">{{ tm.common.cancel }}</button>
            <button type="submit" class="btn btn-primary" :disabled="usersCreateSaving">
              <Loader2 v-if="usersCreateSaving" :size="12" class="spin" />
              {{ usersCreateSaving ? tm.common.saving : tm.settings.usersCreate }}
            </button>
          </div>
        </form>
      </div>

      <!-- ===== 编辑账号弹窗（角色 / 积分） ===== -->
      <div v-if="usersEditSheetOpen" class="overlay">
        <form class="modal card users-modal" @submit.prevent="submitUsersEdit">
          <div class="modal-head-simple">
            <h2 class="modal-title">{{ tm.settings.usersEditing }} · {{ usersEditing?.username }}</h2>
            <button type="button" class="modal-close-btn" :aria-label="tm.common.closeAria" @click="closeUsersSheet">
              <X :size="18" :stroke-width="2" />
            </button>
          </div>
          <div class="users-modal-body">
            <p v-if="usersEditingIsSelf" class="users-hint">{{ tm.settings.usersCannotEditSelfCredits }}</p>
            <label class="field">
              <span class="field-label">{{ tm.settings.usersFieldRole }} *</span>
              <BaseSelect
                v-model="usersEditForm.role"
                :options="usersRoleOptions"
                :placeholder="tm.settings.usersFieldRole"
              />
            </label>
            <label class="field">
              <span class="field-label">{{ tm.settings.usersFieldCredits }}（绝对值）</span>
              <input
                v-model.number="usersEditForm.credits"
                type="number"
                min="0"
                step="1"
                class="input"
                :disabled="usersEditingIsSelf"
              />
            </label>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn" @click="closeUsersSheet">{{ tm.common.cancel }}</button>
            <button type="submit" class="btn btn-primary" :disabled="usersEditSaving">
              <Loader2 v-if="usersEditSaving" :size="12" class="spin" />
              {{ usersEditSaving ? tm.common.saving : tm.common.save }}
            </button>
          </div>
        </form>
      </div>

      <!-- ===== 删除确认 ===== -->
      <div v-if="usersDeleteTarget" class="overlay">
        <form class="modal card users-modal users-modal-sm" @submit.prevent="submitUsersDelete">
          <div class="modal-head-simple">
            <h2 class="modal-title">{{ tm.settings.usersConfirmDelete }}</h2>
            <button type="button" class="modal-close-btn" :aria-label="tm.common.closeAria" @click="usersDeleteTarget = null">
              <X :size="18" :stroke-width="2" />
            </button>
          </div>
          <div class="users-modal-body">
            <p class="users-delete-target">{{ usersDeleteTarget.username }} (#{{ usersDeleteTarget.id }})</p>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn" @click="usersDeleteTarget = null">{{ tm.common.cancel }}</button>
            <button type="submit" class="btn btn-danger" :disabled="usersDeleteSaving">
              <Loader2 v-if="usersDeleteSaving" :size="12" class="spin" />
              {{ tm.common.delete }}
            </button>
          </div>
        </form>
      </div>

      <!-- ===== Skills 编辑 ===== -->
      <div v-else-if="tab === 'skills'" class="skills-layout">
        <!-- Agent 左侧列表 -->
        <aside class="skills-agent-list">
          <div class="skills-agent-title">{{ tm.settings.skillsAgentListTitle }}</div>
          <div class="agent-kind-tabs skills-kind-tabs">
            <button
              v-for="k in agentCatalogKindTabs"
              :key="k.id"
              type="button"
              :class="['agent-kind-tab', { active: agentCatalogKind === k.id }]"
              @click="switchAgentCatalogKind(k.id)"
            >{{ k.label }}</button>
          </div>
          <button
            v-for="a in visibleAgentDefinitions"
            :key="a.type"
            :class="['skills-agent-item', { active: selectedAgent === a.type }]"
            @click="switchActiveAgentType(a.type)"
          >
            <span class="agent-type-badge">{{ a.icon }}</span>
            <span class="skills-agent-label">{{ a.label }}</span>
            <span v-if="countSkillsForAgent(a.type) > 0" class="skill-count-badge">{{ countSkillsForAgent(a.type) }}</span>
          </button>
        </aside>

        <!-- Skill 管理右侧主区域 -->
        <div class="settings-scroll skills-main">
          <div class="settings-head">
            <div class="settings-brand">
              <div class="settings-brand-mark">
                <img v-if="brandLogoVisible" :src="brandLogo" :alt="tm.brand.logoAlt" class="settings-brand-logo" @error="brandLogoVisible = false" />
                <span v-else class="settings-brand-fallback">{{ (tm.brand.name || '').charAt(0) }}</span>
              </div>
              <div class="settings-brand-copy">
                <div class="settings-brand-kicker">{{ tm.brand.sub }}</div>
                <div class="settings-brand-name">{{ tm.brand.name }}</div>
              </div>
            </div>
            <div class="settings-head-row">
              <div class="settings-title-block">
                <div class="settings-title-row">
                  <span class="agent-type-badge agent-type-badge-lg">{{ activeAgentTypeIcon }}</span>
                  <div>
                    <h2 class="settings-title settings-title-tight">{{ activeAgentTypeLabel }}</h2>
                    <div class="settings-skills-kicker dim">{{ activeAgentTypeKey }} — Skills</div>
                  </div>
                </div>
                <p class="settings-desc settings-desc-spaced">{{ tm.settings.skillsPageIntro }}</p>
                <p class="settings-desc dim settings-desc-spaced">{{ tm.settings.skillsIdHint }}</p>
              </div>
              <div class="settings-head-actions">
                <label class="skill-upload-overwrite dim">
                  <input type="checkbox" v-model="skillUploadReplaceExisting" />
                  {{ tm.settings.skillUploadReplaceExisting }}
                </label>
                <button
                  type="button"
                  class="btn btn-sm"
                  :disabled="skillUploadBusy"
                  @click="skillFileInputRef?.click()"
                >
                  {{ skillUploadBusy ? tm.settings.uploadingSkill : tm.settings.uploadSkill }}
                </button>
                <button type="button" class="btn btn-primary btn-sm" @click="openAddSkillSheet">
                  <Plus :size="13" /> {{ tm.settings.addSkill }}
                </button>
                <input
                  ref="skillFileInputRef"
                  type="file"
                  class="file-native"
                  accept=".md,.zip,application/zip"
                  @change="handleSkillFileUpload"
                />
              </div>
            </div>
            <p class="settings-desc dim settings-desc-spaced">{{ tm.settings.skillUploadHint }}</p>
          </div>

          <!-- 无 skill 提示 -->
          <div v-if="!visibleSkillsForAgent.length" class="step-empty skills-empty">
            <div class="empty-visual">
              <FileText :size="28" />
            </div>
            <div class="empty-title">{{ tm.settings.skillsEmptyTitle }}</div>
            <div class="empty-desc">{{ tm.settings.skillsEmptyDesc }}</div>
          </div>

          <!-- Skill 列表 -->
          <div class="skill-list" v-else>
            <div v-for="s in visibleSkillsForAgent" :key="s.id" class="card skill-card">
              <div class="skill-card-head" @click="toggleSkillEditMode(s.id)">
                <FileText :size="14" class="skill-card-icon" />
                <div class="skill-card-titles">
                  <div class="skill-card-title">{{ s.name }}</div>
                  <div class="skill-card-desc dim">{{ s.description }}</div>
                </div>
                <button type="button" class="btn btn-ghost btn-icon skill-card-delete" @click.stop="removeSkillEntry(s.id)">
                  <Trash2 :size="13" />
                </button>
                <ChevronDown :size="14" :style="{ transform: editingSkillId === s.id ? 'rotate(180deg)' : '', transition: '0.2s' }" />
              </div>
              <div v-if="editingSkillId === s.id" class="skill-card-body">
                <textarea
                  v-model="skillMarkdownDraft"
                  class="textarea mono"
                  rows="20"
                  style="font-size:12px;line-height:1.6"
                  :placeholder="tm.settings.skillBodyPlaceholder"
                />
                <div class="skill-card-foot">
                  <span class="dim" style="font-size:11px">agent-skills/{{ s.id }}/SKILL.md</span>
                  <span v-if="skillPersistAck === s.id" class="tag tag-success" style="margin-left:8px">
                    <Check :size="10" /> {{ tm.settings.tagSaved }}
                  </span>
                  <button class="btn btn-primary btn-sm ml-auto" :disabled="skillPersistBusy" @click="persistSkillEntry(s.id)">
                    <Loader2 v-if="skillPersistBusy" :size="12" class="animate-spin" />
                    {{ tm.settings.save }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 生成经验 ===== -->
      <div v-else-if="tab === 'lessons'" class="skills-layout">
        <aside class="skills-agent-list">
          <div class="skills-agent-title">{{ tm.settings.lessonsAgentListTitle }}</div>
          <div class="agent-kind-tabs skills-kind-tabs">
            <button
              v-for="k in agentCatalogKindTabs"
              :key="k.id"
              type="button"
              :class="['agent-kind-tab', { active: lessonCatalogKind === k.id }]"
              @click="switchLessonCatalogKind(k.id)"
            >{{ k.label }}</button>
          </div>
          <button
            :class="['skills-agent-item', { active: activeLessonAgentKey === '__global__' }]"
            @click="switchActiveLessonAgent('__global__')"
          >
            <span class="agent-type-badge">🌐</span>
            <span class="skills-agent-label">{{ tm.settings.lessonsGlobalScope }}</span>
            <span v-if="lessonCountForAgent('__global__') > 0" class="skill-count-badge">{{ lessonCountForAgent('__global__') }}</span>
          </button>
          <button
            v-for="a in visibleLessonAgentDefs"
            :key="a.type"
            :class="['skills-agent-item', { active: activeLessonAgentKey === a.type }]"
            @click="switchActiveLessonAgent(a.type)"
          >
            <span class="agent-type-badge">{{ a.icon }}</span>
            <span class="skills-agent-label">{{ a.label }}</span>
            <span v-if="lessonCountForAgent(a.type) > 0" class="skill-count-badge">{{ lessonCountForAgent(a.type) }}</span>
          </button>
        </aside>

        <div class="settings-scroll skills-main">
          <div class="settings-head">
            <div class="settings-head-row">
              <div class="settings-title-block">
                <h2 class="settings-title settings-title-tight">{{ tm.settings.tabLessons }}</h2>
                <p class="settings-desc settings-desc-spaced">{{ tm.settings.lessonsPageIntro }}</p>
                <div class="lesson-verdict-tabs">
                  <button
                    v-for="v in lessonOutcomeTabs"
                    :key="v.id"
                    type="button"
                    :class="['agent-kind-tab', { active: lessonOutcomeFilter === v.id }]"
                    @click="lessonOutcomeFilter = v.id"
                  >{{ v.label }}</button>
                </div>
              </div>
              <div class="settings-head-actions">
                <button type="button" class="btn btn-ghost btn-sm" @click="startExtractLessons">
                  <Sparkles :size="13" /> {{ tm.settings.lessonsExtract }}
                </button>
                <button type="button" class="btn btn-primary btn-sm" @click="startAddLesson">
                  <Plus :size="13" /> {{ tm.settings.lessonsAdd }}
                </button>
              </div>
            </div>
          </div>

          <div v-if="!filteredLessons.length" class="step-empty skills-empty">
            <div class="empty-visual"><Lightbulb :size="28" /></div>
            <div class="empty-title">{{ tm.settings.lessonsEmptyTitle }}</div>
            <div class="empty-desc">{{ tm.settings.lessonsEmptyDesc }}</div>
          </div>

          <div v-else class="lesson-list">
            <div v-for="l in filteredLessons" :key="l.id" class="card lesson-card">
              <div class="lesson-card-head">
                <span :class="['tag', l.verdict === 'avoid' ? 'tag-error' : 'tag-success']">
                  {{ l.verdict === 'avoid' ? tm.settings.lessonsVerdictAvoid : tm.settings.lessonsVerdictRecommend }}
                </span>
                <div class="lesson-card-titles">
                  <div class="lesson-card-title">{{ l.title }}</div>
                  <div class="lesson-card-meta dim">
                    {{ formatLessonScopeLabel(l.project_kind) }}
                    · {{ l.agent_type || tm.settings.lessonAppliesGlobal }}
                    <template v-if="l.tags?.length"> · {{ l.tags.join(' · ') }}</template>
                  </div>
                </div>
                <label class="toggle lesson-active-toggle" :title="tm.settings.lessonsActiveLabel">
                  <input type="checkbox" :checked="l.is_active" @change="toggleLessonActive(l)" />
                  <span />
                </label>
                <button type="button" class="btn btn-ghost btn-icon" @click="startEditLesson(l)">
                  <Pencil :size="13" />
                </button>
                <button type="button" class="btn btn-ghost btn-icon" @click="deleteLesson(l)">
                  <Trash2 :size="13" />
                </button>
              </div>
              <p class="lesson-card-body dim">{{ l.content }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    </template>

    <!-- AI Config Dialog -->
    <div v-if="serviceConfigSheetOpen" class="overlay">
      <form class="modal card config-modal" @submit.prevent="saveServiceConfigRow">
        <div class="config-modal-head">
          <div class="config-modal-head-main">
            <div class="setup-kicker">{{ serviceConfigEditingId ? tm.settings.editConfig : tm.settings.newConfig }}</div>
            <h2 class="modal-title">{{ serviceConfigEditingId ? tm.settings.editService : tx(tm.settings.addService, { service: serviceTypeMeta[serviceConfigFormState.service_type].label }) }}</h2>
            <div class="modal-note">{{ tm.settings.pickTemplateFirst }}</div>
          </div>
          <div class="config-modal-head-trailing">
            <span class="tag tag-accent">{{ serviceTypeMeta[serviceConfigFormState.service_type].label }}</span>
            <button type="button" class="modal-close-btn" :aria-label="tm.common.closeAria" @click="serviceConfigSheetOpen = false">
              <X :size="18" :stroke-width="2" />
            </button>
          </div>
        </div>
        <div class="preset-picker">
          <button
            v-for="preset in presetCatalogForServiceType(serviceConfigFormState.service_type)"
            :key="`${serviceConfigFormState.service_type}-${preset.label}-${preset.provider}`"
            type="button"
            class="preset-pill"
            @click="applyServiceProviderPreset(serviceConfigFormState.service_type, preset)"
          >
            {{ preset.label }}
            <span v-if="serviceConfigFormState.service_type !== 'text'" class="preset-pill-credit">· {{ preset.creditCost || 0 }} {{ tm.settings.creditsPerRun }}</span>
          </button>
        </div>
        <label class="field">
          <span class="field-label">{{ tm.settings.configName }}</span>
          <input v-model="serviceConfigFormState.name" class="input" :placeholder="tm.settings.phConfigNameExample" />
        </label>
        <label class="field"><span class="field-label">{{ tm.settings.provider }}</span>
          <BaseSelect v-model="serviceConfigFormState.provider" :options="providerPickerOptions" :placeholder="tm.settings.selectProvider" searchable />
        </label>
        <label class="field">
          <span class="field-label">{{ tm.settings.priority }}</span>
          <input v-model.number="serviceConfigFormState.priority" class="input" type="number" min="0" max="999" />
          <span class="field-hint">{{ tm.settings.priorityHint }}</span>
        </label>
        <label class="field"><span class="field-label">{{ tm.settings.apiKey }}</span><input v-model="serviceConfigFormState.api_key" class="input" type="password" :placeholder="tm.settings.apiKeyPlaceholder" /></label>
        <label class="field"><span class="field-label">{{ tm.settings.baseUrl }}</span><input v-model="serviceConfigFormState.base_url" class="input" :placeholder="tm.settings.baseUrlExamplePlaceholder" /></label>
        <div class="endpoint-hint">
          <span class="dim">{{ tm.settings.endpointPrefixLabel }}</span>
          <span class="mono">{{ providerEndpointHint }}</span>
        </div>
        <p v-if="imageHuohuoDoubaoMismatchHint" class="field-hint field-hint-warn">{{ imageHuohuoDoubaoMismatchHint }}</p>
        <label class="field"><span class="field-label">{{ tm.settings.models }}</span><input v-model="serviceConfigFormState.modelStr" class="input" :placeholder="tm.settings.modelsPlaceholder" /></label>
        <div v-if="serviceConfigFormState.service_type === 'text'" class="field-row">
          <label class="field">
            <span class="field-label">{{ tm.settings.creditTokenUnit }}</span>
            <input v-model.number="serviceConfigFormState.credit_token_unit" class="input" type="number" min="1" step="1" />
          </label>
          <label class="field">
            <span class="field-label">{{ tm.settings.creditTokenCost }}</span>
            <input v-model.number="serviceConfigFormState.credit_token_cost" class="input" type="number" min="0" step="1" />
          </label>
        </div>
        <label v-if="serviceConfigFormState.service_type === 'text'" class="field">
          <span class="field-label">{{ tm.settings.perplexityModel }}</span>
          <input v-model="serviceConfigFormState.perplexity_model" class="input" :placeholder="tm.settings.perplexityModelPlaceholder" />
        </label>
        <div v-if="serviceConfigFormState.service_type === 'text'" class="field-switch-row">
          <div class="field-switch-copy">
            <span class="field-label">{{ tm.settings.enableThinking }}</span>
            <p class="field-hint">{{ tm.settings.enableThinkingHint }}</p>
          </div>
          <label class="toggle">
            <input v-model="serviceConfigFormState.enable_thinking" type="checkbox" />
            <span />
          </label>
        </div>
        <p v-if="serviceConfigFormState.service_type === 'text'" class="field-hint">{{ tm.settings.creditTokenHint }}</p>
        <p v-if="serviceConfigFormState.service_type === 'text'" class="field-hint">{{ tm.settings.perplexityModelHint }}</p>
        <label v-else class="field">
          <span class="field-label">{{ tm.settings.creditCost }}</span>
          <input v-model.number="serviceConfigFormState.credit_cost" class="input" type="number" min="0" step="1" />
        </label>
        <div v-if="serviceConfigProbeOutcome" class="test-result" :class="{ ok: serviceConfigProbeOutcome.reachable, bad: !serviceConfigProbeOutcome.reachable }">
          <div class="test-result-head">
            <span class="tag" :class="serviceConfigProbeOutcome.reachable ? 'tag-success' : 'tag-error'">{{ serviceConfigProbeOutcome.status || 'ERROR' }}</span>
            <span>{{ serviceConfigProbeOutcome.message }}</span>
          </div>
          <div class="mono test-result-url">{{ serviceConfigProbeOutcome.method }} {{ serviceConfigProbeOutcome.url }}</div>
          <div v-if="serviceConfigProbeOutcome.response_preview" class="mono test-result-preview">{{ serviceConfigProbeOutcome.response_preview }}</div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" :disabled="serviceConfigProbeBusy" @click="probeDraftServiceConfig">
            <Loader2 v-if="serviceConfigProbeBusy" :size="12" class="animate-spin" />
            <span>{{ serviceConfigProbeBusy ? tm.settings.testing : tm.settings.testConfig }}</span>
          </button>
          <button type="button" class="btn" @click="serviceConfigSheetOpen = false">{{ tm.settings.cancel }}</button>
          <button type="submit" class="btn btn-primary">{{ tm.settings.save }}</button>
        </div>
      </form>
    </div>

    <!-- Huohuo Preset Dialog -->
    <div v-if="bundledPresetSheetOpen" class="overlay">
      <form class="modal card config-modal" @submit.prevent="applyBundledPlatformPreset">
        <div class="config-modal-head">
          <div class="config-modal-head-main">
            <div class="setup-kicker">{{ tm.settings.huohuoPresetKicker }}</div>
            <h2 class="modal-title">{{ tm.settings.huohuoPresetModalTitle }}</h2>
            <div class="modal-note">{{ tm.settings.huohuoPresetModalNote }}</div>
            <div class="modal-note">{{ tm.settings.huohuoPresetEditHint }}</div>
          </div>
          <div class="config-modal-head-trailing">
            <span class="tag tag-success">{{ tm.settings.tagRecommended }}</span>
            <button type="button" class="modal-close-btn" :aria-label="tm.common.closeAria" @click="bundledPresetSheetOpen = false">
              <X :size="18" :stroke-width="2" />
            </button>
          </div>
        </div>
        <div class="huohuo-grid">
          <label class="field">
            <span class="field-label">{{ tm.settings.huohuoApiKeyLine }} <span class="dim">({{ tm.settings.huohuoApiHint }})</span></span>
            <input v-model="bundledPresetKeyForm.apiKey" class="input" type="password" :placeholder="tm.settings.huohuoApiPlaceholder" />
            <div class="field-hint preset-bulk-hint">
              <span>{{ tm.settings.presetBulkFillHint }}</span>
              <button type="button" class="btn btn-ghost btn-sm" :disabled="!bundledPresetKeyForm.apiKey" @click="bulkFillPresetApiKey">{{ tm.settings.presetBulkFillAction }}</button>
            </div>
            <span class="field-hint">{{ tm.settings.huohuoPresetRegisterHint }}<a href="https://huo.hcpzy.com/" target="_blank" rel="noopener">{{ tm.settings.huohuoPresetRegisterLink }}</a></span>
          </label>
          <label v-if="isAdmin" class="field preset-policy-field">
            <span class="field-label">{{ tm.settings.presetCreditBillingLabel }}</span>
            <label class="toggle preset-policy-toggle">
              <input v-model="presetCreditBillingEnabled" type="checkbox" @change="savePresetPolicySetting" />
              <span />
            </label>
            <span class="field-hint">{{ tm.settings.presetCreditBillingHint }}</span>
          </label>
        </div>
        <!--
          4 张服务预设卡片 + 1 张 Agent 模型卡片，每张可点击「编辑」展开行内表单。
          每张服务卡片的编辑表单里都能填 api_key + 测连通性（参考添加模型时 probeDraftServiceConfig）。
          编辑时只改内存 (bundledPresetEditForms)，点「保存编辑」才批量 PUT 写 DB。
        -->
        <div class="preset-grid compact">
          <article v-for="preset in bundledPresetCardRows" :key="preset.presetKey" class="preset-card">
            <div class="preset-card-top">
              <span class="preset-service">{{ preset.label }}</span>
              <span class="tag tag-accent">{{ preset.provider }}</span>
              <span class="tag tag-soft">{{ sourceTagLabel(preset.source) }}</span>
            </div>
            <div v-if="preset.editing" class="preset-edit-form">
              <label class="field">
                <span class="field-label">Base URL</span>
                <input v-model="preset.editForm.base_url" class="input mono" placeholder="https://huo.hcpzy.com/v1" :readonly="!presetCanEditPlatformFields" />
              </label>
              <label class="field">
                <span class="field-label">Provider</span>
                <input v-model="preset.editForm.provider" class="input mono" placeholder="huohuo" :readonly="!presetCanEditPlatformFields" />
              </label>
              <label class="field">
                <span class="field-label">API Key <span class="dim">({{ tm.settings.presetApiKeyHint }})</span></span>
                <input v-model="preset.editForm.api_key" class="input mono" type="password" :placeholder="preset.apiKey ? tm.settings.presetApiKeyKeep : tm.settings.huohuoApiPlaceholder" />
              </label>
              <label class="field">
                <span class="field-label">Model</span>
                <input v-model="preset.editForm.model" class="input mono" placeholder="gemini-3-pro-preview" />
              </label>
              <div v-if="preset.probeOutcome" class="test-result" :class="{ ok: preset.probeOutcome.reachable, bad: !preset.probeOutcome.reachable }">
                <div class="test-result-head">
                  <span class="tag" :class="preset.probeOutcome.reachable ? 'tag-success' : 'tag-error'">{{ preset.probeOutcome.status || 'ERROR' }}</span>
                  <span>{{ preset.probeOutcome.message }}</span>
                </div>
                <div class="mono test-result-url">{{ preset.probeOutcome.method }} {{ preset.probeOutcome.url }}</div>
                <div v-if="preset.probeOutcome.response_preview" class="mono test-result-preview">{{ preset.probeOutcome.response_preview }}</div>
              </div>
              <div class="preset-edit-actions">
                <button type="button" class="btn btn-ghost btn-sm" :disabled="preset.probing" @click="probePresetCard(preset)">
                  <Loader2 v-if="preset.probing" :size="12" class="animate-spin" />
                  <span>{{ preset.probing ? tm.settings.testing : tm.settings.testConfig }}</span>
                </button>
                <span class="preset-edit-spacer" />
                <button type="button" class="btn btn-ghost btn-sm" @click="cancelPresetEdit(preset)">{{ tm.settings.cancel }}</button>
                <button type="button" class="btn btn-primary btn-sm" :disabled="preset.saving" @click="savePresetEdit(preset)">
                  {{ preset.saving ? tm.settings.saving : tm.settings.save }}
                </button>
              </div>
            </div>
            <div v-else class="preset-card-body">
              <div class="preset-model mono">{{ preset.model }}</div>
              <div class="preset-base mono">{{ preset.baseUrl }}</div>
              <div class="preset-key mono dim">{{ preset.apiKey ? maskApiKey(preset.apiKey) : tm.settings.presetApiKeyMissing }}</div>
              <button type="button" class="btn btn-ghost btn-sm preset-edit-btn" @click="startPresetEdit(preset)">{{ tm.settings.edit }}</button>
            </div>
          </article>
          <!-- Agent 模型行：只编辑 model 字段，没有 provider / baseUrl / apiKey -->
          <article v-if="bundledPresetAgent" class="preset-card preset-card-agent">
            <div class="preset-card-top">
              <span class="preset-service">{{ bundledPresetAgent.label }}</span>
              <span class="tag tag-soft">{{ sourceTagLabel(bundledPresetAgent.source) }}</span>
            </div>
            <div v-if="bundledPresetAgent.editing" class="preset-edit-form">
              <label class="field">
                <span class="field-label">Agent Model</span>
                <input v-model="bundledPresetAgent.editForm.model" class="input mono" placeholder="gemini-3-pro-preview" />
              </label>
              <div class="preset-edit-actions">
                <button type="button" class="btn btn-ghost btn-sm" @click="cancelPresetEdit(bundledPresetAgent)">{{ tm.settings.cancel }}</button>
                <button type="button" class="btn btn-primary btn-sm" :disabled="bundledPresetAgent.saving" @click="savePresetEdit(bundledPresetAgent)">
                  {{ bundledPresetAgent.saving ? tm.settings.saving : tm.settings.save }}
                </button>
              </div>
            </div>
            <div v-else class="preset-card-body">
              <div class="preset-model mono">{{ bundledPresetAgent.model }}</div>
              <button type="button" class="btn btn-ghost btn-sm preset-edit-btn" @click="startPresetEdit(bundledPresetAgent)">{{ tm.settings.edit }}</button>
            </div>
          </article>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn" @click="bundledPresetSheetOpen = false">{{ tm.settings.cancel }}</button>
          <button type="submit" class="btn btn-primary">{{ tm.settings.createAndEnable }}</button>
        </div>
      </form>
    </div>

    <!-- Lesson Extract Dialog -->
    <div v-if="extractDialog" class="overlay">
      <form class="modal card lesson-modal lesson-extract-modal" @submit.prevent="runLessonExtract">
        <div class="modal-head-simple">
          <h2 class="modal-title">{{ tm.settings.lessonsExtractTitle }}</h2>
          <button type="button" class="modal-close-btn" :aria-label="tm.common.closeAria" @click="extractDialog = false">
            <X :size="18" :stroke-width="2" />
          </button>
        </div>
        <p class="settings-desc settings-desc-spaced">{{ tm.settings.lessonsExtractDesc }}</p>
        <label class="field">
          <span class="field-label">{{ tm.settings.lessonsExtractProject }}</span>
          <BaseSelect
            v-model="extractForm.drama_id"
            :options="extractProjectOptions"
            :placeholder="tm.settings.lessonsExtractProjectPh"
            searchable
          />
        </label>
        <label class="field">
          <span class="field-label">{{ tm.settings.lessonsExtractHint }}</span>
          <textarea v-model="extractForm.hint" class="textarea" rows="2" :placeholder="tm.settings.lessonsExtractHintPh" />
        </label>
        <div v-if="extractedLessons.length" class="extract-preview">
          <div class="extract-preview-head">
            <span class="field-label">{{ extractResultTitle }}</span>
            <button type="button" class="btn btn-ghost btn-sm" @click="toggleExtractSelectAll">
              {{ tm.settings.lessonsExtractSelectAll }}
            </button>
          </div>
          <div class="extract-preview-list">
            <label v-for="(item, idx) in extractedLessons" :key="idx" class="card extract-preview-item">
              <input v-model="extractSelected" type="checkbox" :value="idx" class="extract-check" />
              <div class="extract-preview-body">
                <div class="extract-preview-top">
                  <span :class="['tag', item.verdict === 'avoid' ? 'tag-error' : 'tag-success']">
                    {{ item.verdict === 'avoid' ? tm.settings.lessonsVerdictAvoid : tm.settings.lessonsVerdictRecommend }}
                  </span>
                  <span class="lesson-card-title">{{ item.title }}</span>
                </div>
                <p class="dim extract-preview-content">{{ item.content }}</p>
                <div class="dim extract-preview-meta">
                  {{ formatLessonScopeLabel(item.project_kind) }}
                  · {{ item.agent_type || tm.settings.lessonAppliesGlobal }}
                  <template v-if="item.tags?.length"> · {{ item.tags.join(' · ') }}</template>
                </div>
              </div>
            </label>
          </div>
        </div>
        <div v-else-if="extractDone && !extracting" class="step-empty extract-empty">
          <div class="empty-desc">{{ tm.settings.lessonsExtractEmpty }}</div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn" @click="extractDialog = false">{{ tm.settings.cancel }}</button>
          <button
            v-if="extractedLessons.length"
            type="button"
            class="btn btn-primary"
            :disabled="!extractSelected.length || extractSaving"
            @click="importExtractedLessons"
          >
            <Loader2 v-if="extractSaving" :size="12" class="animate-spin" />
            {{ tm.settings.lessonsExtractSave }} ({{ extractSelected.length }})
          </button>
          <button v-else type="submit" class="btn btn-primary" :disabled="!extractForm.drama_id || extracting">
            <Loader2 v-if="extracting" :size="12" class="animate-spin" />
            {{ extracting ? tm.settings.lessonsExtracting : tm.settings.lessonsExtractRun }}
          </button>
        </div>
      </form>
    </div>

    <!-- Lesson Dialog -->
    <div v-if="lessonEditorSheetOpen" class="overlay">
      <form class="modal card lesson-modal" @submit.prevent="saveLesson">
        <div class="modal-head-simple">
          <h2 class="modal-title">{{ lessonEditorRowId ? tm.settings.lessonsEditTitle : tm.settings.lessonsAddTitle }}</h2>
          <button type="button" class="modal-close-btn" :aria-label="tm.common.closeAria" @click="lessonEditorSheetOpen = false">
            <X :size="18" :stroke-width="2" />
          </button>
        </div>
        <label class="field">
          <span class="field-label">{{ tm.settings.lessonsTitleLabel }}</span>
          <input v-model="lessonEditorFormState.title" class="input" :placeholder="tm.settings.phLessonTitle" required />
        </label>
        <label class="field">
          <span class="field-label">{{ tm.settings.lessonsContentLabel }}</span>
          <textarea v-model="lessonEditorFormState.content" class="textarea" rows="5" :placeholder="tm.settings.phLessonContent" required />
        </label>
        <div class="field-row">
          <label class="field">
            <span class="field-label">{{ tm.settings.lessonsVerdictLabel }}</span>
            <BaseSelect v-model="lessonEditorFormState.verdict" :options="lessonOutcomeOptions" />
          </label>
          <label class="field">
            <span class="field-label">{{ tm.settings.lessonsProjectKindLabel }}</span>
            <BaseSelect v-model="lessonEditorFormState.project_kind" :options="lessonProjectKindPicker" />
          </label>
        </div>
        <label class="field">
          <span class="field-label">{{ tm.settings.lessonsAgentTypeLabel }}</span>
          <BaseSelect
            v-model="lessonEditorFormState.agent_type"
            :options="lessonAgentTypePicker"
            :placeholder="tm.settings.lessonsAgentTypeGlobal"
          />
        </label>
        <div class="field-row lesson-tags-row">
          <label class="field">
            <span class="field-label">{{ tm.settings.lessonsTagsLabel }} <span class="dim">{{ tm.settings.lessonsTagsHint }}</span></span>
            <input v-model="lessonEditorFormState.tagsStr" class="input" :placeholder="tm.settings.phLessonTags" />
          </label>
          <label class="field lesson-sort-field">
            <span class="field-label">{{ tm.settings.lessonsSortOrderLabel }}</span>
            <input v-model.number="lessonEditorFormState.sort_order" class="input" type="number" min="0" step="1" />
          </label>
        </div>
        <div class="field">
          <span class="field-label">{{ tm.settings.lessonsActiveLabel }}</span>
          <label class="toggle lesson-active-toggle"><input type="checkbox" v-model="lessonEditorFormState.is_active"><span /></label>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn" @click="lessonEditorSheetOpen = false">{{ tm.settings.cancel }}</button>
          <button type="submit" class="btn btn-primary" :disabled="lessonPersistBusy">
            <Loader2 v-if="lessonPersistBusy" :size="12" class="animate-spin" />
            {{ tm.settings.save }}
          </button>
        </div>
      </form>
    </div>

    <!-- Add Skill Dialog -->
    <div v-if="addSkillSheetOpen" class="overlay">
      <form class="modal card" @submit.prevent="submitNewSkillEntry">
        <div class="modal-head-simple">
          <h2 class="modal-title">{{ tx(tm.settings.addSkillModalTitle, { agent: activeAgentTypeLabel }) }}</h2>
          <button type="button" class="modal-close-btn" :aria-label="tm.common.closeAria" @click="addSkillSheetOpen = false">
            <X :size="18" :stroke-width="2" />
          </button>
        </div>
        <label class="field">
          <span class="field-label">{{ tm.settings.skillFolderLabel }} <span class="dim">{{ tm.settings.skillFolderHint }}</span></span>
          <input v-model="newSkillFormState.id" class="input" :placeholder="tm.settings.phSkillFolder" />
        </label>
        <label class="field">
          <span class="field-label">{{ tm.settings.skillNameLabel }}</span>
          <input v-model="newSkillFormState.name" class="input" :placeholder="tm.settings.phSkillName" />
        </label>
        <label class="field">
          <span class="field-label">{{ tm.settings.skillDescLabel }}</span>
          <input v-model="newSkillFormState.description" class="input" :placeholder="tm.settings.phSkillDesc" />
        </label>
        <div class="modal-actions">
          <button type="button" class="btn" @click="addSkillSheetOpen = false">{{ tm.settings.cancel }}</button>
          <button type="submit" class="btn btn-primary" :disabled="!newSkillFormState.id">{{ tm.settings.create }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ name: 'settings', keepalive: true })

import { Plus, Pencil, Trash2, FileText, ChevronDown, Check, Loader2, Bot, Cpu, Sparkles, X, Lightbulb, LayoutGrid, KeyRound, Users, Copy } from 'lucide-vue-next'
import BaseSelect from '~/components/base-select.vue'
import AdminUserSearchPicker from '~/components/admin-user-search-picker.vue'
import { toast } from 'vue-sonner'
import { aiConfigAPI, agentConfigAPI, authAPI, dramaAPI, generationLessonsAPI, paymentAPI, skillsAPI } from '~/composables/use-api'
import type { AdminUserAccessRow } from '~/composables/use-api'
import brandLogo from '~/assets/huohuo-logo.png'
import { useAuth } from '~/composables/useAuth'
import { useNavModules } from '~/composables/use-nav-modules'
import { runAdminSettingsBootstrap, useSessionCache } from '~/composables/use-session-cache'
import { useI18n, tx } from '~/composables/use-i18n'

const { messages: tm, init } = useI18n()

// ── 页面壳层：侧栏 Tab / 账户 / 导航权限 ───────────────────
const brandLogoVisible = ref(true)
const tab = ref('account')
const advancedSectionOpen = ref(true)
const { user, applyUserProfile } = useAuth()
const isAdmin = computed(() => user.value?.role === 'admin')
const preferredTextConfigId = ref(null)
const preferredImageConfigId = ref(null)
const preferredVideoConfigId = ref(null)
const preferredAudioConfigId = ref(null)
const textConfigPickerRows = ref([])
const imageConfigPickerRows = ref([])
const videoConfigPickerRows = ref([])
const audioConfigPickerRows = ref([])
const accountSettingsTabs = computed(() => {
  const base = [
    { id: 'account', label: tm.value.settings.tabAccount, icon: KeyRound },
    { id: 'ai', label: tm.value.settings.tabAi, icon: Cpu },
    { id: 'nav', label: tm.value.settings.tabNav, icon: LayoutGrid },
    { id: 'payments', label: tm.value.settings.tabPayments, icon: Cpu },
  ]
  if (isAdmin.value) {
    base.push({ id: 'users', label: tm.value.settings.tabUsers, icon: Users })
  }
  return base
})
// ── 平台账号管理（管理员）─────────────────────────────────
const usersList = ref<AdminUserAccessRow[]>([])
const usersListLoading = ref(false)
const usersCreateSheetOpen = ref(false)
const usersEditSheetOpen = ref(false)
const usersDeleteTarget = ref<AdminUserAccessRow | null>(null)
const usersEditing = ref<AdminUserAccessRow | null>(null)
const usersCreateForm = ref<{ username: string; password: string; role: string; credits: number }>({
  username: '',
  password: '',
  role: 'user',
  credits: 0,
})
const usersEditForm = ref<{ role: string; credits: number }>({ role: 'user', credits: 0 })
const usersCreateSaving = ref(false)
const usersEditSaving = ref(false)
const usersDeleteSaving = ref(false)
const usersCreatedPassword = ref('')
const usersRoleOptions = computed(() => [
  { value: 'admin', label: tm.value.settings.usersRoleAdmin },
  { value: 'user', label: tm.value.settings.usersRoleUser },
])
const usersEditingIsSelf = computed(() => usersEditing.value?.id === user.value?.id)

async function loadUsersList() {
  usersListLoading.value = true
  try {
    usersList.value = await authAPI.adminUsers()
  } catch (err) {
    toast.error(tm.value.settings.usersLoadFailed)
    console.error('adminUsers failed', err)
  } finally {
    usersListLoading.value = false
  }
}

function roleLabel(role: string) {
  if (role === 'admin') return tm.value.settings.usersRoleAdmin
  return tm.value.settings.usersRoleUser
}

function formatCredits(n: number) {
  return Number(n || 0).toLocaleString()
}

function openUsersCreateSheet() {
  usersCreateForm.value = { username: '', password: '', role: 'user', credits: 0 }
  usersCreatedPassword.value = ''
  usersCreateSheetOpen.value = true
}

function openUsersEditSheet(row: AdminUserAccessRow) {
  usersEditing.value = row
  usersEditForm.value = { role: row.role, credits: Number(row.credits || 0) }
  usersEditSheetOpen.value = true
}

function closeUsersSheet() {
  usersCreateSheetOpen.value = false
  usersEditSheetOpen.value = false
  usersEditing.value = null
  usersCreatedPassword.value = ''
}

async function submitUsersCreate() {
  const form = usersCreateForm.value
  if (!form.username.trim()) {
    toast.error(tm.value.settings.usersCreateFailed)
    return
  }
  usersCreateSaving.value = true
  try {
    const result = await authAPI.adminCreateUser({
      username: form.username.trim(),
      password: form.password.trim() || undefined,
      role: form.role,
      credits: Number(form.credits || 0),
    })
    usersCreatedPassword.value = result.initial_password
    toast.success(tm.value.settings.usersCreated)
    await loadUsersList()
  } catch (err: any) {
    const msg = err?.data?.message || err?.message || tm.value.settings.usersCreateFailed
    toast.error(msg)
  } finally {
    usersCreateSaving.value = false
  }
}

async function submitUsersEdit() {
  if (!usersEditing.value) return
  const target = usersEditing.value
  const form = usersEditForm.value
  usersEditSaving.value = true
  try {
    await authAPI.adminUpdateUserAccess(target.id, {
      role: form.role,
      nav_modules_override: null,
    })
    if (!usersEditingIsSelf.value && Number(form.credits) !== Number(target.credits)) {
      const delta = Number(form.credits) - Number(target.credits)
      await authAPI.adminAdjustCredits(target.id, delta, tm.value.settings.usersCreditsAdjusted)
    }
    toast.success(tm.value.settings.usersUpdated)
    await loadUsersList()
    closeUsersSheet()
  } catch (err: any) {
    const msg = err?.data?.message || err?.message || tm.value.settings.usersUpdateFailed
    toast.error(msg)
  } finally {
    usersEditSaving.value = false
  }
}

function confirmDeleteUser(row: AdminUserAccessRow) {
  if (row.id === user.value?.id) {
    toast.error(tm.value.settings.usersCannotDeleteSelf)
    return
  }
  usersDeleteTarget.value = row
}

async function submitUsersDelete() {
  const target = usersDeleteTarget.value
  if (!target) return
  usersDeleteSaving.value = true
  try {
    await authAPI.adminDeleteUser(target.id)
    toast.success(tm.value.settings.usersDeleted)
    usersDeleteTarget.value = null
    await loadUsersList()
  } catch (err: any) {
    const msg = err?.data?.message || err?.message || tm.value.settings.usersDeleteFailed
    toast.error(msg)
  } finally {
    usersDeleteSaving.value = false
  }
}

async function copyUsersPassword() {
  if (!usersCreatedPassword.value) return
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(usersCreatedPassword.value)
    } else {
      const ta = document.createElement('textarea')
      ta.value = usersCreatedPassword.value
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    toast.success(tm.value.settings.usersPasswordCopied)
  } catch {
    toast.error(tm.value.settings.usersPasswordCopied)
  }
}

watch(tab, (v) => {
  if (v === 'users' && isAdmin.value && usersList.value.length === 0 && !usersListLoading.value) {
    loadUsersList()
  }
})

const passwordCurrentInput = ref('')
const passwordNewInput = ref('')
const passwordConfirmInput = ref('')
const passwordChangeSaving = ref(false)
const navigationRoleRows = ref([])
const navigationModuleCatalog = ref([])
const navigationRoleMatrix = ref({})
const navigationNewRoleInput = ref('')
const navPermSelectedUserId = ref(0)
const navPermSelectedUser = ref(null)
const navPermUserRole = ref('user')
const navPermInheritRole = ref(true)
const navPermUserModules = ref([])
const { setNavModules } = useNavModules()
const { adminSettingsReady } = useSessionCache()
const adminSettingsTabs = computed(() => [
  { id: 'agents', label: tm.value.settings.tabAgents, icon: Bot },
  { id: 'skills', label: tm.value.settings.tabSkills, icon: FileText },
  { id: 'lessons', label: tm.value.settings.tabLessons, icon: Lightbulb },
])
watch(advancedSectionOpen, (v) => {
  if (!v && (tab.value === 'agents' || tab.value === 'skills' || tab.value === 'lessons')) tab.value = 'ai'
})

// 角色被降级 / 退出登录时，如果停留在管理员 Tab，强制回到默认页
watch(isAdmin, (v) => {
  if (!v && tab.value === 'users') tab.value = 'account'
})

// ── AI 服务配置（管理员）────────────────────────────────────
const serviceConfigRows = ref([])
const serviceConfigSheetOpen = ref(false)
const serviceConfigEditingId = ref(null)
const bundledPresetSheetOpen = ref(false)
const serviceConfigProbeBusy = ref(false)
const serviceConfigProbeOutcome = ref(null)
const serviceConfigFormState = reactive({
  name: '',
  provider: '',
  api_key: '',
  base_url: '',
  modelStr: '',
  service_type: 'text',
  priority: 0,
  credit_cost: 0,
  credit_token_unit: 3000,
  credit_token_cost: 10,
  perplexity_model: '',
  enable_thinking: false,
})
const paymentProviderRows = ref([])
const bundledPresetKeyForm = reactive({ apiKey: '' })
const presetCanEditPlatformFields = ref(true)
const presetCreditBillingEnabled = ref(true)
const presetPolicySaveBusy = ref(false)
const serviceTypes = computed(() => [
  { type: 'text', label: tm.value.settings.serviceText },
  { type: 'image', label: tm.value.settings.serviceImage },
  { type: 'video', label: tm.value.settings.serviceVideo },
  { type: 'audio', label: tm.value.settings.serviceAudio },
])
const providersByServiceType = {
  text: ['ali', 'deepseek', 'huohuo', 'gemini', 'minimax', 'openai', 'openrouter', 'volcengine'],
  image: ['ali', 'huohuo', 'gemini', 'minimax', 'openai', 'openrouter', 'vidu', 'volcengine'],
  video: ['ali', 'huohuo', 'gemini', 'minimax', 'openai', 'openrouter', 'vidu', 'volcengine'],
  audio: ['ali', 'huohuo', 'gemini', 'minimax', 'openai', 'openrouter', 'volcengine'],
}
const providerLabelKeys = {
  ali: 'providerAli',
  deepseek: 'providerDeepseek',
  huohuo: 'providerHuohuo',
  gemini: 'providerGemini',
  minimax: 'providerMinimax',
  openai: 'providerOpenai',
  openrouter: 'providerOpenrouter',
  volcengine: 'providerVolcengine',
  vidu: 'providerVidu',
}
function formatProviderLabel(provider) {
  const key = providerLabelKeys[provider]
  return key ? (tm.value.settings[key] || provider) : provider
}
const providerPickerOptions = computed(() => {
  const list = providersByServiceType[serviceConfigFormState.service_type] || providersByServiceType.text
  return list.map(p => ({ label: formatProviderLabel(p), value: p }))
})
const serviceTypeMeta = computed(() => ({
  text: { label: tm.value.settings.serviceMetaTextLabel, desc: tm.value.settings.serviceMetaTextDesc },
  image: { label: tm.value.settings.serviceMetaImageLabel, desc: tm.value.settings.serviceMetaImageDesc },
  video: { label: tm.value.settings.serviceMetaVideoLabel, desc: tm.value.settings.serviceMetaVideoDesc },
  audio: { label: tm.value.settings.serviceMetaAudioLabel, desc: tm.value.settings.serviceMetaAudioDesc },
}))
const providerPresetCatalog = computed(() => {
  const s = tm.value.settings
  // 「火火代理」平台统一走 https://huo.hcpzy.com/v1（OpenAI / Anthropic 兼容接口）。
  // 「一键配置」写入的值走 DB，由 ai_preset_configs 表管控（详见 ai-config-service.ts）。
  return {
    text: {
      huohuo: { label: s.gatewayRecommended, baseUrl: 'https://huo.hcpzy.com/v1', models: ['gemini-3-pro-preview'], creditTokenUnit: 3000, creditTokenCost: 10 },
      deepseek: { label: s.deepseekRecommended, baseUrl: 'https://api.deepseek.com', models: ['deepseek-chat'], creditTokenUnit: 3000, creditTokenCost: 10 },
      minimax: { label: s.minimaxOfficial, baseUrl: 'https://api.minimaxi.com', models: ['MiniMax-M3'], creditTokenUnit: 3000, creditTokenCost: 10 },
      openrouter: { label: s.openrouterRecommended, baseUrl: 'https://openrouter.ai/api', models: ['google/gemini-3-flash-preview'], creditTokenUnit: 3000, creditTokenCost: 10 },
      openai: { label: s.openaiRecommended, baseUrl: 'https://api.openai.com', models: ['gpt-4.1-mini'], creditTokenUnit: 3000, creditTokenCost: 10 },
    },
    image: [
      { provider: 'huohuo', label: s.gatewayDoubao, baseUrl: 'https://huo.hcpzy.com/v1', models: ['doubao-seedream-5-0-260128'], creditCost: 10 },
      { provider: 'volcengine', label: s.arkDirect, baseUrl: 'https://ark.cn-beijing.volces.com', models: ['doubao-seedream-4-0-250828'], creditCost: 10 },
      { provider: 'huohuo', label: s.geminiRecommended, baseUrl: 'https://huo.hcpzy.com/v1', models: ['gemini-3-pro-image-preview'], creditCost: 10 },
      { provider: 'minimax', label: s.minimaxOfficial, baseUrl: 'https://api.minimaxi.com', models: ['image-01'], creditCost: 10 },
    ],
    video: {
      huohuo: { label: s.huohuoVideo, baseUrl: 'https://huo.hcpzy.com/v1', models: ['doubao-seedance-2-0-fast-260128', 'doubao-seedance-2-0-260128', 'doubao-seedance-1-5-pro-251215'], creditCost: 30 },
      minimax: { label: s.minimaxOfficial, baseUrl: 'https://api.minimaxi.com', models: ['MiniMax-Hailuo-2.3'], creditCost: 30 },
      vidu: { label: s.viduRecommended, baseUrl: 'https://api.vidu.com', models: ['viduq3-turbo'], creditCost: 30 },
      ali: { label: s.aliRecommended, baseUrl: 'https://dashscope.aliyuncs.com', models: ['wan2.6-i2v-flash'], creditCost: 30 },
    },
    audio: {
      minimax: { label: s.minimaxOfficial, baseUrl: 'https://api.minimaxi.com', models: ['speech-2.8-hd'], creditCost: 5 },
    },
  }
})

const pingpongRegionOptions = computed(() => {
  const s = tm.value.settings
  return [
    { label: s.regionPingpongFra, value: 'fra' },
    { label: s.regionPingpongSg, value: 'sg' },
    { label: s.regionPingpongUs, value: 'us' },
  ]
})
const signAlgoOptions = computed(() => {
  const s = tm.value.settings
  return [
    { label: s.optSignSha256, value: 'SHA256' },
    { label: s.optSignMd5, value: 'MD5' },
  ]
})
const paymentEnvOptions = computed(() => {
  const s = tm.value.settings
  return [
    { label: s.envSandbox, value: 'sandbox' },
    { label: s.envLive, value: 'live' },
  ]
})
// 「火火一键配置」卡片：后端拉取 + 每张可点编辑；每张卡片独立 api_key + 测连通性
type ProbeOutcome = {
  reachable: boolean
  status?: string
  message: string
  method?: string
  url?: string
  response_preview?: string
}

type PresetCardRow = {
  presetKey: 'text' | 'image' | 'video' | 'audio'
  serviceType: string
  provider: string
  baseUrl: string
  apiKey: string
  model: string
  label: string
  priority: number
  source: 'db' | 'env' | 'code'
  editing: boolean
  saving: boolean
  probing: boolean
  probeOutcome: ProbeOutcome | null
  editForm: { base_url: string; provider: string; api_key: string; model: string }
}
type AgentPresetRow = {
  presetKey: 'agent'
  model: string
  label: string
  source: 'db' | 'env' | 'code'
  editing: boolean
  saving: boolean
  editForm: { model: string }
}
const bundledPresetCardRows = ref<PresetCardRow[]>([])
const bundledPresetAgent = ref<AgentPresetRow | null>(null)

function presetKeyToLabel(presetKey: 'text' | 'image' | 'video' | 'audio'): string {
  if (presetKey === 'text') return tm.value.settings.presetText
  if (presetKey === 'image') return tm.value.settings.presetImage
  if (presetKey === 'video') return tm.value.settings.presetVideo
  return tm.value.settings.presetAudio
}

function sourceTagLabel(source: 'db' | 'env' | 'code'): string {
  if (source === 'db') return tm.value.settings.presetSourceDb
  if (source === 'env') return tm.value.settings.presetSourceEnv
  return tm.value.settings.presetSourceCode
}

function maskApiKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return '*'.repeat(key.length)
  return `${key.slice(0, 4)}${'*'.repeat(Math.min(20, key.length - 8))}${key.slice(-4)}`
}

function rowFromApi(item: { preset_key: string; service_type: string; provider: string; base_url: string; api_key: string; model: string; label: string; priority: number; source: 'db' | 'env' | 'code' }): PresetCardRow {
  return {
    presetKey: item.preset_key as PresetCardRow['presetKey'],
    serviceType: item.service_type,
    provider: item.provider,
    baseUrl: item.base_url,
    apiKey: item.api_key || '',
    model: item.model,
    label: presetKeyToLabel(item.preset_key as PresetCardRow['presetKey']) || item.label,
    priority: item.priority,
    source: item.source,
    editing: false,
    saving: false,
    probing: false,
    probeOutcome: null,
    editForm: { base_url: item.base_url, provider: item.provider, api_key: '', model: item.model },
  }
}

async function fetchBundledPresetRows() {
  try {
    const data = await aiConfigAPI.listPreset()
    presetCanEditPlatformFields.value = data.can_edit_platform_fields !== false
    presetCreditBillingEnabled.value = data.policy?.credit_billing_enabled !== false
    bundledPresetCardRows.value = (data.services || []).map(rowFromApi)
    bundledPresetAgent.value = data.agent ? {
      presetKey: 'agent',
      model: data.agent.model,
      label: tm.value.settings.presetAgent || 'Agent',
      source: data.agent.source,
      editing: false,
      saving: false,
      editForm: { model: data.agent.model },
    } : null
  } catch (e: any) {
    toast.error(e.message)
    bundledPresetCardRows.value = []
    bundledPresetAgent.value = null
  }
}

async function savePresetPolicySetting() {
  if (!isAdmin.value) return
  presetPolicySaveBusy.value = true
  try {
    const policy = await aiConfigAPI.savePresetPolicy(presetCreditBillingEnabled.value)
    presetCreditBillingEnabled.value = policy.credit_billing_enabled !== false
    if (user.value) {
      applyUserProfile({ ...user.value, credit_billing_enabled: presetCreditBillingEnabled.value })
    }
    toast.success(tm.value.settings.toastPresetPolicySaved)
    await fetchBundledPresetRows()
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    presetPolicySaveBusy.value = false
  }
}

function startPresetEdit(row: PresetCardRow | AgentPresetRow) {
  if ('editForm' in row) {
    if (row.presetKey === 'agent') {
      ;(row.editForm as AgentPresetRow['editForm']).model = row.model
    } else {
      const r = row as PresetCardRow
      // 编辑表单的 api_key 留空（placeholder 提示保留原值）；
      // 用户不填就保留 DB 里现有 apiKey 不变；填了新值就覆盖。
      r.editForm.base_url = r.baseUrl
      r.editForm.provider = r.provider
      r.editForm.api_key = ''
      r.editForm.model = r.model
      r.probeOutcome = null
    }
  }
  row.editing = true
}

function cancelPresetEdit(row: PresetCardRow | AgentPresetRow) {
  if ('probeOutcome' in row) row.probeOutcome = null
  row.editing = false
}

/**
 * 测连通性：复用 POST /ai-configs/test（添加模型时用的同款探针）。
 * 入参从卡片编辑表单取，model 字段是字符串形式，转换成数组。
 */
async function probePresetCard(row: PresetCardRow) {
  const base_url = row.editForm.base_url.trim()
  const provider = row.editForm.provider.trim()
  const model = row.editForm.model.trim()
  if (!base_url || !provider || !model) {
    toast.warning(tm.value.settings.toastPresetFieldsRequired)
    return
  }
  row.probing = true
  row.probeOutcome = null
  try {
    // 测连通性用编辑表单里新填的 api_key，没填就回退到 DB 里的原值
    const apiKey = row.editForm.api_key.trim() || row.apiKey
    const outcome = await aiConfigAPI.test({
      service_type: row.presetKey,
      provider,
      base_url,
      api_key: apiKey,
      model: model.split(',').map(s => s.trim()).filter(Boolean),
    })
    row.probeOutcome = outcome
    if (outcome.reachable) toast.success(tm.value.settings.toastEndpointOk)
    else toast.warning(tm.value.settings.toastEndpointFail)
  } catch (e: any) {
    row.probeOutcome = { reachable: false, message: e.message || 'request failed', status: 'ERROR' }
    toast.error(e.message)
  } finally {
    row.probing = false
  }
}

/**
 * 把顶部「火火 API 密钥」输入框里填的统一 key，下发到所有 4 张卡片的编辑表单。
 * 用于部署时「所有服务都用同一个代理平台 key」的常见场景，少敲几次。
 */
function bulkFillPresetApiKey() {
  const key = bundledPresetKeyForm.apiKey.trim()
  if (!key) return
  for (const row of bundledPresetCardRows.value) {
    row.editForm.api_key = key
    row.apiKey = key
  }
  toast.success(tm.value.settings.toastPresetBulkFilled)
}

async function savePresetEdit(row: PresetCardRow | AgentPresetRow) {
  row.saving = true
  try {
    if (row.presetKey === 'agent') {
      const next = (row.editForm as AgentPresetRow['editForm']).model.trim()
      if (!next) {
        toast.warning(tm.value.settings.toastPresetModelRequired)
        row.saving = false
        return
      }
      if (isAdmin.value) {
        await aiConfigAPI.savePreset([{ preset_key: 'agent', model: next }])
      } else {
        await aiConfigAPI.saveUserPreset([{ preset_key: 'agent', model: next }])
      }
    } else {
      const r = row as PresetCardRow
      const base_url = r.editForm.base_url.trim()
      const provider = r.editForm.provider.trim()
      const model = r.editForm.model.trim()
      if (!base_url || !provider || !model) {
        toast.warning(tm.value.settings.toastPresetFieldsRequired)
        row.saving = false
        return
      }
      const apiKey = r.editForm.api_key.trim()
      const payload: Record<string, unknown> = {
        preset_key: r.presetKey,
        service_type: r.presetKey,
        provider,
        base_url,
        model,
        label: presetKeyToLabel(r.presetKey),
        priority: r.priority,
      }
      if (apiKey) payload.api_key = apiKey
      if (isAdmin.value) {
        await aiConfigAPI.savePreset([payload])
      } else {
        await aiConfigAPI.saveUserPreset([{
          preset_key: r.presetKey,
          model,
          ...(apiKey ? { api_key: apiKey } : {}),
        }])
      }
    }
    toast.success(tm.value.settings.toastPresetSaved)
    row.editing = false
    await fetchBundledPresetRows()
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    row.saving = false
  }
}
function providerEndpointPrefix(provider, serviceType) {
  if (!provider) return ''
  if (provider === 'ali') return serviceType === 'text' ? '/compatible-mode/v1' : '/api/v1'
  const map = {
    huohuo: '/v1',
    deepseek: '/v1',
    openai: '/v1',
    openrouter: '/v1',
    minimax: '/v1',
    gemini: '/v1beta',
    volcengine: '/api/v3',
    vidu: '/ent/v2',
  }
  return map[provider] || ''
}

const providerEndpointHint = computed(() => {
  const provider = serviceConfigFormState.provider
  const base = serviceConfigFormState.base_url || tm.value.settings.baseUrlExamplePlaceholder
  const prefix = providerEndpointPrefix(provider, serviceConfigFormState.service_type)
  if (!provider) return tm.value.settings.endpointPickProvider
  return `${base}${prefix}`
})

/** huohuo 图片走 OpenAI 式 /v1；与豆包/方舟（/api/v3）易混淆，单独提示 */
const imageHuohuoDoubaoMismatchHint = computed(() => {
  if (serviceConfigFormState.service_type !== 'image' || serviceConfigFormState.provider !== 'huohuo') return ''
  const u = (serviceConfigFormState.base_url || '').toLowerCase()
  const m = (serviceConfigFormState.modelStr || '').toLowerCase()
  const looksDoubao = u.includes('doubao') || u.includes('volces.com') || u.includes('ark.cn')
  const looksSeedream = m.includes('seedream') || m.includes('doubao-seed')
  if (!looksDoubao && !looksSeedream) return ''
  return tm.value.settings.imageHuohuoMismatch
})

function selectConfigsByServiceType(t) { return serviceConfigRows.value.filter(c => c.service_type === t) }
function countActiveConfigsForType(t) { return selectConfigsByServiceType(t).filter(c => c.is_active).length }
function formatModelListDisplay(m) { return Array.isArray(m) ? m.join(', ') : m || '—' }
function formatBillingCreditCaption(c) {
  if (c.service_type === 'text') {
    const unit = Number(c.credit_token_unit || 0)
    const cost = Number(c.credit_token_cost || 0)
    if (unit > 0 && cost >= 0) {
      return tx(tm.value.settings.creditTokenLine, { tokens: unit, credits: cost })
    }
  }
  return tx(tm.value.settings.creditOnceLine, { credits: Number(c.credit_cost || 0) })
}
function presetCatalogForServiceType(type) {
  const group = providerPresetCatalog.value[type]
  if (!group) return []
  if (Array.isArray(group)) return group
  return Object.entries(group).map(([provider, preset]) => ({ provider, ...preset }))
}
/** @param type @param presetOrProvider 整条预设对象，或（非 image 数组场景下的）服务商 id */
function applyServiceProviderPreset(type, presetOrProvider) {
  let preset
  if (presetOrProvider && typeof presetOrProvider === 'object' && 'provider' in presetOrProvider) {
    preset = presetOrProvider
  } else {
    const pid = String(presetOrProvider || '')
    const group = providerPresetCatalog.value[type]
    if (Array.isArray(group)) {
      preset = group.find(p => p.provider === pid)
    } else {
      const raw = group?.[pid]
      preset = raw ? { provider: pid, ...raw } : undefined
    }
  }
  if (!preset?.provider) return
  serviceConfigFormState.provider = preset.provider
  serviceConfigFormState.base_url = preset.baseUrl
  serviceConfigFormState.modelStr = (preset.models || []).join(', ')
  serviceConfigFormState.name = `${preset.label}-${serviceTypeMeta.value[type].label}`
  if (type === 'text') {
    serviceConfigFormState.credit_token_unit = Number(preset.creditTokenUnit || 3000)
    serviceConfigFormState.credit_token_cost = Number(preset.creditTokenCost || 10)
    serviceConfigFormState.credit_cost = 0
  } else {
    serviceConfigFormState.credit_cost = Number(preset.creditCost || 0)
  }
}

async function fetchServiceConfigRows() { try { serviceConfigRows.value = await aiConfigAPI.list() } catch (e) { toast.error(e.message) } }
async function toggleServiceConfigActive(c) { await aiConfigAPI.update(c.id, { is_active: !c.is_active }); fetchServiceConfigRows() }
async function deleteServiceConfigRow(id) { await aiConfigAPI.del(id); toast.success(tm.value.settings.toastDeleted); fetchServiceConfigRows() }
function showCreateServiceConfigSheet(t) {
  serviceConfigEditingId.value = null
  serviceConfigProbeOutcome.value = null
  Object.assign(serviceConfigFormState, {
    name: '',
    provider: '',
    api_key: '',
    base_url: '',
    modelStr: '',
    service_type: t,
    priority: 0,
    credit_cost: 0,
    credit_token_unit: 3000,
    credit_token_cost: 10,
    perplexity_model: '',
    enable_thinking: false,
  })
  const firstPreset = presetCatalogForServiceType(t)[0]
  if (firstPreset) applyServiceProviderPreset(t, firstPreset)
  serviceConfigSheetOpen.value = true
}
function showEditServiceConfigSheet(c) {
  serviceConfigEditingId.value = c.id
  serviceConfigProbeOutcome.value = null
  Object.assign(serviceConfigFormState, {
    name: c.name || '',
    provider: c.provider,
    api_key: c.api_key || '',
    base_url: c.base_url || '',
    modelStr: formatModelListDisplay(c.model),
    service_type: c.service_type,
    priority: c.priority ?? 0,
    credit_cost: Number(c.credit_cost || 0),
    credit_token_unit: Number(c.credit_token_unit || 3000),
    credit_token_cost: Number(c.credit_token_cost || 0),
    perplexity_model: c.perplexity_model || '',
    enable_thinking: c.enable_thinking === true,
  })
  serviceConfigSheetOpen.value = true
}
function buildServiceConfigPayload() {
  const models = serviceConfigFormState.modelStr.split(',').map(s => s.trim()).filter(Boolean)
  const base = {
    name: serviceConfigFormState.name,
    provider: serviceConfigFormState.provider,
    api_key: serviceConfigFormState.api_key,
    base_url: serviceConfigFormState.base_url,
    model: models,
    priority: serviceConfigFormState.priority,
  }
  if (serviceConfigFormState.service_type === 'text') {
    return {
      ...base,
      credit_token_unit: Math.max(1, Number(serviceConfigFormState.credit_token_unit || 3000)),
      credit_token_cost: Math.max(0, Number(serviceConfigFormState.credit_token_cost || 0)),
      perplexity_model: serviceConfigFormState.perplexity_model?.trim() || '',
      enable_thinking: serviceConfigFormState.enable_thinking === true,
    }
  }
  return { ...base, credit_cost: serviceConfigFormState.credit_cost || 0 }
}
async function probeServiceConfigEndpoint(payload) {
  serviceConfigProbeBusy.value = true
  try {
    serviceConfigProbeOutcome.value = await aiConfigAPI.test(payload)
    if (serviceConfigProbeOutcome.value.reachable) toast.success(tm.value.settings.toastEndpointOk)
    else toast.warning(tm.value.settings.toastEndpointFail)
  } catch (e) {
    toast.error(e.message)
  } finally {
    serviceConfigProbeBusy.value = false
  }
}
async function probeDraftServiceConfig() {
  await probeServiceConfigEndpoint({
    service_type: serviceConfigFormState.service_type,
    provider: serviceConfigFormState.provider,
    api_key: serviceConfigFormState.api_key,
    base_url: serviceConfigFormState.base_url,
    model: serviceConfigFormState.modelStr.split(',').map(s => s.trim()).filter(Boolean),
  })
}
async function probeSavedServiceConfig(c) {
  showEditServiceConfigSheet(c)
  await probeServiceConfigEndpoint({
    service_type: c.service_type,
    provider: c.provider,
    api_key: c.api_key || '',
    base_url: c.base_url || '',
    model: Array.isArray(c.model) ? c.model : [],
  })
}
async function saveServiceConfigRow() {
  if (!serviceConfigFormState.provider) { toast.warning(tm.value.settings.toastSelectProvider); return }
  const payload = buildServiceConfigPayload()
  try {
    if (serviceConfigEditingId.value) await aiConfigAPI.update(serviceConfigEditingId.value, payload)
    else await aiConfigAPI.create({ service_type: serviceConfigFormState.service_type, name: serviceConfigFormState.name || `${serviceConfigFormState.provider}-${serviceConfigFormState.service_type}`, ...payload })
    serviceConfigSheetOpen.value = false; toast.success(tm.value.settings.toastSaved); fetchServiceConfigRows()
  } catch (e) { toast.error(e.message) }
}
async function applyBundledPlatformPreset() {
  if (isAdmin.value) {
    if (!bundledPresetKeyForm.apiKey) {
      toast.warning(tm.value.settings.toastHuohuoApiKey)
      return
    }
    try {
      await aiConfigAPI.huohuoPreset(bundledPresetKeyForm.apiKey)
      await fetchServiceConfigRows()
      await fetchAgentConfigRows()
      bundledPresetSheetOpen.value = false
      toast.success(tm.value.settings.toastPresetApplied)
    } catch (e) {
      toast.error(e.message)
    }
    return
  }

  if (presetCreditBillingEnabled.value) {
    toast.info(tm.value.settings.toastPresetCreditModeUser)
    bundledPresetSheetOpen.value = false
    return
  }

  const items: Record<string, unknown>[] = []
  for (const row of bundledPresetCardRows.value) {
    const model = (row.editing ? row.editForm.model : row.model).trim()
    const apiKey = (row.editing ? row.editForm.api_key : row.apiKey).trim() || row.apiKey.trim()
    if (!model) {
      toast.warning(tm.value.settings.toastPresetFieldsRequired)
      return
    }
    if (!apiKey) {
      toast.warning(tm.value.settings.toastPresetApiKeyRequired)
      return
    }
    items.push({ preset_key: row.presetKey, model, api_key: apiKey })
  }
  if (bundledPresetAgent.value) {
    const model = (bundledPresetAgent.value.editing
      ? bundledPresetAgent.value.editForm.model
      : bundledPresetAgent.value.model).trim()
    if (!model) {
      toast.warning(tm.value.settings.toastPresetModelRequired)
      return
    }
    items.push({ preset_key: 'agent', model })
  }
  try {
    await aiConfigAPI.saveUserPreset(items)
    bundledPresetSheetOpen.value = false
    toast.success(tm.value.settings.toastPresetApplied)
    await fetchBundledPresetRows()
  } catch (e) {
    toast.error(e.message)
  }
}

function isCnyPaymentProvider(code) {
  return code === 'wechat' || code === 'alipay'
}

function togglePaymentProvider(code) {
  const row = paymentProviderRows.value.find(p => p.code === code)
  if (!row) return
  row.enabled = !row.enabled
}

function addBonusTier(provider) {
  if (!Array.isArray(provider.settings.bonus_tiers)) provider.settings.bonus_tiers = []
  if (isCnyPaymentProvider(provider.code)) {
    provider.settings.bonus_tiers.push({ threshold_cny: 100, bonus_percent: 10 })
  } else {
    provider.settings.bonus_tiers.push({ threshold_usd: 100, bonus_percent: 10 })
  }
}

function removeBonusTier(provider, idx) {
  if (!Array.isArray(provider.settings.bonus_tiers)) return
  provider.settings.bonus_tiers.splice(idx, 1)
}

function navRoleLabel(role) {
  if (role === 'admin') return tm.value.settings.navModulesRoleAdmin
  if (role === 'user') return tm.value.settings.navModulesRoleUser
  return role
}

function navModuleAdminLabel(id) {
  if (id === 'projects') return tm.value.settings.navModuleProjects
  if (id === 'templates') return tm.value.settings.navModuleTemplates
  if (id === 'ai_detect') return tm.value.settings.navModuleAiDetect
  return tm.value.settings.navModuleSettings
}

const navPermEffectiveHint = computed(() => {
  if (!navPermSelectedUserId.value) return ''
  const source = navPermInheritRole.value
    ? tm.value.settings.navModulesSourceRole
    : tm.value.settings.navModulesSourceUser
  const modules = navPermInheritRole.value
    ? (navigationRoleMatrix.value[navPermUserRole.value] || navigationRoleMatrix.value.user || [])
    : navPermUserModules.value
  const labels = modules.map(id => navModuleAdminLabel(id)).join('、')
  return `${tm.value.settings.navModulesEffective}：${labels || '—'}（${source}）`
})

function addNavigationRole() {
  const role = navigationNewRoleInput.value.trim()
  if (!role) return
  if (navigationRoleRows.value.includes(role)) {
    toast.error(tm.value.settings.navModulesRoleExists)
    return
  }
  navigationRoleRows.value = [...navigationRoleRows.value, role]
  navigationRoleMatrix.value = {
    ...navigationRoleMatrix.value,
    [role]: [...(navigationRoleMatrix.value.user || navigationModuleCatalog.value.map(m => m.id))],
  }
  navigationNewRoleInput.value = ''
  toast.success(tm.value.settings.navModulesRoleAdded)
}

function applyNavPermEditor(user) {
  if (!user) {
    navPermUserRole.value = 'user'
    navPermInheritRole.value = true
    navPermUserModules.value = []
    return
  }
  navPermUserRole.value = user.role
  navPermInheritRole.value = user.nav_modules_source !== 'user'
  navPermUserModules.value = user.nav_modules_override
    ? [...user.nav_modules_override]
    : [...(navigationRoleMatrix.value[user.role] || navigationRoleMatrix.value.user || [])]
}

async function onNavPermUserPicked(row) {
  if (!row?.id) {
    navPermSelectedUser.value = null
    navPermSelectedUserId.value = 0
    applyNavPermEditor(null)
    return
  }
  try {
    navPermSelectedUser.value = await authAPI.adminGetUserAccess(row.id)
    applyNavPermEditor(navPermSelectedUser.value)
  } catch (e) {
    toast.error(e.message)
  }
}

function toggleNavPermUserModule(moduleId, ev) {
  const checked = ev?.target?.checked
  const list = new Set(navPermUserModules.value)
  if (checked) list.add(moduleId)
  else list.delete(moduleId)
  navPermUserModules.value = Array.from(list)
}

async function loadNavModulesAdmin() {
  const res = await authAPI.adminNavModules()
  navigationRoleRows.value = res.roles || []
  navigationModuleCatalog.value = res.modules || []
  navigationRoleMatrix.value = { ...(res.config || {}) }
}

function toggleNavModule(role, moduleId, ev) {
  const checked = ev?.target?.checked
  const list = new Set(navigationRoleMatrix.value[role] || [])
  if (checked) list.add(moduleId)
  else list.delete(moduleId)
  navigationRoleMatrix.value = { ...navigationRoleMatrix.value, [role]: Array.from(list) }
}

async function saveNavModulesConfig() {
  try {
    const res = await authAPI.adminSaveNavModules(navigationRoleMatrix.value)
    navigationRoleMatrix.value = { ...(res.config || {}) }
    navigationRoleRows.value = Object.keys(navigationRoleMatrix.value).sort((a, b) => {
      if (a === 'admin') return -1
      if (b === 'admin') return 1
      if (a === 'user') return -1
      if (b === 'user') return 1
      return a.localeCompare(b)
    })
    const navRes = await authAPI.adminNavModules()
    navigationRoleRows.value = navRes.roles || navigationRoleRows.value
    if (user.value?.role) {
      const me = await authAPI.me()
      applyUserProfile(me)
      setNavModules(me.nav_modules)
    }
    if (navPermSelectedUserId.value) {
      try {
        navPermSelectedUser.value = await authAPI.adminGetUserAccess(navPermSelectedUserId.value)
        applyNavPermEditor(navPermSelectedUser.value)
      } catch {
        /* keep editor state */
      }
    }
    toast.success(tm.value.settings.navModulesSaved)
  } catch (e) {
    toast.error(e.message)
  }
}

async function saveUserNavAccess() {
  if (!navPermSelectedUserId.value) return
  try {
    const res = await authAPI.adminUpdateUserAccess(navPermSelectedUserId.value, {
      role: navPermUserRole.value,
      nav_modules_override: navPermInheritRole.value ? null : [...navPermUserModules.value],
    })
    navPermSelectedUser.value = res
    if (!navigationRoleRows.value.includes(res.role)) {
      navigationRoleRows.value = [...navigationRoleRows.value, res.role]
    }
    if (user.value?.username === res.username) {
      const me = await authAPI.me()
      applyUserProfile(me)
      setNavModules(me.nav_modules)
    }
    applyNavPermEditor(res)
    toast.success(tm.value.settings.navModulesUserSaved)
  } catch (e) {
    toast.error(e.message)
  }
}

// ── 支付渠道（管理员）────────────────────────────────────────
async function loadPaymentProviders() {
  try {
    const res = await paymentAPI.adminProviders()
    paymentProviderRows.value = (res.providers || []).map((p) => {
      const settings = {
        credit_per_usd: Number(p.settings?.credit_per_usd || 10),
        custom_max_usd: Number(p.settings?.custom_max_usd || 1000),
        bonus_tiers: Array.isArray(p.settings?.bonus_tiers) ? p.settings.bonus_tiers : [],
        ...(p.settings || {}),
      }
      if (p.code === 'pingpong') {
        settings.acc_id = settings.acc_id ?? ''
        settings.client_id = settings.client_id ?? ''
        settings.salt = settings.salt ?? ''
        settings.region = settings.region || 'fra'
        settings.sign_type = settings.sign_type || 'SHA256'
        settings.env = settings.env || 'sandbox'
      }
      if (p.code === 'wechat') {
        settings.app_id = settings.app_id ?? ''
        settings.mch_id = settings.mch_id ?? ''
        settings.api_v3_key = settings.api_v3_key ?? ''
        settings.serial_no = settings.serial_no ?? ''
        settings.private_key = settings.private_key ?? ''
        settings.credit_per_cny = Number(settings.credit_per_cny || 1)
        settings.custom_max_cny = Number(settings.custom_max_cny || 5000)
        settings.usd_to_cny_rate = Number(settings.usd_to_cny_rate || 7.2)
        settings.env = settings.env || 'sandbox'
      }
      if (p.code === 'alipay') {
        settings.app_id = settings.app_id ?? ''
        settings.private_key = settings.private_key ?? ''
        settings.alipay_public_key = settings.alipay_public_key ?? ''
        settings.credit_per_cny = Number(settings.credit_per_cny || 1)
        settings.custom_max_cny = Number(settings.custom_max_cny || 5000)
        settings.usd_to_cny_rate = Number(settings.usd_to_cny_rate || 7.2)
        settings.env = settings.env || 'sandbox'
      }
      return { ...p, settings }
    })
  } catch (e) {
    toast.error(e.message)
  }
}

async function savePaymentProviders() {
  try {
    await paymentAPI.adminUpdateProviders(paymentProviderRows.value.map((p) => {
      const base = { ...(p.settings || {}) }
      if (isCnyPaymentProvider(p.code)) {
        base.credit_per_cny = Math.max(1, Math.floor(Number(p.settings?.credit_per_cny || 1)))
        base.custom_max_cny = Math.max(1, Math.floor(Number(p.settings?.custom_max_cny || 5000)))
        base.usd_to_cny_rate = Math.max(0.01, Number(p.settings?.usd_to_cny_rate || 7.2))
        base.bonus_tiers = (Array.isArray(p.settings?.bonus_tiers) ? p.settings.bonus_tiers : [])
          .map((row) => ({
            threshold_cny: Math.max(1, Math.floor(Number(row?.threshold_cny || 0))),
            bonus_percent: Math.max(1, Math.floor(Number(row?.bonus_percent || 0))),
          }))
          .filter((row) => row.threshold_cny > 0 && row.bonus_percent > 0)
          .sort((a, b) => a.threshold_cny - b.threshold_cny)
      } else {
        base.credit_per_usd = Math.max(1, Math.floor(Number(p.settings?.credit_per_usd || 10)))
        base.custom_max_usd = Math.max(1, Math.floor(Number(p.settings?.custom_max_usd || 1000)))
        base.bonus_tiers = (Array.isArray(p.settings?.bonus_tiers) ? p.settings.bonus_tiers : [])
          .map((row) => ({
            threshold_usd: Math.max(1, Math.floor(Number(row?.threshold_usd || 0))),
            bonus_percent: Math.max(1, Math.floor(Number(row?.bonus_percent || 0))),
          }))
          .filter((row) => row.threshold_usd > 0 && row.bonus_percent > 0)
          .sort((a, b) => a.threshold_usd - b.threshold_usd)
      }
      return { code: p.code, enabled: !!p.enabled, settings: base }
    }))
    await loadPaymentProviders()
    toast.success(tm.value.settings.toastPaymentSaved)
  } catch (e) {
    toast.error(e.message)
  }
}

async function testPaymentProvider(provider) {
  try {
    const payload = await paymentAPI.adminTestProvider(provider.code, provider.settings || {})
    if (payload?.reachable) toast.success(payload.message || tm.value.settings.paymentTestOk)
    else toast.warning(payload?.message || tm.value.settings.paymentTestWarn)
  } catch (e) {
    toast.error(e.message || tm.value.settings.paymentTestFail)
  }
}

// ── Agent 配置（管理员高级）──────────────────────────────────
const agentConfigRows = ref([])
const editingAgentType = ref(null)
const agentConfigSaving = ref(false)
const agentConfigSavedFlag = ref(null)
const agentConfigFormState = reactive({ model: '', temperature: 0.7, max_tokens: 4096, system_prompt: '' })

const agentCatalogKind = ref('drama')

const agentCatalogKindTabs = computed(() => [
  { id: 'drama', label: tm.value.settings.agentKindDrama },
  { id: 'novel', label: tm.value.settings.agentKindNovel },
  { id: 'detect', label: tm.value.settings.agentKindDetect },
])

const agentDefinitionRows = computed(() => {
  const s = tm.value.settings
  return [
    { type: 'drama_script_formatter', label: s.agentLabelDramaScriptFormatter, icon: '📝', kind: 'drama' },
    { type: 'drama_cast_scene_extract', label: s.agentLabelDramaCastSceneExtract, icon: '🔍', kind: 'drama' },
    { type: 'drama_storyboard_breakdown', label: s.agentLabelDramaStoryboardBreakdown, icon: '🎬', kind: 'drama' },
    { type: 'drama_voice_assign', label: s.agentLabelDramaVoiceAssign, icon: '🎙', kind: 'drama' },
    { type: 'drama_image_prompt', label: s.agentLabelDramaImagePrompt, icon: '🖼', kind: 'drama' },
    { type: 'novel_premise', label: s.agentLabelNovelPremise, icon: '📖', kind: 'novel' },
    { type: 'novel_outline', label: s.agentLabelNovelOutline, icon: '📑', kind: 'novel' },
    { type: 'novel_writing_brief', label: s.agentLabelNovelWritingBrief, icon: '✍️', kind: 'novel' },
    { type: 'novel_chapter_writer', label: s.agentLabelNovelChapterWriter, icon: '📚', kind: 'novel' },
    { type: 'ai_dehumanizer', label: s.agentLabelAiDehumanizer, icon: '✨', kind: 'detect' },
  ]
})

const visibleAgentDefinitions = computed(() =>
  agentDefinitionRows.value.filter(a => a.kind === agentCatalogKind.value),
)

function switchAgentCatalogKind(kind) {
  if (agentCatalogKind.value === kind) return
  agentCatalogKind.value = kind
  editingAgentType.value = null
  const first = agentDefinitionRows.value.find(a => a.kind === kind)
  if (first) selectedAgent.value = first.type
}

const defaultPrompts = computed(() => tm.value.agentPromptDefaults)

function lookupAgentConfigRow(type) {
  return agentConfigRows.value.find(a => a.agent_type === type)
}

const textModelOptionGroups = computed(() => {
  return serviceConfigRows.value
    .filter(c => c.service_type === 'text' && c.is_active && c.api_key)
    .map(c => ({
      label: `${c.provider} — ${c.name}`,
      models: Array.isArray(c.model) ? c.model : (c.model ? [c.model] : []),
    }))
    .filter(g => g.models.length > 0)
})

const textModelPickerOptions = computed(() =>
  textModelOptionGroups.value.map(g => ({
    label: g.label,
    options: g.models.map(m => ({ label: m, value: m })),
  }))
)

async function fetchAgentConfigRows() {
  try { agentConfigRows.value = await agentConfigAPI.list() }
  catch (e) { toast.error(e.message) }
}

function toggleAgentConfigEdit(type) {
  if (editingAgentType.value === type) { editingAgentType.value = null; return }
  const cfg = lookupAgentConfigRow(type)
  agentConfigFormState.model = cfg?.model || ''
  agentConfigFormState.temperature = cfg?.temperature ?? 0.7
  agentConfigFormState.max_tokens = cfg?.max_tokens ?? 4096
  agentConfigFormState.system_prompt = cfg?.system_prompt || defaultPrompts.value[type] || ''
  agentConfigSavedFlag.value = null
  editingAgentType.value = type
}

function restoreAgentDefaultPrompt(type) {
  agentConfigFormState.system_prompt = defaultPrompts.value[type] || ''
  toast.info(tm.value.settings.toastAgentPromptReset)
}

async function persistAgentConfigRow(type) {
  agentConfigSaving.value = true
  agentConfigSavedFlag.value = null
  try {
    const existing = lookupAgentConfigRow(type)
    const data = {
      agent_type: type,
      name: agentDefinitionRows.value.find(a => a.type === type)?.label || type,
      model: agentConfigFormState.model,
      temperature: agentConfigFormState.temperature,
      max_tokens: agentConfigFormState.max_tokens,
      system_prompt: agentConfigFormState.system_prompt,
    }
    if (existing) {
      await agentConfigAPI.update(existing.id, data)
    } else {
      await agentConfigAPI.create(data)
    }
    await fetchAgentConfigRows()
    agentConfigSavedFlag.value = type
    toast.success(tx(tm.value.settings.agentSavedToast, { agent: agentDefinitionRows.value.find(a => a.type === type)?.label || type }))
    setTimeout(() => { if (agentConfigSavedFlag.value === type) agentConfigSavedFlag.value = null }, 3000)
  } catch (e) {
    toast.error(e.message)
  } finally {
    agentConfigSaving.value = false
  }
}

// ── Skills 目录（管理员高级）─────────────────────────────────
const selectedAgent = ref('drama_script_formatter')
const skillCatalogRows = ref([])   // { id, name, description }[]
const editingSkillId = ref(null)
const skillMarkdownDraft = ref('')
const skillPersistBusy = ref(false)
const skillPersistAck = ref(null)
const addSkillSheetOpen = ref(false)
const newSkillFormState = reactive({ id: '', name: '', description: '' })
const skillFileInputRef = ref(null)
const skillUploadBusy = ref(false)
const skillUploadReplaceExisting = ref(false)

const activeAgentTypeKey = computed(() => selectedAgent.value)
const activeAgentTypeLabel = computed(() => agentDefinitionRows.value.find(a => a.type === selectedAgent.value)?.label || '')
const activeAgentTypeIcon = computed(() => agentDefinitionRows.value.find(a => a.type === selectedAgent.value)?.icon || '')

function countSkillsForAgent(type) {
  return skillCatalogRows.value.filter(s => s.id === type || s.id.startsWith(type + '/')).length
}

const visibleSkillsForAgent = computed(() =>
  skillCatalogRows.value.filter(s => s.id === selectedAgent.value || s.id.startsWith(selectedAgent.value + '/'))
)

async function fetchSkillCatalog() {
  try { skillCatalogRows.value = await skillsAPI.list() }
  catch (e) { toast.error(e.message) }
}

async function switchActiveAgentType(type) {
  selectedAgent.value = type
  editingSkillId.value = null
}

function openAddSkillSheet() {
  newSkillFormState.id = ''
  newSkillFormState.name = ''
  newSkillFormState.description = ''
  addSkillSheetOpen.value = true
}

async function submitNewSkillEntry() {
  if (!newSkillFormState.id) return
  const skillId = `${selectedAgent.value}/${newSkillFormState.id}`
  try {
    await skillsAPI.create({ id: skillId, name: newSkillFormState.name, description: newSkillFormState.description })
    addSkillSheetOpen.value = false
    await fetchSkillCatalog()
    toast.success(tm.value.settings.toastSkillCreated)
  } catch (e) {
    toast.error(e.message)
  }
}

async function handleSkillFileUpload(e) {
  const input = e.target
  const file = input?.files?.[0]
  if (input) input.value = ''
  if (!file || !selectedAgent.value) return
  skillUploadBusy.value = true
  try {
    const res = await skillsAPI.upload(selectedAgent.value, file, {
      overwrite: skillUploadReplaceExisting.value,
    })
    const n = res.imported?.length ?? 0
    await fetchSkillCatalog()
    toast.success(tx(tm.value.settings.toastSkillUploaded, { n }))
  } catch (err) {
    toast.error(err.message)
  } finally {
    skillUploadBusy.value = false
  }
}

async function removeSkillEntry(id) {
  if (!confirm(tx(tm.value.settings.confirmDeleteSkill, { id }))) return
  try {
    await skillsAPI.del(id)
    if (editingSkillId.value === id) editingSkillId.value = null
    await fetchSkillCatalog()
    toast.success(tm.value.settings.toastDeleted)
  } catch (e) {
    toast.error(e.message)
  }
}

async function toggleSkillEditMode(id) {
  if (editingSkillId.value === id) { editingSkillId.value = null; return }
  try {
    const res = await skillsAPI.get(id)
    skillMarkdownDraft.value = res.content
    skillPersistAck.value = null
    editingSkillId.value = id
  } catch (e) { toast.error(e.message) }
}

async function persistSkillEntry(id) {
  skillPersistBusy.value = true
  skillPersistAck.value = null
  try {
    await skillsAPI.update(id, skillMarkdownDraft.value)
    await fetchSkillCatalog()
    skillPersistAck.value = id
    toast.success(tm.value.settings.toastSaved)
    setTimeout(() => { if (skillPersistAck.value === id) skillPersistAck.value = null }, 3000)
  } catch (e) {
    toast.error(e.message)
  } finally {
    skillPersistBusy.value = false
  }
}

// ── 生成经验库（管理员高级）────────────────────────────────
const lessonCatalogRows = ref([])
const lessonCatalogKind = ref('drama')
const activeLessonAgentKey = ref('__global__')
const lessonOutcomeFilter = ref('all')
const lessonEditorSheetOpen = ref(false)
const lessonEditorRowId = ref(null)
const lessonPersistBusy = ref(false)
const lessonEditorFormState = reactive({
  title: '',
  content: '',
  verdict: 'recommend',
  project_kind: 'drama',
  agent_type: '',
  tagsStr: '',
  sort_order: 0,
  is_active: true,
})

const visibleLessonAgentDefs = computed(() =>
  agentDefinitionRows.value.filter(a => a.kind === lessonCatalogKind.value),
)

const lessonOutcomeTabs = computed(() => [
  { id: 'all', label: tm.value.settings.lessonsVerdictAll },
  { id: 'recommend', label: tm.value.settings.lessonsVerdictRecommend },
  { id: 'avoid', label: tm.value.settings.lessonsVerdictAvoid },
])

const lessonOutcomeOptions = computed(() => [
  { label: tm.value.settings.lessonsVerdictRecommend, value: 'recommend' },
  { label: tm.value.settings.lessonsVerdictAvoid, value: 'avoid' },
])

const lessonProjectKindPicker = computed(() => [
  { label: tm.value.settings.lessonScopeAll, value: 'all' },
  { label: tm.value.settings.lessonScopeDrama, value: 'drama' },
  { label: tm.value.settings.lessonScopeNovel, value: 'novel' },
])

const lessonAgentTypePicker = computed(() => {
  const agents = lessonEditorFormState.project_kind === 'all'
    ? agentDefinitionRows.value
    : agentDefinitionRows.value.filter(a => a.kind === lessonEditorFormState.project_kind)
  return [
    { label: tm.value.settings.lessonsAgentTypeGlobal, value: '' },
    ...agents.map(a => ({ label: `${a.label} (${a.type})`, value: a.type })),
  ]
})

function switchLessonCatalogKind(kind) {
  if (lessonCatalogKind.value === kind) return
  lessonCatalogKind.value = kind
  activeLessonAgentKey.value = '__global__'
  reloadLessonLibrary()
}

function switchActiveLessonAgent(type) {
  activeLessonAgentKey.value = type
}

function formatLessonScopeLabel(kind) {
  const s = tm.value.settings
  if (kind === 'drama') return s.lessonScopeDrama
  if (kind === 'novel') return s.lessonScopeNovel
  return s.lessonScopeAll
}

function lessonMatchesActiveSidebar(l) {
  const kindOk = l.project_kind === 'all' || l.project_kind === lessonCatalogKind.value
  if (!kindOk) return false
  if (activeLessonAgentKey.value === '__global__') {
    return !l.agent_type
  }
  return !l.agent_type || l.agent_type === activeLessonAgentKey.value
}

const filteredLessons = computed(() => {
  return lessonCatalogRows.value
    .filter(lessonMatchesActiveSidebar)
    .filter(l => lessonOutcomeFilter.value === 'all' || l.verdict === lessonOutcomeFilter.value)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id)
})

function lessonCountForAgent(agentType) {
  return lessonCatalogRows.value.filter(l => {
    const kindOk = l.project_kind === 'all' || l.project_kind === lessonCatalogKind.value
    if (!kindOk) return false
    if (agentType === '__global__') return !l.agent_type
    return l.agent_type === agentType
  }).length
}

async function reloadLessonLibrary() {
  try {
    lessonCatalogRows.value = await generationLessonsAPI.list({ project_kind: lessonCatalogKind.value })
  } catch (e) {
    toast.error(e.message)
  }
}

function resetLessonForm() {
  lessonEditorFormState.title = ''
  lessonEditorFormState.content = ''
  lessonEditorFormState.verdict = 'recommend'
  lessonEditorFormState.project_kind = lessonCatalogKind.value
  lessonEditorFormState.agent_type = activeLessonAgentKey.value === '__global__' ? '' : activeLessonAgentKey.value
  lessonEditorFormState.tagsStr = ''
  lessonEditorFormState.sort_order = 0
  lessonEditorFormState.is_active = true
}

function startAddLesson() {
  lessonEditorRowId.value = null
  resetLessonForm()
  lessonEditorSheetOpen.value = true
}

function startEditLesson(l) {
  lessonEditorRowId.value = l.id
  lessonEditorFormState.title = l.title
  lessonEditorFormState.content = l.content
  lessonEditorFormState.verdict = l.verdict
  lessonEditorFormState.project_kind = l.project_kind || 'all'
  lessonEditorFormState.agent_type = l.agent_type || ''
  lessonEditorFormState.tagsStr = Array.isArray(l.tags) ? l.tags.join(', ') : ''
  lessonEditorFormState.sort_order = l.sort_order ?? 0
  lessonEditorFormState.is_active = l.is_active !== false
  lessonEditorSheetOpen.value = true
}

async function saveLesson() {
  if (!lessonEditorFormState.title.trim() || !lessonEditorFormState.content.trim()) return
  lessonPersistBusy.value = true
  const payload = {
    title: lessonEditorFormState.title.trim(),
    content: lessonEditorFormState.content.trim(),
    verdict: lessonEditorFormState.verdict,
    project_kind: lessonEditorFormState.project_kind,
    agent_type: lessonEditorFormState.agent_type || null,
    tags: lessonEditorFormState.tagsStr,
    sort_order: lessonEditorFormState.sort_order ?? 0,
    is_active: lessonEditorFormState.is_active,
  }
  try {
    if (lessonEditorRowId.value) {
      await generationLessonsAPI.update(lessonEditorRowId.value, payload)
      toast.success(tm.value.settings.toastSaved)
    } else {
      await generationLessonsAPI.create(payload)
      toast.success(tm.value.settings.toastLessonCreated)
    }
    lessonEditorSheetOpen.value = false
    await reloadLessonLibrary()
  } catch (e) {
    toast.error(e.message)
  } finally {
    lessonPersistBusy.value = false
  }
}

async function toggleLessonActive(l) {
  try {
    await generationLessonsAPI.update(l.id, { is_active: !l.is_active })
    l.is_active = !l.is_active
  } catch (e) {
    toast.error(e.message)
    await reloadLessonLibrary()
  }
}

async function deleteLesson(l) {
  if (!confirm(tx(tm.value.settings.confirmDeleteLesson, { title: l.title }))) return
  try {
    await generationLessonsAPI.del(l.id)
    await reloadLessonLibrary()
    toast.success(tm.value.settings.toastDeleted)
  } catch (e) {
    toast.error(e.message)
  }
}

// ===== Lesson auto-extract =====
const extractDialog = ref(false)
const extractProjects = ref([])
const extracting = ref(false)
const extractSaving = ref(false)
const extractDone = ref(false)
const extractedLessons = ref([])
const extractSelected = ref([])
const extractResultTitle = ref('')
const extractForm = reactive({ drama_id: null, hint: '' })

const extractProjectOptions = computed(() =>
  extractProjects.value.map(d => ({
    label: d.title,
    value: d.id,
  })),
)

async function loadExtractProjects() {
  try {
    const res = await dramaAPI.list({ project_type: lessonCatalogKind.value, page_size: 100 })
    extractProjects.value = res?.items || []
  } catch (e) {
    toast.error(e.message)
    extractProjects.value = []
  }
}

async function startExtractLessons() {
  extractForm.drama_id = null
  extractForm.hint = ''
  extractedLessons.value = []
  extractSelected.value = []
  extractDone.value = false
  extractResultTitle.value = ''
  await loadExtractProjects()
  if (!extractProjects.value.length) {
    toast.warning(tm.value.settings.lessonsExtractNoProject)
    return
  }
  extractDialog.value = true
}

async function runLessonExtract() {
  if (!extractForm.drama_id || extracting.value) return
  extracting.value = true
  extractDone.value = false
  extractedLessons.value = []
  extractSelected.value = []
  try {
    const res = await generationLessonsAPI.extract({
      drama_id: Number(extractForm.drama_id),
      hint: extractForm.hint.trim() || undefined,
    })
    extractedLessons.value = res?.lessons || []
    extractResultTitle.value = res?.drama_title || ''
    extractSelected.value = extractedLessons.value.map((_, i) => i)
    extractDone.value = true
    if (!extractedLessons.value.length) {
      toast.warning(tm.value.settings.lessonsExtractEmpty)
    }
  } catch (e) {
    toast.error(e.message)
    extractDone.value = true
  } finally {
    extracting.value = false
  }
}

function toggleExtractSelectAll() {
  if (extractSelected.value.length === extractedLessons.value.length) {
    extractSelected.value = []
  } else {
    extractSelected.value = extractedLessons.value.map((_, i) => i)
  }
}

async function importExtractedLessons() {
  if (!extractSelected.value.length || extractSaving.value) return
  const items = extractSelected.value
    .map(i => extractedLessons.value[i])
    .filter(Boolean)
    .map(l => ({
      title: l.title,
      content: l.content,
      verdict: l.verdict,
      project_kind: l.project_kind,
      agent_type: l.agent_type || null,
      tags: l.tags || [],
      is_active: true,
    }))
  if (!items.length) return
  extractSaving.value = true
  try {
    const res = await generationLessonsAPI.batchCreate(items)
    toast.success(tx(tm.value.settings.lessonsExtractSaved, { n: res?.count || items.length }))
    extractDialog.value = false
    await reloadLessonLibrary()
  } catch (e) {
    toast.error(e.message)
  } finally {
    extractSaving.value = false
  }
}

function modelSelectLabel(config) {
  if (!config) return ''
  let modelName = ''
  try { const m = JSON.parse(config.model || '[]'); modelName = Array.isArray(m) ? (m[0] || '') : (m || '') } catch { modelName = config.model || '' }
  const credit = Number(config.credit_cost || 0)
  const core = modelName ? `${modelName} (${config.provider})` : `${config.name} (${config.provider})`
  return tx(tm.value.settings.userModelOptionLabel, { core, credits: credit })
}

function preferredKey(type) {
  return `huohuo_preferred_${type}_config_id`
}

async function loadUserModelOptions() {
  try {
    const [texts, imgs, vids, auds, saved] = await Promise.all([
      aiConfigAPI.list('text'),
      aiConfigAPI.list('image'),
      aiConfigAPI.list('video'),
      aiConfigAPI.list('audio'),
      aiConfigAPI.getUserDefaultModels().catch(() => null),
    ])
    const textList = (texts || []).filter(c => c.is_active)
    const imageList = (imgs || []).filter(c => c.is_active)
    const videoList = (vids || []).filter(c => c.is_active)
    const audioList = (auds || []).filter(c => c.is_active)
    textConfigPickerRows.value = textList.map(c => ({ label: modelSelectLabel(c), value: c.id }))
    imageConfigPickerRows.value = imageList.map(c => ({ label: modelSelectLabel(c), value: c.id }))
    videoConfigPickerRows.value = videoList.map(c => ({ label: modelSelectLabel(c), value: c.id }))
    audioConfigPickerRows.value = audioList.map(c => ({ label: modelSelectLabel(c), value: c.id }))

    const savedByType = new Map((saved?.items || []).map(i => [i.service_type, i.config_id]))
    const pidTxt = Number(savedByType.get('text') || localStorage.getItem(preferredKey('text')) || 0)
    const pidImg = Number(savedByType.get('image') || localStorage.getItem(preferredKey('image')) || 0)
    const pidVid = Number(savedByType.get('video') || localStorage.getItem(preferredKey('video')) || 0)
    const pidAud = Number(savedByType.get('audio') || localStorage.getItem(preferredKey('audio')) || 0)
    preferredTextConfigId.value = textList.some(c => c.id === pidTxt) ? pidTxt : null
    preferredImageConfigId.value = imageList.some(c => c.id === pidImg) ? pidImg : null
    preferredVideoConfigId.value = videoList.some(c => c.id === pidVid) ? pidVid : null
    preferredAudioConfigId.value = audioList.some(c => c.id === pidAud) ? pidAud : null
  } catch (e) {
    toast.error(e.message)
  }
}

async function savePassword() {
  if (!passwordCurrentInput.value || !passwordNewInput.value) {
    toast.error(tm.value.settings.passwordRequired)
    return
  }
  if (passwordNewInput.value.length < 8) {
    toast.error(tm.value.settings.passwordTooShort)
    return
  }
  if (passwordNewInput.value !== passwordConfirmInput.value) {
    toast.error(tm.value.settings.passwordMismatch)
    return
  }
  try {
    passwordChangeSaving.value = true
    await authAPI.changePassword(passwordCurrentInput.value, passwordNewInput.value)
    passwordCurrentInput.value = ''
    passwordNewInput.value = ''
    passwordConfirmInput.value = ''
    toast.success(tm.value.settings.toastPasswordChanged)
  } catch (e) {
    toast.error(e.message)
  } finally {
    passwordChangeSaving.value = false
  }
}

async function saveUserModelPrefs() {
  if (!preferredTextConfigId.value || !preferredImageConfigId.value || !preferredVideoConfigId.value || !preferredAudioConfigId.value) {
    toast.error(tm.value.settings.defaultModelsRequired)
    return
  }
  try {
    await aiConfigAPI.saveUserDefaultModels([
      { service_type: 'text', config_id: preferredTextConfigId.value },
      { service_type: 'image', config_id: preferredImageConfigId.value },
      { service_type: 'video', config_id: preferredVideoConfigId.value },
      { service_type: 'audio', config_id: preferredAudioConfigId.value },
    ])
    localStorage.setItem(preferredKey('text'), String(preferredTextConfigId.value))
    localStorage.setItem(preferredKey('image'), String(preferredImageConfigId.value))
    localStorage.setItem(preferredKey('video'), String(preferredVideoConfigId.value))
    localStorage.setItem(preferredKey('audio'), String(preferredAudioConfigId.value))
    toast.success(tm.value.settings.toastDefaultModelsSaved)
  } catch (e) {
    toast.error(e.message)
  }
}

async function bootstrapAdminSettings(force = false) {
  if (force) adminSettingsReady.value = false
  await runAdminSettingsBootstrap(adminSettingsReady, async () => {
    await Promise.all([
      fetchServiceConfigRows(),
      loadNavModulesAdmin(),
      loadPaymentProviders(),
      fetchAgentConfigRows(),
      fetchSkillCatalog(),
      reloadLessonLibrary(),
      fetchBundledPresetRows(),
    ])
  })
}

onMounted(async () => {
  init()
  try {
    if (!user.value) {
      const me = await authAPI.me()
      applyUserProfile(me)
      if (me.nav_modules) setNavModules(me.nav_modules)
    } else if (user.value.nav_modules) {
      setNavModules(user.value.nav_modules)
    }
  } catch {
    await navigateTo('/login')
    return
  }
  if (isAdmin.value) {
    const stale = adminSettingsReady.value && !serviceConfigRows.value.length
    if (!adminSettingsReady.value || stale) {
      await bootstrapAdminSettings(stale)
    }
  } else {
    loadUserModelOptions()
    void fetchBundledPresetRows()
  }
})

// 「火火一键配置」弹窗打开时重新拉数据，保证卡片显示最新 DB/env 值
watch(bundledPresetSheetOpen, (open) => { if (open) fetchBundledPresetRows() })
</script>

<style scoped>
.settings-layout { display: flex; height: 100%; background: var(--bg-base); }

.settings-nav {
  width: 220px; flex-shrink: 0; padding: 16px 10px; border-right: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 14px; background: var(--bg-1);
}
.nav-group { display: flex; flex-direction: column; gap: 4px; }
.nav-modules-grid { display: grid; gap: 12px; }
.nav-role-add {
  display: flex; gap: 8px; align-items: center; margin-bottom: 12px;
}
.nav-role-add-input { max-width: 220px; }
.nav-user-panel { margin-top: 16px; }
.nav-user-form { display: grid; gap: 12px; max-width: 520px; }
.nav-user-field {
  display: grid; gap: 6px; font-size: 13px; color: var(--text-2);
}
.nav-user-inherit { margin-top: 2px; }
.nav-user-effective { font-size: 12px; margin: 0; }
.nav-modules-role { padding: 14px 16px; }
.nav-modules-role-title { font-size: 13px; font-weight: 600; margin-bottom: 10px; }
.nav-modules-checks { display: flex; flex-wrap: wrap; gap: 10px 16px; }
.nav-module-check {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; color: var(--text-2);
}
.nav-module-check input { accent-color: var(--accent); }
.account-panel { padding: 16px 18px; margin-bottom: 16px; }
.account-form {
  display: grid;
  gap: 12px;
  max-width: 420px;
}
.nav-group-label {
  font-size: 10px; font-weight: 700; color: var(--text-3);
  letter-spacing: 0.12em; text-transform: uppercase; padding: 0 10px 4px;
}
.nav-item {
  display: flex; align-items: center; gap: 8px; padding: 9px 12px; font-size: 13px;
  border: none; background: none; color: var(--text-2); cursor: pointer;
  border-radius: var(--radius); transition: all 0.12s; text-align: left; width: 100%;
}
.nav-item:hover { background: var(--bg-hover); color: var(--text-0); }
.nav-item.active { background: var(--accent-bg); color: var(--accent-text); font-weight: 600; box-shadow: var(--shadow-card); }
.nav-advanced {
  padding: 12px 8px;
  border-top: 1px solid rgba(27, 41, 64, 0.08);
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
}
.advanced-toggle {
  display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 10px;
  font-size: 12px; color: var(--text-2);
}
.advanced-toggle input { display: none; }
.advanced-slider {
  position: relative; width: 38px; height: 22px; border-radius: 999px;
  background: rgba(27, 41, 64, 0.12); transition: background 0.18s ease;
}
.advanced-slider::after {
  content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px;
  border-radius: 50%; background: #fff; box-shadow: 0 2px 6px rgba(18, 24, 38, 0.18); transition: transform 0.18s ease;
}
.advanced-toggle input:checked + .advanced-slider { background: var(--accent); }
.advanced-toggle input:checked + .advanced-slider::after { transform: translateX(16px); }
.advanced-note {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-3);
}

.settings-content { flex: 1; overflow: hidden; min-width: 0; }
.settings-scroll {
  height: 100%;
  overflow-y: auto;
  padding: var(--sp-8) clamp(var(--sp-4), 4vw, var(--sp-10));
  max-width: 920px;
  margin: 0 auto;
  animation: fadeUp 0.3s var(--ease-out);
}
.settings-head { margin-bottom: var(--sp-6); }
.settings-head-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-4);
  flex-wrap: wrap;
}
.settings-title-block { flex: 1; min-width: min(100%, 280px); }
.settings-title-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}
.settings-title-tight { margin: 0; }
.settings-skills-kicker { font-size: 12px; margin-top: 2px; }
.settings-desc-spaced { margin-top: var(--sp-3); max-width: 52ch; }
.settings-head-cta { flex-shrink: 0; align-self: flex-start; margin-top: 2px; }
.settings-head-actions {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: 2px;
  flex-wrap: wrap;
}
.skill-upload-overwrite {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  margin: 0;
  cursor: pointer;
}
.skill-upload-overwrite input { margin: 0; }
.agent-type-badge-lg { width: 32px; height: 32px; font-size: 16px; }
.skills-empty { padding: var(--sp-12) var(--sp-6); }
.settings-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.settings-brand-mark {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  border-radius: 15px;
  border: 1px solid var(--border);
  background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(242,247,255,0.9));
  box-shadow: var(--shadow-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.settings-brand-logo {
  width: 100%;
  height: 100%;
  max-width: 46px;
  max-height: 46px;
  object-fit: contain;
  object-position: center;
  display: block;
}
.settings-brand-fallback {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
  color: var(--accent-text);
  line-height: 1;
}
.settings-brand-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  line-height: 1;
}
.settings-brand-kicker {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-3);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.settings-brand-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-1);
  font-family: var(--font-display);
}
.settings-title { font-family: var(--font-display); font-size: 22px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.3; }
.settings-desc { font-size: 13px; color: var(--text-2); margin-top: 4px; line-height: 1.55; }

/* AI Config */
.setup-panel {
  padding: 18px 18px 16px;
  margin-bottom: 18px;
}
.setup-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.setup-panel-head.compact { margin-bottom: 12px; }
.setup-kicker {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-3);
  margin-bottom: 4px;
}
.setup-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-0);
}
.setup-desc {
  font-size: 12px;
  color: var(--text-2);
  margin-top: 4px;
}
.preset-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.preset-grid.compact {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 8px;
}
.preset-card {
  border: 1px solid var(--border);
  border-radius: 16px;
  background: rgba(255,255,255,0.82);
  padding: 12px 13px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.preset-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.preset-service { font-size: 12px; font-weight: 600; }
.preset-model { font-size: 12px; color: var(--text-1); }
.preset-base { font-size: 11px; color: var(--text-3); }
.preset-key {
  font-size: 11px;
  word-break: break-all;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.preset-edit-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}
.preset-edit-spacer { flex: 1; }
.preset-bulk-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.preset-policy-field {
  display: grid;
  gap: 8px;
}
.preset-policy-toggle {
  justify-self: start;
}
.template-row { display: flex; flex-wrap: wrap; gap: 8px; }
.template-type-chip {
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.82);
  color: var(--text-1);
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: 0.15s;
}
.template-type-chip:hover {
  border-color: var(--accent);
  color: var(--accent-text);
  background: var(--accent-bg);
}
.sections { display: flex; flex-direction: column; gap: var(--sp-6); }
.user-settings-sections .setup-panel,
.user-settings-sections .settings-type-section {
  margin-bottom: 0;
}
.user-settings-sections .settings-type-section + .setup-panel {
  margin-top: 0;
}
.settings-type-section {
  padding: var(--sp-5) var(--sp-5) var(--sp-4);
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-lg);
  background: var(--panel-bg);
  box-shadow: var(--shadow-xs);
}
.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-3);
  flex-wrap: wrap;
  margin-bottom: var(--sp-3);
  padding-bottom: var(--sp-3);
  border-bottom: 1px solid var(--border);
}
.section-head-text { min-width: 0; flex: 1 1 200px; }
.section-head-actions {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  flex-shrink: 0;
}
.section-title { font-size: 14px; font-weight: 700; color: var(--text-0); }
.section-subtitle { font-size: 12px; color: var(--text-3); margin-top: 4px; line-height: 1.45; max-width: 56ch; }
.config-list { display: flex; flex-direction: column; gap: var(--sp-2); }
.config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  flex-wrap: wrap;
  padding: var(--sp-3) var(--sp-4);
}
.config-info { flex: 1 1 220px; display: flex; align-items: center; gap: 10px; min-width: 0; }
.config-actions {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  flex-shrink: 0;
}
.config-main { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.config-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
.config-provider { font-size: 13px; font-weight: 600; }
.config-name { font-size: 12px; color: var(--text-2); }
.config-model { font-size: 11px; color: var(--text-2); }
.config-credit { font-size: 11px; color: var(--accent-text); font-weight: 600; }
.config-base { font-size: 11px; color: var(--text-3); }
.config-empty { font-size: 12px; color: var(--text-3); padding: 12px 0; }

.toggle { position: relative; width: 30px; height: 17px; cursor: pointer; flex-shrink: 0; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle span { position: absolute; inset: 0; background: var(--bg-3); border-radius: 99px; transition: 0.2s; }
.toggle span::before { content: ''; position: absolute; width: 13px; height: 13px; left: 2px; bottom: 2px; background: var(--bg-0); border-radius: 50%; transition: 0.2s; box-shadow: var(--shadow); }
.toggle input:checked + span { background: var(--accent); }
.toggle input:checked + span::before { transform: translateX(13px); }

/* Agent */
.agent-kind-tabs {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.skills-kind-tabs {
  margin: 0 10px 10px;
  padding-top: 4px;
  flex-wrap: nowrap;
  gap: 6px;
}
.skills-kind-tabs .agent-kind-tab {
  flex: 1 1 0;
  min-width: 0;
  height: 28px;
  padding: 0 6px;
  font-size: 11px;
}
.agent-kind-tab {
  height: 32px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-0);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.agent-kind-tab:hover {
  background: var(--bg-hover);
  color: var(--text-0);
}
.agent-kind-tab.active {
  background: var(--accent-bg);
  border-color: rgba(76, 125, 255, 0.25);
  color: var(--accent-text);
}
.agent-list { display: flex; flex-direction: column; gap: 8px; }
.agent-card { overflow: hidden; }
.agent-card-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px; cursor: pointer; transition: background 0.1s; }
.agent-card-head:hover { background: var(--bg-hover); }
.agent-card-titles { flex: 1; min-width: 0; }
.agent-card-title { font-weight: 600; font-size: 14px; color: var(--text-0); }
.agent-card-meta { font-size: 12px; margin-top: 2px; }
.agent-type-badge { width: 36px; height: 36px; border-radius: var(--radius); background: var(--accent-bg); color: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
.agent-card-body { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 12px; border-top: 1px solid var(--border); padding-top: 16px; }
.agent-card-foot { display: flex; align-items: center; gap: 8px; padding-top: 8px; }

/* Skills 布局 */
.skills-layout { display: flex; height: 100%; overflow: hidden; }
.skills-agent-list {
  width: 200px; flex-shrink: 0; border-right: 1px solid var(--border);
  background: var(--bg-1); display: flex; flex-direction: column;
  overflow-y: auto;
}
.skills-agent-title {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;
  color: var(--text-3); padding: 14px 14px 8px;
}
.skills-agent-item {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 14px; font-size: 13px; cursor: pointer;
  border: none; background: none; color: var(--text-2);
  transition: all 0.12s; width: 100%; text-align: left;
  border-radius: 0;
}
.skills-agent-item:hover { background: var(--bg-hover); color: var(--text-0); }
.skills-agent-item.active { background: var(--accent-bg); color: var(--accent-text); font-weight: 600; }
.skills-agent-label { flex: 1; }
.skill-count-badge {
  font-size: 10px; font-weight: 700; font-family: var(--font-mono);
  background: var(--accent-bg); color: var(--accent-text);
  padding: 1px 5px; border-radius: 99px;
}
.skills-agent-item.active .skill-count-badge { background: rgba(255,255,255,0.2); color: inherit; }
.skills-main { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.skills-main .settings-scroll { max-width: 900px; }

.lesson-verdict-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.lesson-list { display: flex; flex-direction: column; gap: 10px; padding-bottom: var(--sp-8); }
.lesson-card { padding: 12px 14px; }
.lesson-card-head { display: flex; align-items: flex-start; gap: 10px; }
.lesson-card-titles { flex: 1; min-width: 0; }
.lesson-card-title { font-weight: 600; font-size: 14px; }
.lesson-card-meta { font-size: 11px; margin-top: 2px; }
.lesson-card-body { margin: 8px 0 0; font-size: 13px; line-height: 1.55; white-space: pre-wrap; }
.settings-head-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.lesson-modal { width: min(520px, calc(100vw - 40px)); }
.lesson-extract-modal { width: min(600px, calc(100vw - 40px)); max-height: calc(100vh - 48px); overflow-y: auto; }
.extract-preview { display: flex; flex-direction: column; gap: 8px; }
.extract-preview-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.extract-preview-list { display: flex; flex-direction: column; gap: 8px; max-height: 320px; overflow-y: auto; }
.extract-preview-item {
  display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; cursor: pointer;
}
.extract-preview-item:hover { background: var(--bg-hover); }
.extract-check { margin-top: 4px; flex-shrink: 0; accent-color: var(--accent); }
.extract-preview-body { flex: 1; min-width: 0; }
.extract-preview-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.extract-preview-content { margin: 6px 0 0; font-size: 12px; line-height: 1.5; }
.extract-preview-meta { font-size: 11px; margin-top: 4px; }
.extract-empty { padding: var(--sp-4) 0; }
.lesson-tags-row { grid-template-columns: 1fr 96px; align-items: end; }
.lesson-sort-field { min-width: 0; }
.lesson-active-toggle { align-self: flex-start; flex-shrink: 0; }

/* Skill */
.skill-list { display: flex; flex-direction: column; gap: 8px; }
.skill-card { overflow: hidden; }
.skill-card-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px; cursor: pointer; transition: background 0.1s; }
.skill-card-head:hover { background: var(--bg-hover); }
.skill-card-icon { color: var(--accent); flex-shrink: 0; }
.skill-card-titles { flex: 1; min-width: 0; }
.skill-card-title { font-weight: 600; font-size: 13px; color: var(--text-0); }
.skill-card-desc { font-size: 11px; margin-top: 2px; line-height: 1.4; }
.skill-card-delete { margin-right: 4px; }
.skill-card-body { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--border); padding-top: 12px; }
.skill-card-foot { display: flex; align-items: center; gap: 8px; }

/* Shared */
.field { display: flex; flex-direction: column; gap: 5px; }
.field-label { font-size: 12px; font-weight: 500; color: var(--text-1); }
.field-hint { font-size: 11px; color: var(--text-3); margin-top: 2px; }
.field-hint-warn { color: var(--error); margin-top: 6px; }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field-switch-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin: 4px 0 8px; }
.field-switch-copy { flex: 1; min-width: 0; }
.field-switch-copy .field-hint { margin: 4px 0 0; }

.overlay { position: fixed; inset: 0; background: rgba(34,45,66,0.32); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 100; animation: fadeIn 0.18s var(--ease-out); }
.modal { padding: 28px; width: 420px; display: flex; flex-direction: column; gap: 12px; box-shadow: var(--shadow-elevated); }
.modal-title { font-family: var(--font-display); font-size: 18px; font-weight: 700; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 6px; }
.config-modal { width: min(720px, calc(100vw - 40px)); max-height: calc(100vh - 48px); overflow-y: auto; }
.config-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.config-modal-head-main { min-width: 0; flex: 1; }
.config-modal-head-trailing {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.modal-head-simple {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.modal-head-simple .modal-title { margin: 0; flex: 1; min-width: 0; }
.modal-note {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-2);
}
.preset-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.preset-pill {
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.72);
  color: var(--text-1);
  border-radius: 999px;
  padding: 8px 11px;
  font-size: 12px;
  cursor: pointer;
}
.preset-pill:hover {
  border-color: var(--accent);
  background: var(--accent-bg);
  color: var(--accent-text);
}
.preset-pill-credit {
  margin-left: 4px;
  font-size: 11px;
  opacity: 0.9;
}
.endpoint-hint {
  margin-top: -4px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px dashed var(--border);
  background: rgba(244,248,255,0.72);
  font-size: 12px;
}
.test-result {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-radius: 14px;
  padding: 12px;
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.72);
}
.test-result.ok { border-color: rgba(74, 167, 92, 0.28); }
.test-result.bad { border-color: rgba(201, 88, 68, 0.28); }
.test-result-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-1);
}
.test-result-url,
.test-result-preview {
  font-size: 11px;
  color: var(--text-3);
  word-break: break-all;
}
.huohuo-grid {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 10px;
}
.huohuo-grid .field-hint a {
  color: var(--accent);
  text-decoration: none;
  font-weight: 500;
}
.huohuo-grid .field-hint a:hover {
  text-decoration: underline;
}

@media (max-width: 900px) {
  .preset-grid,
  .preset-grid.compact {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .settings-layout { flex: 1; min-height: 0; flex-direction: column; }
  .settings-content { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .settings-content > .settings-scroll { flex: 1; min-height: 0; height: auto; }
  .settings-nav {
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-3);
    border-right: none;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .settings-nav .nav-group { flex-direction: row; flex-wrap: wrap; align-items: center; }
  .settings-nav .nav-group-label { width: 100%; padding-bottom: 0; }
  .settings-nav .nav-item { width: auto; }
  .nav-advanced { border: none; padding: var(--sp-2) 0; width: 100%; }
  .skills-layout { flex: 1; min-height: 0; flex-direction: column; }
  .skills-agent-list {
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
    border-right: none;
    border-bottom: 1px solid var(--border);
    max-height: none;
    flex-shrink: 0;
  }
  .skills-agent-title { width: 100%; padding-bottom: var(--sp-1); }
  .skills-kind-tabs {
    width: 100%;
    margin: 0 var(--sp-3) var(--sp-2);
    flex-wrap: nowrap;
  }
  .skills-agent-item { width: auto; flex: 1 1 auto; min-width: 140px; border-radius: var(--radius); }
  .skills-main { flex: 1; min-height: 0; }
}

/* ── 平台账号管理（管理员） ─────────────────────────── */
.admin-users-loading,
.admin-users-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-muted, #6b7a90);
  font-size: 13px;
}
.admin-users-loading { display: inline-flex; gap: 8px; align-items: center; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.admin-users-table-wrap { overflow-x: auto; }
.admin-users-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.admin-users-table thead th {
  text-align: left;
  font-weight: 600;
  color: var(--text-muted, #6b7a90);
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-soft, rgba(0,0,0,0.06));
  background: transparent;
  font-size: 12px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.admin-users-table tbody td {
  padding: 12px;
  border-bottom: 1px solid var(--border-soft, rgba(0,0,0,0.04));
  vertical-align: middle;
}
.admin-users-table tbody tr:last-child td { border-bottom: none; }
.admin-users-table tbody tr.is-self { background: rgba(99, 102, 241, 0.04); }
.cell-id { font-variant-numeric: tabular-nums; color: var(--text-muted, #6b7a90); width: 60px; }
.cell-name { font-weight: 600; }
.cell-credits { font-variant-numeric: tabular-nums; }
.cell-actions { display: flex; gap: 6px; justify-content: flex-end; }
.self-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.12);
  color: #4f46e5;
  font-size: 11px;
  font-weight: 500;
}
.role-chip {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  background: rgba(99, 102, 241, 0.08);
  color: #4f46e5;
}
.role-chip.role-admin {
  background: rgba(220, 38, 38, 0.10);
  color: #b91c1c;
}
.btn-danger {
  background: rgba(220, 38, 38, 0.10);
  color: #b91c1c;
  border-color: rgba(220, 38, 38, 0.25);
}
.btn-danger:hover:not(:disabled) {
  background: rgba(220, 38, 38, 0.18);
}
.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.users-modal {
  width: 480px;
  max-width: calc(100vw - 32px);
}
.users-modal-sm { width: 380px; }
.users-modal-body { display: flex; flex-direction: column; gap: 12px; }
.users-hint { color: var(--text-muted, #6b7a90); font-size: 12px; margin-top: 4px; }
.users-password-card {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--radius, 8px);
  background: rgba(99, 102, 241, 0.06);
  border: 1px dashed rgba(99, 102, 241, 0.25);
}
.users-password-text {
  flex: 1;
  font-family: var(--font-mono, ui-monospace, Menlo, monospace);
  font-size: 13px;
  word-break: break-all;
}
.users-delete-target {
  font-weight: 600;
  font-size: 14px;
  margin: 8px 0 0;
  padding: 8px 12px;
  background: rgba(220, 38, 38, 0.05);
  border-radius: 6px;
}
</style>
