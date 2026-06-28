<template>
  <div class="bench-shell" v-if="projectBriefSnapshot">
    <header class="bench-header">
      <div class="bench-header-core">
        <button class="icon-back-btn bench-back-link" @click="navigateTo(`/drama/${dramaId}`)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          返回项目
        </button>
        <div class="bench-identity">
          <h1 class="bench-title">{{ projectBriefSnapshot.title }}</h1>
          <span class="bench-episode-chip">第 {{ epIndex }} 集</span>
          <span class="bench-meta-pill">{{ pipelineLabel(productionPipeline) }}工作台</span>
          <button
            class="btn btn-sm bench-pipeline-switch"
            @click="navigateTo(episodeWorkbenchPath(dramaId, epIndex, alternateProductionPipeline(productionPipeline)))"
          >
            切换{{ pipelineLabel(alternateProductionPipeline(productionPipeline)) }}工作台
          </button>
          <div class="bench-meta-row">
            <span class="bench-meta-pill">{{ workbenchNestedLabel }}</span>
            <span class="bench-meta-pill is-progress">{{ workbenchCompletionScore }}/{{ workbenchCompletionTotal }}</span>
            <span class="bench-meta-inline">{{ castList.length }} 角色 · {{ shotRowsForEpisode.length }} 镜头</span>
          </div>
        </div>
      </div>

      <div class="bench-header-aside">
        <div class="bench-actions">
          <button class="btn" @click="syncWorkbenchFromApi">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            刷新
          </button>
          <button class="btn btn-primary" @click="workbenchStageKey = episodeMergedVideoUrl ? 'export' : (shotRowsForEpisode.length ? 'production' : 'script')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            {{ episodeMergedVideoUrl ? '查看成片' : (shotRowsForEpisode.length ? '继续制作' : '开始制作') }}
          </button>
        </div>
      </div>
    </header>

    <div class="bench-body">
    <!-- ========== LEFT SIDEBAR ========== -->
    <aside class="rail-panel">
      <nav class="flow-menu">
        <div
          v-for="section in workbenchSidebarNav"
          :key="section.id"
          class="flow-group"
        >
          <div class="flow-group-label">{{ section.label }}</div>
          <button
            v-for="item in section.items"
            :key="item.key"
            :class="['flow-node flow-node-sub', { active: sidebarNavSubstepKey === item.key, done: item.done }]"
            @click="activateWorkbenchSubstep(item.key)"
          >
            <span class="flow-node-icon" :class="item.done ? 'icon-done' : sidebarNavSubstepKey === item.key ? 'icon-active' : ''">
              <svg v-if="item.done" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              <component v-else :is="item.icon" :size="11" />
            </span>
            <span class="flow-node-copy">
              <span class="flow-node-title">{{ item.label }}</span>
              <span v-if="item.desc" class="flow-node-hint">{{ item.desc }}</span>
            </span>
          </button>
        </div>
      </nav>

      <!-- Bottom: Progress + Refresh -->
      <div class="rail-footer">
        <div class="tally-wrap">
          <div class="tally-head">
            <span class="tally-label">制作进度</span>
            <span class="tally-val">{{ workbenchCompletionScore }}/{{ workbenchCompletionTotal }}</span>
          </div>
          <div class="tally-track">
            <div class="tally-fill" :style="{ width: (workbenchCompletionTotal ? workbenchCompletionScore / workbenchCompletionTotal * 100 : 0) + '%' }"></div>
          </div>
        </div>
        <div class="rail-quick-nav" v-if="sidebarQuickJumpItems.length">
          <button
            v-for="step in sidebarQuickJumpItems"
            :key="step.key"
            :class="['rail-quick-dot', { active: sidebarNavSubstepKey === step.key, done: step.done }]"
            @click="activateWorkbenchSubstep(step.key)"
            :title="step.label"
          ></button>
        </div>
        <button class="rail-reload-btn" @click="syncWorkbenchFromApi">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          刷新数据
        </button>
      </div>
    </aside>

    <!-- ========== MAIN CONTENT ========== -->
    <main class="canvas-main">
      <div v-if="sidebarNavSubsteps.length" class="panel-tabs">
        <button
          v-for="sub in sidebarNavSubsteps"
          :key="sub.key"
          :class="['panel-tab', { active: sidebarNavSubstepKey === sub.key, done: sub.done }]"
          @click="activateWorkbenchSubstep(sub.key)"
        >
          <span>{{ sub.label }}</span>
          <span v-if="sub.done" class="panel-tab-mark"></span>
        </button>
      </div>

      <!-- ===== SCRIPT PANEL ===== -->
      <div v-if="workbenchStageKey === 'script'" class="panel-root">
        <EpisodeScriptWizardPane
          v-if="screenplayStepIdx < 4"
          :step="screenplayStepIdx"
          :episode-id="activeEpisodeId"
          :episode-number="epIndex"
          v-model:raw-draft="rawDraftBuffer"
          v-model:formatted-script="formattedScriptBuffer"
          v-model:raw-url="rawUrlInput"
          :source-draft-glyph-count="sourceDraftGlyphCount"
          :screenplay-draft-glyph-count="screenplayDraftGlyphCount"
          :persisted-source-body="persistedSourceBody"
          :persisted-screenplay-body="persistedScreenplayBody"
          :cast-list="castList"
          :locations="locationRowsForEpisode"
          :assigned-voice-cast-count="assignedVoiceCastCount"
          :cast-preview-ready-count="castPreviewReadyCount"
          :voice-profile-select-options="voiceProfileSelectOptions"
          :voice-catalog-entries="voiceCatalogEntries"
          :lookup-voice-catalog-row="lookupVoiceCatalogRow"
          :agent-busy="agentBusy"
          :agent-busy-type="agentBusyType"
          :raw-url-fetching="rawUrlFetching"
          @save-raw="persistRawEpisodeDraft(); toast.success('已保存')"
          @import-url="importRawFromUrl"
          @skip-rewrite="advanceRewriteWizardSkip"
          @rewrite="invokeDramaScriptFormatterAgent"
          @extract="invokeDramaCastSceneExtractAgent"
          @assign-voice="invokeDramaVoiceAssignAgent"
          @batch-previews="batchGenerateCastPreviews"
          @map-voice="(id, voice) => mapCastVoiceSelection(id, voice)"
          @preview-character="generateOneCastPreview"
        />

        <!-- Step 4: Storyboard -->
        <div v-else class="wizard-pane">
          <div class="wizard-bar">
            <div class="bar-start">
              <div class="wizard-step">
                <span class="wizard-num">05</span>
                <span class="wizard-name">分镜列表</span>
              </div>
            </div>
            <div class="bar-end">
              <span v-if="shotRowsForEpisode.length" class="glyph-tally">{{ shotRowsForEpisode.length }} 镜头 · {{ summedShotDurationSec }}s</span>
              <button v-if="shotRowsForEpisode.length" class="btn btn-sm" @click="insertBlankShotRow">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                添加
              </button>
              <template v-if="!shotRowsForEpisode.length">
                <span class="config-pin">视频模型 · {{ boundVideoConfigCaption }}</span>
              </template>
              <button class="btn btn-sm" :disabled="agentBusy" @click="invokeDramaStoryboardBreakdownAgent">
                <Loader2 v-if="agentBusyType === 'drama_storyboard_breakdown'" :size="11" class="animate-spin" />
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                {{ shotRowsForEpisode.length ? '重新拆解' : 'AI 拆解分镜' }}
              </button>
            </div>
          </div>

          <div v-if="shotRowsForEpisode.length" class="split-cols">
            <!-- Shot List -->
            <div class="lens-list">
              <div class="lens-list-head">
                <div>
                  <div class="lens-list-title">镜头序列</div>
                  <div class="lens-list-sub">按镜头顺序检查内容与素材状态</div>
                </div>
                <span class="tag mono">{{ summedShotDurationSec }}s</span>
              </div>
              <div class="lens-list-body">
                <div
                  v-for="(sb, i) in shotRowsForEpisode"
                  :key="sb.id"
                  :class="['lens-item', { active: focusedShotRow?.id === sb.id }]"
                  @click="focusedShotRow = sb"
                >
                  <div class="lens-item-header">
                    <div class="lens-num">#{{ String(i+1).padStart(2,'0') }}</div>
                    <span class="tag" style="font-size:10px">{{ sb.shot_type || sb.shotType || '—' }}</span>
                    <span v-if="readShotLinkedCastIds(sb).length" class="tag" style="font-size:10px">{{ readShotLinkedCastIds(sb).length }} 角色</span>
                    <div class="lens-status">
                      <div v-if="sb.imageUrl || sb.composedImage || sb.firstFrameImage" class="lens-dot has-img" title="已生成图片"></div>
                      <div v-if="sb.videoUrl || sb.composedVideoUrl" class="lens-dot has-video" title="已生成视频"></div>
                      <div v-if="sb.dialogue" class="lens-dot has-dialogue" title="有对白"></div>
                    </div>
                  </div>
                  <div class="lens-body">
                    <div class="lens-desc">{{ sb.description || sb.title || '无描述' }}</div>
                  </div>
                  <div class="lens-meta">
                    <span class="mono text-muted" style="font-size:10px">{{ sb.duration || 10 }}s</span>
                    <span v-if="sb.location" class="lens-location">{{ sb.location }}</span>
                    <span v-if="readShotLinkedCastNames(sb).length" class="lens-location">{{ readShotLinkedCastNames(sb).join(' / ') }}</span>
                    <span v-if="sb.dialogue" class="lens-dialogue">{{ sb.dialogue }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Detail Panel -->
            <div class="inspector-panel" v-if="focusedShotRow">
                <div class="inspector-head">
                  <div class="inspector-head-copy">
                    <span class="inspector-head-title">镜头 #{{ shotRowsForEpisode.indexOf(focusedShotRow) + 1 }}</span>
                  <span class="inspector-head-sub">{{ focusedShotRow.title || `镜头 ${shotRowsForEpisode.indexOf(focusedShotRow) + 1}` }} · {{ focusedShotRow.shot_type || focusedShotRow.shotType || '未设置景别' }}</span>
                  </div>
                  <span class="tag mono">{{ (focusedShotRow.duration || 10) }}s</span>
                  <button class="btn btn-ghost btn-icon ml-auto" style="color:var(--error)" @click="removeShotFromWorkbench(focusedShotRow)">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                  </button>
              </div>
              <div class="inspector-body">
                <div class="inspector-hero">
                  <div class="inspector-hero-copy">
                    <div class="inspector-hero-label">镜头概览</div>
                    <div class="inspector-hero-text">{{ focusedShotRow.description || focusedShotRow.title || '当前镜头还没有画面描述，建议先补充核心动作和构图。' }}</div>
                    <div class="inspector-status-row">
                      <span class="tag">{{ renderShotLocationCaption(focusedShotRow) }}</span>
                      <span class="tag">{{ focusedShotRow.angle || '未设角度' }}</span>
                      <span class="tag">{{ focusedShotRow.movement || '未设运镜' }}</span>
                      <span class="tag" :class="readShotLeadFrameUrl(focusedShotRow) ? 'tag-success' : ''">首帧 {{ readShotLeadFrameUrl(focusedShotRow) ? '已生成' : '待生成' }}</span>
                      <span class="tag" :class="readShotTrailFrameUrl(focusedShotRow) ? 'tag-success' : ''">尾帧 {{ readShotTrailFrameUrl(focusedShotRow) ? '已生成' : '待生成' }}</span>
                      <span class="tag" :class="shotOwnsRawClip(focusedShotRow) ? 'tag-success' : ''">视频 {{ shotOwnsRawClip(focusedShotRow) ? '已生成' : '待生成' }}</span>
                    </div>
                  </div>
                  <div class="inspector-preview-grid">
                    <div class="inspector-preview-card">
                      <div class="inspector-preview-title">首帧</div>
                      <div class="inspector-preview-media">
                        <img
                          v-if="readShotLeadFrameUrl(focusedShotRow)"
                          :src="'/' + readShotLeadFrameUrl(focusedShotRow)"
                          class="zoom-hit"
                          @click.stop="revealAssetPreview('/' + readShotLeadFrameUrl(focusedShotRow), `镜头 #${shotRowsForEpisode.indexOf(focusedShotRow) + 1} 首帧`)"
                        />
                        <div v-else class="inspector-preview-empty">待生成</div>
                      </div>
                    </div>
                    <div class="inspector-preview-card">
                      <div class="inspector-preview-title">尾帧</div>
                      <div class="inspector-preview-media">
                        <img
                          v-if="readShotTrailFrameUrl(focusedShotRow)"
                          :src="'/' + readShotTrailFrameUrl(focusedShotRow)"
                          class="zoom-hit"
                          @click.stop="revealAssetPreview('/' + readShotTrailFrameUrl(focusedShotRow), `镜头 #${shotRowsForEpisode.indexOf(focusedShotRow) + 1} 尾帧`)"
                        />
                        <div v-else class="inspector-preview-empty">待生成</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="inspector-block">
                  <div class="inspector-block-head">
                    <span class="inspector-block-title">镜头结构</span>
                    <span class="inspector-block-copy">景别、角度、运镜、场景绑定和时长</span>
                  </div>
                  <div class="form-grid form-grid-4">
                    <label class="form-block">
                      <span class="form-label">标题</span>
                      <input :value="focusedShotRow.title || ''" class="input"
                        @blur="patchShotFieldValue(focusedShotRow, 'title', $event.target.value)" placeholder="如：雪地逼近" />
                    </label>
                    <label class="form-block">
                      <span class="form-label">景别</span>
                      <input
                        list="shot-type-list"
                        :value="focusedShotRow.shot_type || focusedShotRow.shotType || ''"
                        class="input"
                        placeholder="选择或输入景别"
                        @change="patchShotFieldValue(focusedShotRow, 'shot_type', $event.target.value)"
                      />
                      <datalist id="shot-type-list">
                        <option v-for="t in shotTypeOptions" :key="t" :value="t" />
                      </datalist>
                    </label>
                    <label class="form-block">
                      <span class="form-label">角度</span>
                      <input
                        list="shot-angle-list"
                        :value="focusedShotRow.angle || ''"
                        class="input"
                        placeholder="选择或输入角度"
                        @change="patchShotFieldValue(focusedShotRow, 'angle', $event.target.value)"
                      />
                      <datalist id="shot-angle-list">
                        <option v-for="t in shotAngleOptions" :key="t" :value="t" />
                      </datalist>
                    </label>
                    <label class="form-block">
                      <span class="form-label">运镜</span>
                      <input
                        list="shot-movement-list"
                        :value="focusedShotRow.movement || ''"
                        class="input"
                        placeholder="选择或输入运镜"
                        @change="patchShotFieldValue(focusedShotRow, 'movement', $event.target.value)"
                      />
                      <datalist id="shot-movement-list">
                        <option v-for="t in shotMovementOptions" :key="t" :value="t" />
                      </datalist>
                    </label>
                  </div>
                  <div class="form-grid form-grid-4">
                    <label class="form-block">
                      <span class="form-label">绑定角色</span>
                      <div class="cast-chip-row">
                        <button
                          v-for="char in castList"
                          :key="char.id"
                          type="button"
                          :class="['cast-chip', { active: shotHasCastLink(focusedShotRow, char.id) }]"
                          @click="toggleShotCastLink(focusedShotRow, char.id)"
                        >
                          {{ char.name }}
                        </button>
                        <span v-if="!castList.length" class="text-muted" style="font-size:12px">当前集还没有角色</span>
                      </div>
                    </label>
                    <label class="form-block">
                      <span class="form-label">绑定场景</span>
                      <select class="input" :value="focusedShotRow.scene_id || focusedShotRow.sceneId || ''"
                        @change="patchShotFieldValue(focusedShotRow, 'scene_id', $event.target.value ? Number($event.target.value) : null)">
                        <option value="">未绑定场景</option>
                        <option v-for="scene in locationRowsForEpisode" :key="scene.id" :value="scene.id">
                          {{ scene.location }} · {{ scene.time || '未设时间' }}
                        </option>
                      </select>
                    </label>
                    <label class="form-block">
                      <span class="form-label">地点</span>
                      <input :value="focusedShotRow.location || ''" class="input"
                        @blur="patchShotFieldValue(focusedShotRow, 'location', $event.target.value)" placeholder="场景地点" />
                    </label>
                    <label class="form-block">
                      <span class="form-label">时间</span>
                      <input :value="focusedShotRow.time || ''" class="input"
                        @blur="patchShotFieldValue(focusedShotRow, 'time', $event.target.value)" placeholder="如：深夜 / 清晨" />
                    </label>
                    <label class="form-block">
                      <span class="form-label">时长</span>
                      <input :value="focusedShotRow.duration || 10" class="input" type="number" min="1" max="60"
                        @blur="patchShotFieldValue(focusedShotRow, 'duration', Number($event.target.value))" />
                    </label>
                  </div>
                </div>
                <div class="inspector-block">
                  <div class="inspector-block-head">
                    <span class="inspector-block-title">画面语义</span>
                    <span class="inspector-block-copy">动作、结果、氛围和对白</span>
                  </div>
                  <div class="form-grid form-grid-2">
                    <label class="form-block">
                      <span class="form-label">动作</span>
                      <textarea :value="focusedShotRow.action || ''" class="textarea" rows="3"
                        @blur="patchShotFieldValue(focusedShotRow, 'action', $event.target.value)" placeholder="谁在做什么，表情和动作细节是什么" />
                    </label>
                    <label class="form-block">
                      <span class="form-label">结果</span>
                      <textarea :value="focusedShotRow.result || ''" class="textarea" rows="3"
                        @blur="patchShotFieldValue(focusedShotRow, 'result', $event.target.value)" placeholder="镜头结束时的状态变化或画面结果" />
                    </label>
                  </div>
                  <div class="form-grid form-grid-2">
                    <label class="form-block">
                      <span class="form-label">画面描述</span>
                      <textarea :value="focusedShotRow.description || ''" class="textarea" rows="4"
                        @blur="patchShotFieldValue(focusedShotRow, 'description', $event.target.value)" placeholder="描述画面内容..." />
                    </label>
                    <label class="form-block">
                      <span class="form-label">氛围</span>
                      <textarea :value="focusedShotRow.atmosphere || ''" class="textarea" rows="4"
                        @blur="patchShotFieldValue(focusedShotRow, 'atmosphere', $event.target.value)" placeholder="光线、色调、空气感、环境氛围" />
                    </label>
                  </div>
                  <label class="form-block">
                    <span class="form-label">对白 / 旁白</span>
                    <textarea :value="focusedShotRow.dialogue || ''" class="textarea" rows="3"
                      @blur="patchShotFieldValue(focusedShotRow, 'dialogue', $event.target.value)" placeholder="角色名：台词内容 或 旁白：内容" />
                  </label>
                </div>
                <div class="inspector-block">
                  <div class="inspector-block-head">
                    <span class="inspector-block-title">生成提示</span>
                    <span class="inspector-block-copy">分别服务图片、视频、配乐和音效生成</span>
                  </div>
                  <label class="form-block">
                    <span class="form-label">静态画面提示词</span>
                    <textarea :value="focusedShotRow.image_prompt || focusedShotRow.imagePrompt || ''" class="textarea" rows="4"
                      @blur="patchShotFieldValue(focusedShotRow, 'image_prompt', $event.target.value)" placeholder="用于首帧、尾帧和镜头图片的单帧画面提示词" />
                  </label>
                  <label class="form-block">
                    <span class="form-label">视频提示词</span>
                    <textarea :value="focusedShotRow.video_prompt || focusedShotRow.videoPrompt || ''" class="textarea" rows="5"
                      @blur="patchShotFieldValue(focusedShotRow, 'video_prompt', $event.target.value)" placeholder="按 3 秒分段的视频提示词..." />
                  </label>
                  <div class="form-grid form-grid-2">
                    <label class="form-block">
                      <span class="form-label">配乐提示词</span>
                      <textarea :value="focusedShotRow.bgm_prompt || focusedShotRow.bgmPrompt || ''" class="textarea" rows="3"
                        @blur="patchShotFieldValue(focusedShotRow, 'bgm_prompt', $event.target.value)" placeholder="如：压抑低频弦乐，缓慢推进" />
                    </label>
                    <label class="form-block">
                      <span class="form-label">音效提示词</span>
                      <textarea :value="focusedShotRow.sound_effect || focusedShotRow.soundEffect || ''" class="textarea" rows="3"
                        @blur="patchShotFieldValue(focusedShotRow, 'sound_effect', $event.target.value)" placeholder="如：风雪声、脚踩积雪、衣料摩擦声" />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="agentBusy && agentBusyType === 'drama_storyboard_breakdown'" class="wizard-loading">
            <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
            <div class="wait-msg">正在拆解分镜并生成提示词...</div>
          </div>

          <div v-else class="wizard-empty">
            <div class="vacant-art">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
                <rect x="2" y="2" width="20" height="20" rx="2.5"/><line x1="7" y1="8" x2="7" y2="16"/><line x1="10" y1="8" x2="10" y2="16"/><line x1="13" y1="8" x2="13" y2="16"/>
              </svg>
            </div>
            <div class="vacant-title">将剧本拆解为分镜序列</div>
            <div class="vacant-desc">AI 自动分析剧本，生成镜头列表和视频提示词</div>
            <div class="config-pin-banner">当前集视频模型：{{ boundVideoConfigCaption }}</div>
            <button class="btn btn-primary" @click="invokeDramaStoryboardBreakdownAgent">
              <Loader2 v-if="agentBusyType === 'drama_storyboard_breakdown'" :size="13" class="animate-spin" />
              <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              AI 拆解分镜
            </button>
          </div>
        </div>

      </div>

      <!-- ===== PRODUCTION PANEL ===== -->
      <div v-else-if="workbenchStageKey === 'production'" class="panel-root">
        <!-- Guard: need script -->
        <div v-if="!persistedScreenplayBody || !shotRowsForEpisode.length" class="wizard-empty" style="flex:1">
          <div class="vacant-art">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          </div>
          <div class="vacant-title">尚未准备就绪</div>
          <div class="vacant-desc">{{ !persistedScreenplayBody ? '请先完成剧本编写' : '请先完成分镜拆解' }}</div>
          <button class="btn btn-primary" @click="workbenchStageKey = 'script'">前往剧本</button>
        </div>

        <template v-else>
          <div class="wizard-bar clip-toolbar">
            <div class="bar-start">
              <div class="wizard-step">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                <span class="wizard-name">制作工作台</span>
              </div>
            </div>
            <div class="clip-tabs">
              <button
                v-for="t in assetPaneTabDefs"
                :key="t.id"
                :class="['clip-tab', { active: resourcePaneKey === t.id }]"
                @click="resourcePaneKey = t.id"
              >
                <component :is="t.icon" :size="11" />
                {{ t.label }}
                <span v-if="t.badge" class="clip-tab-badge">{{ t.badge }}</span>
              </button>
            </div>
          </div>

          <!-- Sub: Characters -->
          <div v-if="resourcePaneKey === 'castList'" class="clip-pane">
            <div class="clip-section-bar">
              <span class="text-muted" style="font-size:12px">{{ visiblePortraitCastRows.length }} 个需生成形象角色</span>
              <div class="video-config-trigger">
                <BaseSelect
                  :model-value="imageConfigPickerValue"
                  :options="imageProviderSelectOptions"
                  placeholder="选择图片模型"
                  searchable
                  style="width:min(260px, 40vw)"
                  @update:model-value="persistEpisodeImageConfig"
                />
                <span v-if="!imageConfigLocked" class="tag">未锁定</span>
                <FieldHelp text="未锁定时使用设置页里已激活、priority 最高的图片服务；选择后即锁定到本集。" />
              </div>
              <div v-if="imageAspectScope" class="image-aspect-trigger">
                <BaseSelect
                  :model-value="currentImageAspectRatio"
                  :options="imageAspectPickerOptions"
                  placeholder="比例"
                  searchable
                  style="width:min(210px, 34vw)"
                  @update:model-value="persistEpisodeImageAspectRatio(imageAspectScope, $event)"
                />
                  <FieldHelp :text="currentAspectHelpText" />
              </div>
              <span v-if="castList.length > visiblePortraitCastRows.length" class="tag">旁白仅保留声音</span>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm" @click="batchRequestCastPortraits">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  批量生成
                </button>
              </div>
            </div>
            <div class="tile-grid">
              <div v-for="c in visiblePortraitCastRows" :key="c.id" class="card tile-card">
                <div class="tile-cover">
                  <img
                    v-if="c.image_url || c.imageUrl"
                    :src="'/' + (c.image_url || c.imageUrl)"
                    class="zoom-hit"
                    @click.stop="revealAssetPreview('/' + (c.image_url || c.imageUrl), `${c.name} 角色形象`)"
                  />
                  <div v-else class="tile-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  <span class="tile-cover-badge" :class="(c.image_url || c.imageUrl) ? 'is-ready' : (castPortraitBusy(c.id) ? 'is-pending' : '')">{{ (c.image_url || c.imageUrl) ? '已生成' : (castPortraitBusy(c.id) ? '生成中' : '待生成') }}</span>
                </div>
                <div class="tile-body">
                  <div class="tile-name">{{ c.name }}</div>
                  <div class="tile-meta text-muted">{{ c.role || '角色' }}</div>
                </div>
                <div class="tile-foot">
                  <span :class="['status-dot', (c.image_url || c.imageUrl) && 'ok', castPortraitBusy(c.id) && 'pending']" />
                  <span class="text-muted" style="font-size:10px">{{ (c.image_url || c.imageUrl) ? '已生成' : (castPortraitBusy(c.id) ? '生成中' : '待生成') }}</span>
                  <button class="btn btn-sm ml-auto" :disabled="castPortraitBusy(c.id)" @click="requestCastPortraitRender(c.id)">{{ castPortraitBusy(c.id) ? '生成中' : '生成' }}</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Sub: Scenes -->
          <div v-else-if="resourcePaneKey === 'scenes'" class="clip-pane">
            <div class="clip-section-bar">
              <span class="text-muted" style="font-size:12px">{{ locationRowsForEpisode.length }} 个场景</span>
              <div class="video-config-trigger">
                <BaseSelect
                  :model-value="imageConfigPickerValue"
                  :options="imageProviderSelectOptions"
                  placeholder="选择图片模型"
                  searchable
                  style="width:min(260px, 40vw)"
                  @update:model-value="persistEpisodeImageConfig"
                />
                <span v-if="!imageConfigLocked" class="tag">未锁定</span>
                <FieldHelp text="未锁定时使用设置页里已激活、priority 最高的图片服务；选择后即锁定到本集。" />
              </div>
              <div v-if="imageAspectScope" class="image-aspect-trigger">
                <BaseSelect
                  :model-value="currentImageAspectRatio"
                  :options="imageAspectPickerOptions"
                  placeholder="比例"
                  searchable
                  style="width:min(210px, 34vw)"
                  @update:model-value="persistEpisodeImageAspectRatio(imageAspectScope, $event)"
                />
                  <FieldHelp :text="currentAspectHelpText" />
              </div>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm" @click="batchRequestLocationBackdrops">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  批量生成
                </button>
              </div>
            </div>
            <div class="tile-grid">
              <div v-for="s in locationRowsForEpisode" :key="s.id" class="card tile-card">
                <div class="tile-cover wide">
                  <img
                    v-if="s.image_url || s.imageUrl"
                    :src="'/' + (s.image_url || s.imageUrl)"
                    class="zoom-hit"
                    @click.stop="revealAssetPreview('/' + (s.image_url || s.imageUrl), `${s.location} 场景图`)"
                  />
                  <div v-else class="tile-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </div>
                  <span class="tile-cover-badge" :class="(s.image_url || s.imageUrl) ? 'is-ready' : (locationBackdropBusy(s.id) ? 'is-pending' : '')">{{ (s.image_url || s.imageUrl) ? '已生成' : (locationBackdropBusy(s.id) ? '生成中' : '待生成') }}</span>
                </div>
                <div class="tile-body">
                  <div class="tile-name">{{ s.location }}</div>
                  <div class="tile-meta text-muted">{{ s.time || '—' }}</div>
                </div>
                <div class="tile-foot">
                  <span :class="['status-dot', (s.image_url || s.imageUrl) && 'ok', locationBackdropBusy(s.id) && 'pending']" />
                  <span class="text-muted" style="font-size:10px">{{ (s.image_url || s.imageUrl) ? '已生成' : (locationBackdropBusy(s.id) ? '生成中' : '待生成') }}</span>
                  <button class="btn btn-sm ml-auto" :disabled="locationBackdropBusy(s.id)" @click="requestLocationBackdropRender(s.id)">{{ locationBackdropBusy(s.id) ? '生成中' : '生成' }}</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Sub: Dubbing -->
          <EpisodeDubbingPane
            v-else-if="resourcePaneKey === 'dubbing'"
            :eligible-shots="shotRowsForEpisode.filter(shotContainsSpeakableLine)"
            :tts-eligible-shot-count="ttsEligibleShotCount"
            :tts-completed-shot-count="ttsCompletedShotCount"
            :bound-audio-config-caption="boundAudioConfigCaption"
            :speaker-label="renderDialogueSpeakerLabel"
            :dialogue-text="readDialogueUtteranceText"
            :has-tts="shotHasRenderedTts"
            :tts-url="readShotTtsAssetUrl"
            @batch-generate="batchRequestShotDialogueTts"
            @generate-shot="requestShotDialogueTts"
          />

          <!-- Sub: Shots -->
          <div v-else-if="resourcePaneKey === 'shots' || resourcePaneKey === 'keyframes'" class="clip-pane">
            <div class="clip-section-bar">
              <span class="text-muted" style="font-size:12px">{{ shotRowsForEpisode.length }} 个镜头</span>
              <span class="tag mono">{{ shotsHavingFrameUrls }}/{{ shotRowsForEpisode.length }} 已有{{ resourcePaneKey === 'keyframes' ? '关键帧' : '帧图' }}</span>
              <div class="video-config-trigger">
                <BaseSelect
                  :model-value="imageConfigPickerValue"
                  :options="imageProviderSelectOptions"
                  placeholder="选择图片模型"
                  searchable
                  style="width:min(260px, 40vw)"
                  @update:model-value="persistEpisodeImageConfig"
                />
                <span v-if="!imageConfigLocked" class="tag">未锁定</span>
                <FieldHelp text="未锁定时使用设置页里已激活、priority 最高的图片服务；选择后即锁定到本集。" />
              </div>
              <div v-if="imageAspectScope" class="image-aspect-trigger">
                <BaseSelect
                  :model-value="currentImageAspectRatio"
                  :options="imageAspectPickerOptions"
                  placeholder="比例"
                  searchable
                  style="width:min(210px, 34vw)"
                  @update:model-value="persistEpisodeImageAspectRatio(imageAspectScope, $event)"
                />
                  <FieldHelp :text="currentAspectHelpText" />
              </div>
              <div class="ml-auto flex gap-1">
                <BaseSelect v-if="isAiPipeline && resourcePaneKey === 'shots'" v-model="shotFrameCaptureMode" :options="shotFrameModeOptions" placeholder="帧模式" searchable style="width:100px" />
                <template v-if="isFramePipeline && resourcePaneKey === 'keyframes'">
                  <button class="btn btn-sm btn-primary" @click="batchRequestShotSequenceFrames">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    批量生成序列帧
                  </button>
                </template>
                <button v-if="gridSplitCompositePath" class="btn btn-sm" @click="reopenGridCompositePreview">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
                  查看当前拼图
                </button>
                <div class="storyboard-puzzle-trigger">
                  <button class="btn btn-primary btn-sm" @click="openGridMosaicPanel">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                    分镜拼图
                  </button>
                  <FieldHelp :text="storyboardPuzzleHelpText" />
                </div>
              </div>
            </div>

            <div v-if="gridSplitCompositeArchive.length" class="mosaic-history-panel">
              <div v-if="gridSplitCompositePath" class="mosaic-strip">
                <button class="mosaic-strip-thumb" @click="revealAssetPreview('/' + gridSplitCompositePath, '当前分镜拼图')">
                  <img :src="'/' + gridSplitCompositePath" class="zoom-hit" />
                </button>
                <div class="mosaic-strip-copy">
                  <div class="mosaic-strip-head">
                    <span class="tag mono">{{ gridSplitTileDimensions.rows }}x{{ gridSplitTileDimensions.cols }}</span>
                    <span class="tag" v-if="gridSplitRecoveredMode">{{ gridSplitRecoveredMode }}</span>
                  </div>
                  <div class="mosaic-strip-title">当前分镜拼图</div>
                  <div class="mosaic-strip-meta">
                    <span v-if="gridSplitRecoveredAt">{{ gridSplitRecoveredAt }}</span>
                    <span>可继续切割并分配</span>
                  </div>
                </div>
                <div class="mosaic-strip-actions">
                  <button class="btn btn-sm" @click="reopenGridCompositePreview">预览</button>
                  <button class="btn btn-primary btn-sm" @click="continueGridMosaicStep">继续切割</button>
                </div>
              </div>
              <div class="mosaic-history-head">
                <div>
                  <div class="mosaic-history-title">历史拼图</div>
                  <div class="mosaic-history-subtitle">按需展开切换不同拼图，不默认占用第一屏</div>
                </div>
                <button class="btn btn-sm" @click="gridSplitArchiveExpanded = !gridSplitArchiveExpanded">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline :points="gridSplitArchiveExpanded ? '18 15 12 9 6 15' : '6 9 12 15 18 9'"/></svg>
                  {{ gridSplitArchiveExpanded ? '收起历史拼图' : `展开全部 (${gridSplitCompositeArchive.length})` }}
                </button>
              </div>
              <div v-if="gridSplitArchiveExpanded" class="mosaic-history-list">
                <button
                  v-for="item in gridSplitCompositeArchive"
                  :key="item.id"
                  :class="['mosaic-history-item', { active: item.localPath === gridSplitCompositePath }]"
                  @click="selectGridArchiveItem(item)"
                >
                  <div class="mosaic-history-thumb">
                    <img :src="'/' + item.localPath" class="zoom-hit" />
                  </div>
                  <div class="mosaic-history-copy">
                    <div class="mosaic-history-tags">
                      <span class="tag mono">#{{ item.id }}</span>
                      <span class="tag mono">{{ item.layout.rows }}x{{ item.layout.cols }}</span>
                      <span class="tag">{{ item.modeLabel }}</span>
                    </div>
                    <div class="mosaic-history-meta">{{ item.createdAtLabel }}</div>
                  </div>
                </button>
              </div>
            </div>

            <EpisodeKeyframeSequencePane
              v-if="resourcePaneKey === 'keyframes'"
              :shots="shotRowsForEpisode"
              :focused-shot-id="focusedShotRow?.id"
              sequence-help-duration="每帧 ≥ 3 秒"
              :read-sequence-paths="readShotSlideshowSequencePaths"
              :target-frame-count="readShotSlideshowTargetCount"
              :is-sequence-busy="shotSequenceBusy"
              :is-sequence-frame-busy="shotSequenceFrameBusy"
              @select-shot="focusedShotRow = $event"
              @generate-sequence="requestShotSequenceFrames"
              @generate-reference-frame="requestShotReferenceFrameRender"
              @regenerate-all-sequence="requestShotSequenceRegenerateAll"
              @preview-image="revealAssetPreview"
              @open-mosaic="openGridMosaicPanelForShotSequence"
            />

            <div v-else class="keyframe-scroll">
              <div class="keyframe-grid">
                <div v-for="(sb, i) in shotRowsForEpisode" :key="sb.id"
                  :class="['keyframe-row', 'card', { active: focusedShotRow?.id === sb.id }]"
                  @click="focusedShotRow = sb">
                  <!-- Info: number + type + desc -->
                  <div class="keyframe-info">
                    <div class="keyframe-top">
                      <span class="keyframe-num">#{{ String(i+1).padStart(2,'0') }}</span>
                      <span class="keyframe-badge">{{ sb.shot_type || sb.shotType || '—' }}</span>
                    </div>
                    <div class="keyframe-desc">{{ sb.description || sb.title || '—' }}</div>
                    <div class="keyframe-meta">
                      <span :class="['status-dot', readShotLeadFrameUrl(sb) && 'ok', shotFrameBusy(sb.id, 'first_frame') && 'pending']" />
                      <span class="text-muted" style="font-size:11px">首帧</span>
                      <span v-if="shotFrameCaptureMode === 'first_last'" style="display:flex;align-items:center;gap:4px">
                        <span :class="['status-dot', readShotTrailFrameUrl(sb) && 'ok', shotFrameBusy(sb.id, 'last_frame') && 'pending']" />
                        <span class="text-muted" style="font-size:11px">尾帧</span>
                      </span>
                    </div>
                  </div>
                  <!-- Thumbnails -->
                  <div class="keyframe-thumbs">
                    <div class="keyframe-thumb-wrap">
                      <div class="keyframe-thumb" @click.stop="!shotFrameBusy(sb.id, 'first_frame') && requestShotFrameRender(sb, 'first_frame')">
                        <img
                          v-if="readShotLeadFrameUrl(sb)"
                          :src="'/' + readShotLeadFrameUrl(sb)"
                          class="zoom-hit"
                          @click.stop="revealAssetPreview('/' + readShotLeadFrameUrl(sb), `镜头 #${String(i + 1).padStart(2, '0')} 首帧`)"
                        />
                        <div v-else class="keyframe-thumb-empty">
                          <Loader2 v-if="shotFrameBusy(sb.id, 'first_frame')" :size="14" class="animate-spin" />
                          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </div>
                        <span v-if="readShotLeadFrameUrl(sb)" class="keyframe-re">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                        </span>
                      </div>
                      <span class="keyframe-thumb-label">{{ shotFrameBusy(sb.id, 'first_frame') ? '首帧生成中' : '首帧' }}</span>
                    </div>
                    <div v-if="shotFrameCaptureMode === 'first_last'" class="keyframe-thumb-wrap">
                      <div class="keyframe-thumb" @click.stop="!shotFrameBusy(sb.id, 'last_frame') && requestShotFrameRender(sb, 'last_frame')">
                        <img
                          v-if="readShotTrailFrameUrl(sb)"
                          :src="'/' + readShotTrailFrameUrl(sb)"
                          class="zoom-hit"
                          @click.stop="revealAssetPreview('/' + readShotTrailFrameUrl(sb), `镜头 #${String(i + 1).padStart(2, '0')} 尾帧`)"
                        />
                        <div v-else class="keyframe-thumb-empty">
                          <Loader2 v-if="shotFrameBusy(sb.id, 'last_frame')" :size="14" class="animate-spin" />
                          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </div>
                        <span v-if="readShotTrailFrameUrl(sb)" class="keyframe-re">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                        </span>
                      </div>
                      <span class="keyframe-thumb-label">{{ shotFrameBusy(sb.id, 'last_frame') ? '尾帧生成中' : '尾帧' }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Grid Tool Dialog -->
            <div v-if="mosaicPanelVisible" class="overlay" @click.self="mosaicPanelVisible = false">
              <div class="card mosaic-tool">
                <div class="mosaic-tool-head">
                  <div class="field-label-row">
                    <span style="font-size:15px;font-weight:600;font-family:var(--font-display)">分镜拼图</span>
                    <FieldHelp :text="storyboardPuzzleHelpText" />
                  </div>
                  <button class="btn btn-ghost btn-icon ml-auto" @click="mosaicPanelVisible = false">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>

                <!-- Step 0: Config -->
                <div v-if="gridSplitWizardCursor === 0" class="mosaic-tool-body">
                  <div class="mosaic-mode-tabs">
                    <button v-for="m in cellGridModePicker" :key="m.id"
                      :class="['mosaic-mode-tab', { active: selectedCellGridMode === m.id }]"
                      @click="selectedCellGridMode = m.id; gridSplitSelectedShotIds = []; gridSplitAnchorShotId = null; cellAssignmentBuffer = []">
                      <span style="font-weight:600">{{ m.label }}</span>
                      <span class="text-muted" style="font-size:11px">{{ m.desc }}</span>
                    </button>
                  </div>

                  <div class="mosaic-config">
                    <label class="form-block" style="flex:0 0 auto" v-if="selectedCellGridMode !== 'multi_ref'">
                      <span class="form-label">布局</span>
                      <BaseSelect v-model="selectedCellGridLayout" :options="cellGridLayoutPicker" placeholder="布局" style="width:90px" />
                    </label>
                    <div class="form-block" style="flex:1">
                      <span class="form-label">
                        {{ selectedCellGridMode === 'multi_ref' ? '选择目标镜头' : '选择镜头' }}
                        <span class="text-muted" v-if="selectedCellGridMode !== 'multi_ref'">(已选 {{ gridSplitSelectedShotIds.length }})</span>
                      </span>
                    </div>
                    <div style="align-self:flex-end" v-if="selectedCellGridMode !== 'multi_ref'">
                      <button class="btn btn-sm" @click="flipAllGridShotPick">{{ gridSplitSelectedShotIds.length === shotRowsForEpisode.length ? '取消全选' : '全选' }}</button>
                    </div>
                  </div>

                  <div class="mosaic-pick-list">
                    <label v-for="(sb, i) in shotRowsForEpisode" :key="sb.id"
                      :class="['mosaic-pick-item', { selected: selectedCellGridMode === 'multi_ref' ? gridSplitAnchorShotId === sb.id : gridSplitSelectedShotIds.includes(sb.id) }]">
                      <input v-if="selectedCellGridMode === 'multi_ref'" type="radio" :value="sb.id" v-model="gridSplitAnchorShotId" name="grid-target" />
                      <input v-else type="checkbox" :value="sb.id" v-model="gridSplitSelectedShotIds" />
                      <span class="mono" style="font-size:11px;width:28px">#{{ String(i+1).padStart(2,'0') }}</span>
                      <span class="truncate" style="flex:1;font-size:12px">{{ sb.description || sb.title || '—' }}</span>
                    </label>
                  </div>

                  <div class="mosaic-tool-foot">
                    <span v-if="gridSplitWizardReady" class="tag mono">{{ gridSplitWizardDimensions.rows }}x{{ gridSplitWizardDimensions.cols }} = {{ gridSplitWizardDimensions.rows * gridSplitWizardDimensions.cols }}格</span>
                    <span class="text-muted" style="font-size:11px">{{ gridSplitPromptLoading ? gridSplitPromptCaption : gridSplitWizardSummary }}</span>
                    <button class="btn btn-primary ml-auto" :disabled="!gridSplitWizardReady || gridSplitPromptLoading" @click="synthesizeGridCellPrompts">
                      <Loader2 v-if="gridSplitPromptLoading" :size="12" class="animate-spin" />
                      <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                      {{ gridSplitPromptLoading ? '生成中' : '生成提示词' }}
                    </button>
                  </div>
                </div>

                <!-- Step 1: Prompt Preview -->
                <div v-else-if="gridSplitWizardCursor === 1" class="mosaic-tool-body">
                  <div class="mosaic-prompt-summary">
                    <div class="mosaic-prompt-label">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                      拼图提示词
                      <span v-if="gridSplitPromptSource" class="tag ml-8">{{ gridSplitPromptSource === 'agent' ? 'AI生成' : '模板兜底' }}</span>
                    </div>
                    <div class="mosaic-prompt-text">{{ gridSplitMasterPrompt || '（等待生成）' }}</div>
                  </div>

                  <div class="mosaic-blank-preview" :style="gridSplitBlankGridStyle">
                    <div v-for="(cell, i) in gridSplitCellPromptRows" :key="i" class="mosaic-blank-cell">
                      <div class="mosaic-blank-cell-index">#{{ cell.shot_number }} {{ {first_frame:'首帧',last_frame:'尾帧',reference:'参考'}[cell.frame_type] || '' }}</div>
                      <div class="mosaic-blank-cell-desc">{{ cell.prompt }}</div>
                    </div>
                    <div v-for="i in Math.max(0, (gridSplitWizardDimensions.rows * gridSplitWizardDimensions.cols) - gridSplitCellPromptRows.length)" :key="'empty-'+i" class="mosaic-blank-cell vacant">
                      <div class="mosaic-blank-cell-index">空</div>
                      <div class="mosaic-blank-cell-desc">—</div>
                    </div>
                  </div>

                  <div class="mosaic-tool-foot">
                    <button class="btn" @click="gridSplitWizardCursor = 0">上一步</button>
                    <button class="btn ml-auto" @click="synthesizeGridCellPrompts" :disabled="gridSplitPromptLoading">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                      重新生成
                    </button>
                    <button class="btn btn-primary" @click="startGridMosaicRender">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                      生成拼图
                    </button>
                  </div>
                </div>

                <!-- Step 2: Generating -->
                <div v-else-if="gridSplitWizardCursor === 2" class="mosaic-tool-body" style="align-items:center;justify-content:center;min-height:300px">
                  <Loader2 :size="28" class="animate-spin" style="color:var(--accent)" />
                  <div class="wait-msg" style="margin-top:12px">拼图生成中...</div>
                  <div class="text-muted" style="font-size:11px;margin-top:6px">{{ gridSplitStatusCaption }}</div>
                </div>

                <!-- Step 3: Preview -->
                <div v-else-if="gridSplitWizardCursor === 3" class="mosaic-tool-body mosaic-tool-body-preview">
                  <div class="mosaic-preview-layout">
                    <div class="mosaic-preview-pane">
                      <div class="mosaic-preview-wrap">
                        <div class="mosaic-preview-stage">
                          <img
                            :src="'/' + gridSplitCompositePath"
                            class="mosaic-preview-img zoom-hit"
                            @click.stop="revealAssetPreview('/' + gridSplitCompositePath, '分镜拼图预览')"
                          />
                          <div class="mosaic-overlay" :style="gridSplitOverlayStyle">
                            <button
                              v-for="(a, i) in gridVisibleAssignments"
                              :key="i"
                              type="button"
                              :class="['mosaic-overlay-cell', focusedCellAssignmentIdx === i && 'active']"
                              @click="focusGridCellSlot(i)"
                            >
                              <span class="mosaic-cell-label">{{ labelGridCellSlot(a) }}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                      <div class="mosaic-adjust-summary">
                        <span class="tag mono">{{ gridSplitTileDimensions.rows }}x{{ gridSplitTileDimensions.cols }} = {{ gridSplitTileDimensions.rows * gridSplitTileDimensions.cols }}格</span>
                        <span class="text-muted" style="font-size:12px">{{ gridAssignedCellCount }}/{{ gridVisibleAssignments.length }} 格已分配</span>
                        <span class="tag" v-if="gridAssignedCellCount < gridVisibleAssignments.length">未分配格子会被忽略，不会写回分镜</span>
                      </div>
                    </div>
                    <div class="mosaic-assignment-pane">
                      <div class="mosaic-assign-head">
                        <div class="mosaic-assign-title">格子分配</div>
                        <div class="mosaic-assign-subtitle">切分后由你自己决定每格对应哪个分镜</div>
                      </div>
                      <div v-if="gridAssignmentPageCount > 1" class="mosaic-assign-pagination">
                        <button class="btn btn-sm" :disabled="cellAssignmentPageIndex === 0" @click="cellAssignmentPageIndex--">上一页</button>
                        <span class="text-muted">第 {{ cellAssignmentPageIndex + 1 }}/{{ gridAssignmentPageCount }} 页</span>
                        <span class="text-muted">{{ gridAssignmentSliceStart + 1 }}-{{ gridAssignmentSliceEnd }} / {{ gridVisibleAssignments.length }}</span>
                        <button class="btn btn-sm ml-auto" :disabled="cellAssignmentPageIndex >= gridAssignmentPageCount - 1" @click="cellAssignmentPageIndex++">下一页</button>
                      </div>
                      <div class="mosaic-assign-columns">
                        <span>格</span>
                        <span>镜头</span>
                        <span>类型</span>
                        <span>当前绑定</span>
                      </div>
                      <div class="mosaic-assign-info">
                        <div v-for="item in gridPagedAssignments" :key="item.index" :class="['mosaic-assign-row', focusedCellAssignmentIdx === item.index && 'active']">
                          <span class="mosaic-assign-index">格{{ item.index + 1 }}</span>
                          <BaseSelect
                            :model-value="item.assignment.storyboard_id"
                            :options="gridShotPickerOptions"
                            placeholder="选择镜头"
                            @update:model-value="mutateGridCellSlot(item.index, 'storyboard_id', $event)"
                          />
                          <BaseSelect
                            :model-value="item.assignment.frame_type"
                            :options="gridFrameTypePickerOptions"
                            placeholder="帧类型"
                            style="width:100%"
                            @update:model-value="mutateGridCellSlot(item.index, 'frame_type', $event)"
                          />
                          <span class="mosaic-assign-bind">{{ titleGridCellSlot(item.assignment.storyboard_id) }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="mosaic-tool-foot">
                    <button class="btn" @click="gridSplitWizardCursor = 1">返回</button>
                    <button class="btn btn-primary ml-auto" @click="commitGridMosaicToShots">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                      切分并分配
                    </button>
                  </div>
                </div>

                <!-- Step 4: Done -->
                <div v-else-if="gridSplitWizardCursor === 4" class="mosaic-tool-body" style="align-items:center;justify-content:center;min-height:200px">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <div style="font-size:17px;font-weight:700;font-family:var(--font-display);margin-top:8px">分配完成</div>
                  <div class="text-muted" style="font-size:13px;margin-top:4px">{{ gridAssignedCellCount }} 格已分配</div>
                  <button class="btn btn-primary" style="margin-top:16px" @click="mosaicPanelVisible = false; syncWorkbenchFromApi()">关闭</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Sub: AI Videos -->
          <div v-else-if="isAiPipeline && resourcePaneKey === 'videos'" class="clip-pane">
            <div class="clip-section-bar">
              <span class="text-muted" style="font-size:12px">{{ shotRowsForEpisode.length }} 个镜头</span>
              <span class="tag mono">{{ shotsHavingRawVideos }}/{{ shotRowsForEpisode.length }} 已生成</span>
              <div class="video-config-trigger">
                <BaseSelect
                  :model-value="videoConfigPickerValue"
                  :options="videoProviderSelectOptions"
                  placeholder="选择视频模型"
                  searchable
                  style="width:min(260px, 40vw)"
                  @update:model-value="persistEpisodeVideoConfig"
                />
                <span v-if="!videoConfigLocked" class="tag">未锁定</span>
                <FieldHelp text="未锁定时使用设置页里已激活、priority 最高的视频服务；选择后即锁定到本集。" />
              </div>
              <div v-if="imageAspectScope" class="image-aspect-trigger">
                <BaseSelect
                  :model-value="currentImageAspectRatio"
                  :options="imageAspectPickerOptions"
                  placeholder="比例"
                  searchable
                  style="width:min(210px, 34vw)"
                  @update:model-value="persistEpisodeImageAspectRatio(imageAspectScope, $event)"
                />
                <FieldHelp :text="currentAspectHelpText" />
              </div>
              <div class="compose-options-trigger">
                <label class="compose-opt">
                  <input
                    type="checkbox"
                    :checked="episodeVideoGenOptions.generate_audio"
                    @change="persistEpisodeVideoGenOption('generate_audio', $event.target.checked)"
                  />
                  <span>模型音频</span>
                </label>
                <label class="compose-opt">
                  <input
                    type="checkbox"
                    :checked="episodeVideoGenOptions.generate_subtitles"
                    @change="persistEpisodeVideoGenOption('generate_subtitles', $event.target.checked)"
                  />
                  <span>模型字幕</span>
                </label>
                <FieldHelp :text="videoGenOptionsHelpText" />
              </div>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm" @click="batchRequestShotClips">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                  批量视频
                </button>
              </div>
            </div>
            <div class="clip-grid">
              <div v-for="(sb, i) in shotRowsForEpisode" :key="sb.id" class="card clip-card">
                <div class="clip-cover">
                  <video
                    v-if="shotOwnsRawClip(sb)"
                    :src="'/' + readShotClipUrl(sb)"
                    class="clip-video"
                    controls
                    preload="metadata"
                    playsinline
                  />
                  <img
                    v-else-if="shotOwnsFrameAsset(sb)"
                    :src="'/' + readShotPreviewImageUrl(sb)"
                    class="zoom-hit"
                    @click.stop="revealAssetPreview('/' + readShotPreviewImageUrl(sb), `镜头 #${String(i + 1).padStart(2, '0')} 参考图`)"
                  />
                  <div v-else class="clip-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                  </div>
                  <span class="clip-idx">#{{ String(i+1).padStart(2,'0') }}</span>
                  <span v-if="shotOwnsMergedClip(sb)" class="clip-overlay-badge">已合成</span>
                </div>
                <div class="clip-info">
                  <div class="clip-desc truncate">{{ sb.description || sb.title || '—' }}</div>
                  <div class="clip-meta-line">{{ sb.shot_type || sb.shotType || '未设景别' }} · {{ sb.duration || 10 }}s</div>
                  <div class="clip-dots">
                    <span :class="['status-dot', shotOwnsFrameAsset(sb) && 'ok']" /><span style="font-size:10px">图</span>
                    <span :class="['status-dot', shotOwnsRawClip(sb) && 'ok', shotClipBusy(sb.id) && 'pending']" /><span style="font-size:10px">{{ shotClipBusy(sb.id) ? '视频生成中' : '视频' }}</span>
                  </div>
                  <div v-if="shotClipErrorHint(sb.id)" class="clip-error">{{ shotClipErrorHint(sb.id) }}</div>
                </div>
                <div class="clip-actions">
                  <button class="btn btn-sm" :disabled="shotClipBusy(sb.id)" @click="requestShotClipRender(sb)">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    {{ shotClipBusy(sb.id) ? '生成中' : '生成视频' }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Sub: Frame Slideshow -->
          <div v-else-if="isFramePipeline && resourcePaneKey === 'slideshow'" class="clip-pane">
            <div class="clip-section-bar">
              <span class="text-muted" style="font-size:12px">{{ shotRowsForEpisode.length }} 个镜头</span>
              <span class="tag mono">{{ shotsHavingSlideshowClips }}/{{ shotRowsForEpisode.length }} 已生成</span>
              <FieldHelp text="将关键帧序列通过 FFmpeg Ken Burns 合成为镜头视频：每帧推镜并带平移（右/左/上/下/对角，按帧轮换），帧间硬切拼接，不使用 AI 视频模型。" />
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm" @click="batchRequestShotSlideshows">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  批量静帧
                </button>
              </div>
            </div>
            <div class="clip-grid">
              <div v-for="(sb, i) in shotRowsForEpisode" :key="sb.id" class="card clip-card">
                <div class="clip-cover">
                  <video
                    v-if="shotOwnsSlideshowClip(sb)"
                    :src="'/' + readShotSlideshowUrl(sb)"
                    class="clip-video"
                    controls
                    preload="metadata"
                    playsinline
                  />
                  <img
                    v-else-if="shotOwnsFrameAsset(sb)"
                    :src="'/' + readShotPreviewImageUrl(sb)"
                    class="zoom-hit"
                    @click.stop="revealAssetPreview('/' + readShotPreviewImageUrl(sb), `镜头 #${String(i + 1).padStart(2, '0')} 关键帧`)"
                  />
                  <div v-else class="clip-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  </div>
                  <span class="clip-idx">#{{ String(i+1).padStart(2,'0') }}</span>
                </div>
                <div class="clip-info">
                  <div class="clip-desc truncate">{{ sb.description || sb.title || '—' }}</div>
                  <div class="clip-meta-line">{{ sb.shot_type || sb.shotType || '未设景别' }} · {{ sb.duration || 10 }}s</div>
                  <div class="clip-dots">
                    <span :class="['status-dot', shotOwnsFrameAsset(sb) && 'ok']" /><span style="font-size:10px">关键帧</span>
                    <span :class="['status-dot', shotOwnsSlideshowClip(sb) && 'ok', slideshowClipBusy(sb.id) && 'pending']" /><span style="font-size:10px">{{ slideshowClipBusy(sb.id) ? '生成中' : '静帧' }}</span>
                  </div>
                </div>
                <div class="clip-actions">
                  <button
                    class="btn btn-sm"
                    :disabled="!shotOwnsFrameAsset(sb) || slideshowClipBusy(sb.id)"
                    @click="requestShotSlideshowRender(sb)"
                  >
                    {{ slideshowClipBusy(sb.id) ? '生成中' : (shotOwnsSlideshowClip(sb) ? '重新生成' : '生成静帧视频') }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Sub: Compose -->
          <div v-else-if="resourcePaneKey === 'compose'" class="clip-pane">
            <div class="clip-section-bar">
              <span class="text-muted" style="font-size:12px">{{ shotRowsForEpisode.length }} 个镜头</span>
              <span class="tag mono">{{ mergedClipShotCount }}/{{ shotRowsForEpisode.length }} 已合成</span>
              <FieldHelp :text="shotComposeHelpText" />
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm" @click="batchRequestShotComposes">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  批量合成
                </button>
              </div>
            </div>
            <div class="clip-grid">
              <div v-for="(sb, i) in shotRowsForEpisode" :key="sb.id" class="card clip-card">
                <div class="clip-cover">
                  <video
                    v-if="shotOwnsMergedClip(sb)"
                    :src="'/' + readShotMergedClipUrl(sb)"
                    class="clip-video"
                    controls
                    preload="metadata"
                    playsinline
                  />
                  <video
                    v-else-if="shotOwnsMotionClip(sb)"
                    :src="'/' + readShotMotionClipUrl(sb)"
                    class="clip-video"
                    controls
                    preload="metadata"
                    playsinline
                  />
                  <img
                    v-else-if="shotOwnsFrameAsset(sb)"
                    :src="'/' + readShotPreviewImageUrl(sb)"
                    class="zoom-hit"
                    @click.stop="revealAssetPreview('/' + readShotPreviewImageUrl(sb), `镜头 #${String(i + 1).padStart(2, '0')} 参考图`)"
                  />
                  <div v-else class="clip-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  </div>
                  <span class="clip-idx">#{{ String(i+1).padStart(2,'0') }}</span>
                  <span v-if="shotOwnsMergedClip(sb)" class="clip-overlay-badge">已合成</span>
                </div>
                <div class="clip-info">
                  <div class="clip-desc truncate">{{ sb.description || sb.title || '—' }}</div>
                  <div class="clip-meta-line">{{ sb.shot_type || sb.shotType || '未设景别' }} · {{ sb.duration || 10 }}s</div>
                  <div class="clip-dots">
                    <span :class="['status-dot', shotOwnsMotionClip(sb) && 'ok']" /><span style="font-size:10px">{{ isFramePipeline ? '静帧' : '视频' }}</span>
                    <span :class="['status-dot', shotHasRenderedTts(sb) && 'ok']" /><span style="font-size:10px">配音</span>
                    <span :class="['status-dot', shotOwnsMergedClip(sb) && 'ok', episodeMergeBusy(sb.id) && 'pending']" /><span style="font-size:10px">{{ episodeMergeBusy(sb.id) ? '合成中' : '合成' }}</span>
                  </div>
                  <div v-if="episodeMergeErrorHint(sb.id)" class="clip-error">{{ episodeMergeErrorHint(sb.id) }}</div>
                </div>
                <div class="clip-actions">
                  <button class="btn btn-sm" :disabled="!shotOwnsMotionClip(sb) || episodeMergeBusy(sb.id)" @click="requestShotClipCompose(sb)">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                    {{ episodeMergeBusy(sb.id) ? '合成中' : (shotOwnsMergedClip(sb) ? '重新合成' : '开始合成') }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Production Navigator -->
        </template>
      </div>

      <!-- ===== EXPORT PANEL ===== -->
      <EpisodeExportPanel
        v-else
        :shot-rows="shotRowsForEpisode"
        :episode-merged-video-url="episodeMergedVideoUrl"
        :episode-merge-in-progress="episodeMergeInProgress"
        :episode-export-ready="episodeExportReady"
        :summed-shot-duration-sec="summedShotDurationSec"
        :shot-ready-for-export="shotReadyForExport"
        :shot-owns-merged-clip="shotOwnsMergedClip"
        @start-merge="startEpisodeMergeJob"
        @go-script="workbenchStageKey = 'script'"
      />

      <div v-if="showProductionFooterNav" class="wizard-nav">
        <button
          v-if="workbenchStageKey === 'script'"
          class="wizard-nav-btn"
          :disabled="screenplayStepIdx === 0"
          @click="retreatScriptWizard"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          {{ scriptWizardBackLabel || '上一步' }}
        </button>
        <button
          v-else-if="workbenchStageKey === 'production'"
          class="wizard-nav-btn"
          :disabled="assetPaneTabIndex === 0"
          @click="assetPaneTabIndex = Math.max(0, assetPaneTabIndex - 1)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          {{ assetPaneTabDefs[Math.max(0, assetPaneTabIndex - 1)]?.label || '上一步' }}
        </button>

        <div class="wizard-nav-dots">
          <button
            v-for="step in footerNavItems"
            :key="step.key"
            :class="['wizard-nav-dot', { done: step.done, current: step.key === footerNavActiveKey }]"
            @click="activateWorkbenchSubstep(step.key)"
            :title="step.label"
          ></button>
        </div>

        <button
          v-if="workbenchStageKey === 'script'"
          class="wizard-nav-btn primary"
          :disabled="!scriptWizardCanAdvance"
          @click="advanceScriptWizard"
        >
          {{ scriptWizardForwardLabel || '下一步' }}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
        <button
          v-else-if="workbenchStageKey === 'production'"
          class="wizard-nav-btn primary"
          :disabled="workbenchStageKey === 'production' && resourcePaneKey === 'compose' && !episodeExportReady"
          @click="advanceAssetPaneStep"
        >
          {{ assetPaneTabIndex < assetPaneTabDefs.length - 1 ? (assetPaneTabDefs[assetPaneTabIndex + 1]?.label || '下一步') : '进入导出' }}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
      </div>

      <div v-if="lightboxPreviewState.open && lightboxPreviewState.src" class="overlay lightbox-overlay" @click.self="dismissAssetPreview">
        <div class="card lightbox-dialog">
          <div class="lightbox-head">
            <div class="lightbox-title">{{ lightboxPreviewState.title || '图片预览' }}</div>
            <button class="btn btn-ghost btn-icon" @click="dismissAssetPreview">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="lightbox-body">
            <img :src="lightboxPreviewState.src" :alt="lightboxPreviewState.title || '图片预览'" class="lightbox-img" />
          </div>
        </div>
      </div>
    </main>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
// 显式导入 ref：unimport 在这个 ~3500 行的组件里漏掉了 `ref` 的自动注入，
// 导致运行时报 `ReferenceError: ref is not defined`。其他标识符
// (computed / watch / onMounted / useRoute) 自动导入工作正常。
import BaseSelect from '~/components/base-select.vue'
import FieldHelp from '~/components/field-help.vue'
import EpisodeExportPanel from '~/components/episode/shared/episode-export-panel.vue'
import EpisodeDubbingPane from '~/components/episode/shared/episode-dubbing-pane.vue'
import EpisodeKeyframeSequencePane from '~/components/episode/shared/episode-keyframe-sequence-pane.vue'
import EpisodeScriptWizardPane from '~/components/episode/shared/episode-script-wizard-pane.vue'
import { useAgent } from '~/composables/useAgent'
import {
  dramaAPI, episodeAPI, storyboardAPI, characterAPI, sceneAPI,
  imageAPI, videoAPI, composeAPI, slideshowAPI, mergeAPI, gridAPI, aiConfigAPI, voicesAPI, templatesAPI,
} from '~/composables/use-api'
import {
  Users, MapPin, Video, ImageIcon, Layers, Mic2, FileText, FolderKanban, Clapperboard, Download, Film,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import {
  defaultAspectRatioForScope,
  imageAspectHelpText,
  imageAspectSelectOptions,
  mergeEpisodeImageSizes,
  readEpisodeImageSizes,
  videoAspectHelpText,
} from '~/common/media/imageAspectPresets'
import {
  mergeEpisodeVideoGenOptions,
  readEpisodeVideoGenOptions,
  videoGenOptionsHelpText,
} from '~/common/media/videoGenOptions'
import {
  normalizeProductionPipeline,
  pipelineLabel,
  readEpisodeProductionPipeline,
  readEpisodeFrameMergedUrl,
  alternateProductionPipeline,
  episodeWorkbenchPath,
} from '~/common/media/productionPipeline'
import {
  collectStoryboardKeyframePaths,
  collectSlideshowKeyframePaths,
  buildSeededReferenceImagesJson,
  buildReferenceImagesJson,
  readShotSlideshowUrlFromMeta,
  readShotFrameComposedUrlFromMeta,
  readStoryboardSequenceRefs,
  resolveSlideshowFrameTargetCount,
  shotHasKeyframeAssets,
} from '~/common/media/storyboardFrameMeta'

const props = defineProps({
  pipeline: {
    type: String,
    required: true,
    validator: (value) => value === 'ai_video' || value === 'frame_slideshow',
  },
})

const productionPipeline = computed(() => normalizeProductionPipeline(props.pipeline))
const isAiPipeline = computed(() => productionPipeline.value === 'ai_video')
const isFramePipeline = computed(() => productionPipeline.value === 'frame_slideshow')

// ── 路由上下文 ──────────────────────────────────────────────
const route = useRoute()
const dramaId = Number(route.params.id)
const epIndex = Number(route.params.epIndex)

// ── 分集数据与主舞台 ────────────────────────────────────────
// 注意：必须拆成单变量声明——unimport 对 `const a = ref(...), b = ref(...)`
// 的链式语法只识别第一个 `ref` 并注入，导致后续 ref 报 "ref is not defined"。
const projectBriefSnapshot = ref(null)
const episodeWorkbenchRow = ref(null)
const castList = ref([])
const locationRowsForEpisode = ref([])
const shotRowsForEpisode = ref([])
const episodeMergeJobState = ref(null)
const workbenchStageKey = ref('script')
const { running: agentBusy, runningType: agentBusyType, invokeWorkbenchAgent } = useAgent()

// ── 剧本文本（原始 / 格式化）────────────────────────────────
const rawDraftBuffer = ref('')
const formattedScriptBuffer = ref('')
const rawUrlInput = ref('')
const rawUrlFetching = ref(false)
const persistedSourceBody = computed(() => episodeWorkbenchRow.value?.content || '')
const persistedScreenplayBody = computed(() => episodeWorkbenchRow.value?.formatted_script || episodeWorkbenchRow.value?.formattedScript || '')
const activeEpisodeId = computed(() => episodeWorkbenchRow.value?.id || 0)
const sourceDraftGlyphCount = computed(() => rawDraftBuffer.value.replace(/\s/g, '').length || 0)
const screenplayDraftGlyphCount = computed(() => formattedScriptBuffer.value.replace(/\s/g, '').length || 0)
const assignedVoiceCastCount = computed(() => castList.value.filter(c => c.voice_id || c.voiceId).length)
const castPreviewReadyCount = computed(() => castList.value.filter(c => c.voice_preview_url || c.voicePreviewUrl).length)
const mergedClipShotCount = computed(() => {
  if (isFramePipeline.value) {
    return shotRowsForEpisode.value.filter(s =>
      readShotFrameComposedUrlFromMeta(s?.reference_images || s?.referenceImages),
    ).length
  }
  return shotRowsForEpisode.value.filter(s => s.composed_video_url || s.composedVideoUrl).length
})
const episodeMergedVideoUrl = computed(() => {
  if (episodeMergeInProgress.value) return null

  const fromJob = episodeMergeJobState.value?.merged_url
    || episodeMergeJobState.value?.mergedUrl
    || null
  if (fromJob) return fromJob

  if (isFramePipeline.value) {
    return readEpisodeFrameMergedUrl(episodeWorkbenchRow.value) || null
  }
  return episodeWorkbenchRow.value?.video_url
    || episodeWorkbenchRow.value?.videoUrl
    || null
})
const episodeMergeInProgress = computed(() => episodeMergeJobState.value?.status === 'processing')
const episodeMergePollTimer = ref(null)

// ── 剧本流水线步骤（改写 → 提取 → 音色 → 分镜）────────────
const screenplayStepIdx = ref(0)
const resourcePaneKey = ref('castList')
const assetPaneTabIndex = computed({
  get: () => assetPaneTabDefs.value.findIndex(t => t.id === resourcePaneKey.value),
  set: (v) => { resourcePaneKey.value = assetPaneTabDefs.value[v]?.id || 'castList' },
})
const shotFrameCaptureMode = ref('first')
const shotFrameModeStorageKey = `huohuo:shot-frame-mode:${dramaId}`

function restoreShotFrameCaptureMode() {
  if (typeof window === 'undefined') return
  const saved = window.localStorage.getItem(shotFrameModeStorageKey)
  if (saved === 'first_last' || saved === 'first') shotFrameCaptureMode.value = saved
}

function persistShotFrameCaptureMode(mode) {
  if (typeof window === 'undefined') return
  if (mode === 'first_last' || mode === 'first') {
    window.localStorage.setItem(shotFrameModeStorageKey, mode)
  }
}

watch(shotFrameCaptureMode, (mode) => persistShotFrameCaptureMode(mode))
const defaultVoiceCatalogSeed = [
  { id: 'alloy', label: 'Alloy', gender: '中性', traits: '平衡、自然、克制', suitable: '通用叙述、旁白、需要稳定输出的角色' },
  { id: 'echo', label: 'Echo', gender: '男声', traits: '低沉、稳重、冷静', suitable: '成熟男性、父辈、旁白、压迫感角色' },
  { id: 'fable', label: 'Fable', gender: '男声', traits: '温暖、讲述感、表现力强', suitable: '男主、成长型角色、叙事担当' },
  { id: 'onyx', label: 'Onyx', gender: '男声', traits: '深沉、有力、权威', suitable: '反派、强势角色、掌控型人物' },
  { id: 'nova', label: 'Nova', gender: '女声', traits: '温柔、甜润、亲和', suitable: '女主、母亲、柔和配角' },
  { id: 'shimmer', label: 'Shimmer', gender: '女声', traits: '明亮、活泼、年轻', suitable: '少女、轻快角色、跳脱配角' },
]
const voiceCatalogEntries = ref(defaultVoiceCatalogSeed)
const voiceProfileSelectOptions = computed(() => voiceCatalogEntries.value.map(v => ({ label: `${v.label} · ${v.traits}`, value: v.id })))
const videoProviderSelectOptions = computed(() => videoProviderRows.value.map(c => ({
  label: fmtProviderConfigLabel(c),
  value: c.id,
})))
const imageProviderSelectOptions = computed(() => imageProviderRows.value.map(c => ({
  label: fmtProviderConfigLabel(c),
  value: c.id,
})))
const shotFrameModeOptions = [{ label: '仅首帧', value: 'first' }, { label: '首尾帧', value: 'first_last' }]
const cellGridLayoutPicker = [
  { label: '2x2', value: '2x2' },
  { label: '3x3', value: '3x3' },
  { label: '4x4', value: '4x4' },
  { label: '5x5', value: '5x5' },
]

// ── AI 配置与生成任务 pending 状态 ───────────────────────────
const imageProviderRows = ref([])
const videoProviderRows = ref([])
const audioProviderRows = ref([])
const portraitRenderPendingIds = ref([])
const backdropRenderPendingIds = ref([])
const frameRenderPendingKeys = ref([])
const clipRenderPendingIds = ref([])
const mergeRenderPendingIds = ref([])
const clipFailureMessages = ref({})
const mergeFailureMessages = ref({})
const lightboxPreviewState = ref({ open: false, src: '', title: '' })

// ── 配置标签 / 预览 / pending 查询 ───────────────────────────
function fmtProviderConfigLabel(config) {
  if (!config) return '未配置'
  let modelName = ''
  try { const m = JSON.parse(config.model || '[]'); modelName = Array.isArray(m) ? (m[0] || '') : (m || '') } catch { modelName = config.model || '' }
  return modelName ? `${config.name} · ${modelName} (${config.provider})` : `${config.name} (${config.provider})`
}

function pickActiveProviderRow(rows) {
  if (!rows?.length) return null
  return [...rows]
    .filter((c) => c.is_active !== false && c.isActive !== false)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))[0] || null
}

function findProviderRowById(rows, id) {
  if (!id) return null
  return rows.find((c) => c.id === id) || null
}

function castPortraitBusy(id) {
  return portraitRenderPendingIds.value.includes(id)
}

function revealAssetPreview(src, title = '') {
  if (!src) return
  lightboxPreviewState.value = { open: true, src, title }
}

function dismissAssetPreview() {
  lightboxPreviewState.value = { open: false, src: '', title: '' }
}

function onAssetPreviewKeydown(event) {
  if (event.key === 'Escape' && lightboxPreviewState.value.open) dismissAssetPreview()
}

onMounted(() => {
  window.addEventListener('keydown', onAssetPreviewKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onAssetPreviewKeydown)
  stopEpisodeMergePoll()
})

function locationBackdropBusy(id) {
  return backdropRenderPendingIds.value.includes(id)
}

function shotFrameTaskKey(id, frameType) {
  return `${id}:${frameType}`
}

function shotFrameBusy(id, frameType) {
  return frameRenderPendingKeys.value.includes(shotFrameTaskKey(id, frameType))
}
function shotSequenceBusy(id) {
  return frameRenderPendingKeys.value.some(key => key.startsWith(`${id}:sequence`) || key.startsWith(`${id}:reference`))
}
function shotSequenceFrameBusy(id, frameIndex) {
  return frameRenderPendingKeys.value.includes(shotFrameTaskKey(id, `reference:${frameIndex}`))
}

function shotClipBusy(id) {
  return clipRenderPendingIds.value.includes(id)
}

function shotClipErrorHint(id) {
  return clipFailureMessages.value[id] || ''
}

function episodeMergeBusy(id) {
  return mergeRenderPendingIds.value.includes(id)
}

function episodeMergeErrorHint(id) {
  return mergeFailureMessages.value[id] || ''
}

function castMemberIsVoiceOnly(char) {
  const text = `${char?.name || ''} ${char?.role || ''}`.toLowerCase()
  return text.includes('旁白') || text.includes('narrator') || text.includes('画外音')
}

const visiblePortraitCastRows = computed(() => castList.value.filter(c => !castMemberIsVoiceOnly(c)))

const boundImageConfigId = computed(() => episodeWorkbenchRow.value?.drama_image_config_id || episodeWorkbenchRow.value?.dramaImageConfigId || null)
const boundVideoConfigId = computed(() => episodeWorkbenchRow.value?.drama_video_config_id || episodeWorkbenchRow.value?.dramaVideoConfigId || null)
const boundAudioConfigId = computed(() => episodeWorkbenchRow.value?.drama_audio_config_id || episodeWorkbenchRow.value?.dramaAudioConfigId || null)
const boundAudioProviderKey = computed(() => audioProviderRows.value.find(c => c.id === boundAudioConfigId.value)?.provider || '')
const boundImageConfigRow = computed(() => findProviderRowById(imageProviderRows.value, boundImageConfigId.value))
const fallbackImageConfigRow = computed(() => pickActiveProviderRow(imageProviderRows.value))
const boundVideoConfigRow = computed(() => findProviderRowById(videoProviderRows.value, boundVideoConfigId.value))
const fallbackVideoConfigRow = computed(() => pickActiveProviderRow(videoProviderRows.value))
const boundImageConfigCaption = computed(() => {
  if (boundImageConfigRow.value) return fmtProviderConfigLabel(boundImageConfigRow.value)
  if (fallbackImageConfigRow.value) return `未锁定 · ${fmtProviderConfigLabel(fallbackImageConfigRow.value)}`
  return '未配置'
})
const boundVideoConfigCaption = computed(() => {
  if (boundVideoConfigRow.value) return fmtProviderConfigLabel(boundVideoConfigRow.value)
  if (fallbackVideoConfigRow.value) return `未锁定 · ${fmtProviderConfigLabel(fallbackVideoConfigRow.value)}`
  return '未配置'
})
const videoConfigPickerValue = computed(() => boundVideoConfigId.value || fallbackVideoConfigRow.value?.id || null)
const videoConfigLocked = computed(() => !!boundVideoConfigId.value)
const imageConfigPickerValue = computed(() => boundImageConfigId.value || fallbackImageConfigRow.value?.id || null)
const imageConfigLocked = computed(() => !!boundImageConfigId.value)

const episodeImageSizes = ref({})
const episodeVideoGenOptions = ref(readEpisodeVideoGenOptions())
const imageAspectPickerOptions = imageAspectSelectOptions()
const imageAspectScope = computed(() => {
  if (resourcePaneKey.value === 'castList') return 'character'
  if (resourcePaneKey.value === 'scenes') return 'scene'
  if (resourcePaneKey.value === 'shots' || resourcePaneKey.value === 'keyframes') return 'shot'
  if (resourcePaneKey.value === 'videos' || resourcePaneKey.value === 'slideshow') return 'video'
  return null
})
const currentAspectHelpText = computed(() => (
  imageAspectScope.value === 'video' ? videoAspectHelpText() : imageAspectHelpText()
))
function readImageAspectForScope(scope) {
  return episodeImageSizes.value[scope] || defaultAspectRatioForScope(scope)
}
const currentImageAspectRatio = computed(() => {
  const scope = imageAspectScope.value
  return scope ? readImageAspectForScope(scope) : defaultAspectRatioForScope('shot')
})
async function persistEpisodeImageAspectRatio(scope, ratio) {
  if (!scope || !ratio) return
  episodeImageSizes.value = { ...episodeImageSizes.value, [scope]: ratio }
  if (!activeEpisodeId.value) return
  try {
    await episodeAPI.update(activeEpisodeId.value, { image_sizes: { [scope]: ratio } })
    if (episodeWorkbenchRow.value) {
      episodeWorkbenchRow.value.metadata = mergeEpisodeImageSizes(episodeWorkbenchRow.value.metadata, { [scope]: ratio })
    }
  } catch (e) {
    toast.error(e.message)
  }
}
const boundAudioConfigCaption = computed(() => fmtProviderConfigLabel(audioProviderRows.value.find(c => c.id === boundAudioConfigId.value)))

async function persistEpisodeVideoGenOption(key, checked) {
  episodeVideoGenOptions.value = { ...episodeVideoGenOptions.value, [key]: checked }
  if (!activeEpisodeId.value) return
  try {
    await episodeAPI.update(activeEpisodeId.value, { video_gen_options: episodeVideoGenOptions.value })
    if (episodeWorkbenchRow.value) {
      episodeWorkbenchRow.value.metadata = mergeEpisodeVideoGenOptions(
        episodeWorkbenchRow.value.metadata,
        { [key]: checked },
      )
    }
  } catch (e) {
    toast.error(e.message)
  }
}

async function persistEpisodeVideoConfig(configId) {
  if (!activeEpisodeId.value || !configId) return
  try {
    await episodeAPI.update(activeEpisodeId.value, { drama_video_config_id: configId })
    if (episodeWorkbenchRow.value) {
      episodeWorkbenchRow.value.drama_video_config_id = configId
      episodeWorkbenchRow.value.dramaVideoConfigId = configId
    }
    toast.success('已锁定本集视频模型')
  } catch (e) {
    toast.error(e.message)
  }
}

async function persistEpisodeImageConfig(configId) {
  if (!activeEpisodeId.value || !configId) return
  try {
    await episodeAPI.update(activeEpisodeId.value, { drama_image_config_id: configId })
    if (episodeWorkbenchRow.value) {
      episodeWorkbenchRow.value.drama_image_config_id = configId
      episodeWorkbenchRow.value.dramaImageConfigId = configId
    }
    toast.success('已锁定本集图片模型')
  } catch (e) {
    toast.error(e.message)
  }
}

// ── 分镜拼图工作流状态 ───────────────────────────────────────
const storyboardPuzzleHelpText =
  '将多个镜头生成一张风格统一的拼图大图，切分后分配到各镜头首帧、尾帧或参考图；比逐个生成更省时，画风更一致。'
const shotComposeHelpText =
  '「视频生成」产出的是 AI 原始镜头。「开始合成」会按镜头台词生成 TTS 配音与字幕，再用 ffmpeg 混流为成片；无对白则只处理视频与字幕。导出整集时拼接的是合成后的镜头。'
const mosaicPanelVisible = ref(false)
const gridSplitWizardCursor = ref(0)
const selectedCellGridLayout = ref('3x3')
const selectedCellGridMode = ref('first_frame')
const gridSplitSelectedShotIds = ref([])
const gridSplitAnchorShotId = ref(null)
const gridSplitRenderJobId = ref(null)
const gridSplitCompositePath = ref('')
const gridSplitStatusCaption = ref('')
const gridSplitTileDimensions = ref({ rows: 3, cols: 3 })
const gridSplitRecoveredAt = ref('')
const gridSplitRecoveredMode = ref('')
const gridSplitMasterPrompt = ref('')
const gridSplitCellPromptRows = ref([])
const gridSplitPromptSource = ref('')
const gridSplitPromptLoading = ref(false)
const gridSplitPromptCaption = ref('')
const cellAssignmentBuffer = ref([])
const gridSplitSavedShotIds = ref([])
const gridSplitCompositeArchive = ref([])
const gridSplitArchiveExpanded = ref(false)
const focusedCellAssignmentIdx = ref(0)
const cellAssignmentPageIndex = ref(0)
const gridSplitLocalStorageKey = computed(() => `huohuo:grid:${dramaId}:${activeEpisodeId.value || epIndex}`)

const cellGridModePicker = [
  { id: 'first_frame', label: '首帧', desc: '每格=一个镜头的首帧' },
  { id: 'first_last', label: '首尾帧', desc: '每镜头占一行：左首帧，右尾帧' },
  { id: 'multi_ref', label: '多参考', desc: '所有格子=同一镜头的参考图' },
]

const selectedCellGridShape = computed(() => {
  const [rows, cols] = String(selectedCellGridLayout.value || '3x3').split('x').map(Number)
  return {
    rows: rows || 3,
    cols: cols || 3,
  }
})
const gridWizardCellTotal = computed(() => {
  return selectedCellGridShape.value.rows * selectedCellGridShape.value.cols
})

const gridSplitWizardReady = computed(() => {
  if (selectedCellGridMode.value === 'multi_ref') return !!gridSplitAnchorShotId.value
  return gridSplitSelectedShotIds.value.length > 0
})

const gridSplitWizardSummary = computed(() => {
  if (selectedCellGridMode.value === 'multi_ref') {
    const idx = shotRowsForEpisode.value.findIndex(s => s.id === gridSplitAnchorShotId.value) + 1
    return gridSplitAnchorShotId.value ? `${selectedCellGridShape.value.rows}x${selectedCellGridShape.value.cols} 参考图 → 镜头 #${idx}` : '请选择一个镜头'
  }
  if (!gridSplitSelectedShotIds.value.length) return '请选择镜头'
  const count = gridSplitSelectedShotIds.value.length
  if (selectedCellGridMode.value === 'first_last') {
    const { rows, cols } = selectedCellGridShape.value
    return `${count} 个镜头 → ${rows}x${cols} 拼图（按首尾帧风格生成，切分后再手动分配）`
  }
  const { rows, cols } = selectedCellGridShape.value
  const cells = rows * cols
  return `${count} 个镜头 → ${rows}x${cols} 拼图（先生成拼图，切分后再手动分配）`
})

function seedGridCellSlots() {
  return Array.from({ length: gridSplitTileDimensions.value.rows * gridSplitTileDimensions.value.cols }, () => ({
    storyboard_id: null,
    frame_type: 'first_frame',
  }))
}

const gridVisibleAssignments = computed(() => cellAssignmentBuffer.value)
const gridAssignableShotIds = computed(() => {
  const assignedIds = [...new Set(gridVisibleAssignments.value.map(item => item?.storyboard_id).filter(Boolean))]
  const ids = Array.isArray(gridSplitSavedShotIds.value) && gridSplitSavedShotIds.value.length
    ? gridSplitSavedShotIds.value
    : assignedIds.length
      ? assignedIds
    : selectedCellGridMode.value === 'multi_ref'
      ? (gridSplitAnchorShotId.value ? [gridSplitAnchorShotId.value] : [])
      : gridSplitSelectedShotIds.value.length
        ? [...gridSplitSelectedShotIds.value]
        : shotRowsForEpisode.value.map(s => s.id)
  return ids.filter(id => shotRowsForEpisode.value.some(s => s.id === id))
})
const gridShotPickerOptions = computed(() => [
  { label: '未分配', value: null },
  ...gridAssignableShotIds.value.map((id) => {
    const index = shotRowsForEpisode.value.findIndex(s => s.id === id) + 1
    const sb = shotRowsForEpisode.value.find(s => s.id === id)
    return {
      label: `#${String(index).padStart(2, '0')} ${sb?.title || sb?.description || '镜头'}`,
      value: id,
    }
  }),
])
const gridFrameTypePickerOptions = computed(() => {
  return [
    { label: '首帧', value: 'first_frame' },
    { label: '尾帧', value: 'last_frame' },
    { label: '参考图', value: 'reference' },
  ]
})
const gridAssignedCellCount = computed(() => gridVisibleAssignments.value.filter(item => !!item.storyboard_id).length)
const gridAssignmentPageSize = computed(() => {
  if (gridVisibleAssignments.value.length >= 25) return 8
  if (gridVisibleAssignments.value.length >= 16) return 10
  if (gridVisibleAssignments.value.length >= 9) return 9
  return Math.max(1, gridVisibleAssignments.value.length || 1)
})
const gridAssignmentPageCount = computed(() => Math.max(1, Math.ceil(gridVisibleAssignments.value.length / gridAssignmentPageSize.value)))
const gridAssignmentSliceStart = computed(() => cellAssignmentPageIndex.value * gridAssignmentPageSize.value)
const gridAssignmentSliceEnd = computed(() => Math.min(gridVisibleAssignments.value.length, gridAssignmentSliceStart.value + gridAssignmentPageSize.value))
const gridPagedAssignments = computed(() => {
  return gridVisibleAssignments.value
    .slice(gridAssignmentSliceStart.value, gridAssignmentSliceEnd.value)
    .map((assignment, offset) => ({
      assignment,
      index: gridAssignmentSliceStart.value + offset,
    }))
})

function wipeGridCellSlots() {
  cellAssignmentBuffer.value = seedGridCellSlots()
  focusedCellAssignmentIdx.value = 0
  cellAssignmentPageIndex.value = 0
}

function labelGridCellSlot(a) {
  if (!a?.storyboard_id) return '未分配'
  const idx = shotRowsForEpisode.value.findIndex(s => s.id === a.storyboard_id) + 1
  const suffix = { first_frame: '首', last_frame: '尾', reference: '参' }[a.frame_type] || ''
  return `#${idx}${suffix ? ` ${suffix}` : ''}`
}

function titleGridCellSlot(id) {
  if (!id) return '未分配'
  const idx = shotRowsForEpisode.value.findIndex(s => s.id === id) + 1
  const sb = shotRowsForEpisode.value.find(s => s.id === id)
  return `#${String(idx).padStart(2, '0')} ${sb?.title || sb?.description || '镜头'}`
}

function mutateGridCellSlot(index, field, value) {
  const next = [...cellAssignmentBuffer.value]
  next[index] = { ...next[index], [field]: value }
  cellAssignmentBuffer.value = next
  focusedCellAssignmentIdx.value = index
  if (gridSplitCompositePath.value) storeGridCompositePath(gridSplitCompositePath.value)
}

function focusGridCellSlot(index) {
  focusedCellAssignmentIdx.value = index
  cellAssignmentPageIndex.value = Math.floor(index / gridAssignmentPageSize.value)
}

const gridSplitOverlayStyle = computed(() => {
  const { rows, cols } = gridSplitTileDimensions.value
  return { 'grid-template-columns': `repeat(${cols}, 1fr)`, 'grid-template-rows': `repeat(${rows}, 1fr)` }
})

const gridSplitWizardDimensions = computed(() => {
  return selectedCellGridShape.value
})

const gridSplitBlankGridStyle = computed(() => {
  const { rows, cols } = gridSplitWizardDimensions.value
  return { 'grid-template-columns': `repeat(${cols}, 1fr)`, 'grid-template-rows': `repeat(${rows}, 1fr)` }
})

// Production step helpers
function assetPaneStepComplete(id) {
  if (id === 'castList') return !portraitRenderTargetCount.value || readyPortraitCount.value === portraitRenderTargetCount.value
  if (id === 'scenes') return !!locationRowsForEpisode.value.length && readyBackdropCount.value === locationRowsForEpisode.value.length
  if (id === 'dubbing') return !!shotRowsForEpisode.value.length && (!ttsEligibleShotCount.value || ttsCompletedShotCount.value === ttsEligibleShotCount.value)
  if (id === 'shots' || id === 'keyframes') return !!shotRowsForEpisode.value.length && shotsHavingFrameUrls.value === shotRowsForEpisode.value.length
  if (id === 'videos') return !!shotRowsForEpisode.value.length && shotsHavingRawVideos.value === shotRowsForEpisode.value.length
  if (id === 'slideshow') return !!shotRowsForEpisode.value.length && shotsHavingSlideshowClips.value === shotRowsForEpisode.value.length
  if (id === 'compose') return !!shotRowsForEpisode.value.length && mergedClipShotCount.value === shotRowsForEpisode.value.length
  return false
}
function shotReadyForExport(sb) {
  if (isFramePipeline.value) return shotOwnsMergedClip(sb) || shotOwnsSlideshowClip(sb)
  return shotOwnsMergedClip(sb) || shotOwnsRawClip(sb)
}
const exportReadyShotCount = computed(() => shotRowsForEpisode.value.filter(shotReadyForExport).length)
const episodeExportReady = computed(() => !!shotRowsForEpisode.value.length && exportReadyShotCount.value === shotRowsForEpisode.value.length)
function advanceAssetPaneStep() {
  if (assetPaneTabIndex.value < assetPaneTabDefs.value.length - 1) {
    assetPaneTabIndex.value++
  } else {
    workbenchStageKey.value = 'export'
  }
}

// Script step navigation
const scriptWizardPhaseLabels = ['原始内容', 'AI 改写', '提取', '音色', '分镜']
const scriptWizardBackLabel = computed(() => screenplayStepIdx.value > 0 ? scriptWizardPhaseLabels[screenplayStepIdx.value - 1] : '')
const scriptWizardForwardLabel = computed(() => {
  if (screenplayStepIdx.value === 4) return '进入制作'
  return scriptWizardPhaseLabels[screenplayStepIdx.value + 1] || ''
})
const scriptWizardCanAdvance = computed(() => {
  if (screenplayStepIdx.value === 0) return !!rawDraftBuffer.value.trim()
  if (screenplayStepIdx.value === 1) return !!formattedScriptBuffer.value.trim() || !!persistedScreenplayBody.value
  if (screenplayStepIdx.value === 2) return castList.value.length > 0
  if (screenplayStepIdx.value === 3) return assignedVoiceCastCount.value > 0
  if (screenplayStepIdx.value === 4) return shotRowsForEpisode.value.length > 0
  return false
})
function retreatScriptWizard() { if (screenplayStepIdx.value > 0) screenplayStepIdx.value-- }
function advanceScriptWizard() {
  if (screenplayStepIdx.value === 0 && rawDraftBuffer.value.trim()) { persistRawEpisodeDraft() }
  if (screenplayStepIdx.value === 1 && formattedScriptBuffer.value.trim()) { persistScreenplayDraft() }
  if (screenplayStepIdx.value === 4) { workbenchStageKey.value = 'production'; return }
  if (scriptWizardCanAdvance.value) screenplayStepIdx.value++
}

function flipAllGridShotPick() {
  if (gridSplitSelectedShotIds.value.length === shotRowsForEpisode.value.length) gridSplitSelectedShotIds.value = []
  else gridSplitSelectedShotIds.value = shotRowsForEpisode.value.map(s => s.id)
}

function openGridMosaicPanel() {
  gridSplitWizardCursor.value = 0
  gridSplitSelectedShotIds.value = []
  gridSplitAnchorShotId.value = null
  gridSplitSavedShotIds.value = []
  gridSplitMasterPrompt.value = ''
  gridSplitCellPromptRows.value = []
  gridSplitPromptSource.value = ''
  gridSplitPromptCaption.value = ''
  cellAssignmentBuffer.value = []
  mosaicPanelVisible.value = true
}

function openGridMosaicPanelForShot(sb) {
  if (!sb?.id) return
  focusedShotRow.value = sb
  openGridMosaicPanel()
  selectedCellGridMode.value = 'multi_ref'
  gridSplitAnchorShotId.value = sb.id
}

function resolveGridLayoutForFrameCount(count) {
  if (count <= 2) return '1x2'
  if (count <= 4) return '2x2'
  if (count <= 6) return '2x3'
  if (count <= 9) return '3x3'
  return '3x4'
}

function openGridMosaicPanelForShotSequence(sb) {
  if (!sb?.id) return
  focusedShotRow.value = sb
  selectedCellGridLayout.value = resolveGridLayoutForFrameCount(readShotSlideshowTargetCount(sb))
  openGridMosaicPanelForShot(sb)
}

function storeGridCompositePath(value) {
  if (typeof window === 'undefined') return
  if (!value) {
    window.localStorage.removeItem(gridSplitLocalStorageKey.value)
    return
  }
  const current = restoreGridStateFromStorage() || {}
  const entries = current.entries || {}
  entries[value] = {
    generationId: gridSplitRenderJobId.value,
    layout: gridSplitTileDimensions.value,
    shotIds: gridSplitSavedShotIds.value,
    assignments: cellAssignmentBuffer.value,
    recoveredAt: gridSplitRecoveredAt.value,
    recoveredMode: gridSplitRecoveredMode.value,
  }
  const payload = {
    activeImagePath: value,
    entries,
  }
  window.localStorage.setItem(gridSplitLocalStorageKey.value, JSON.stringify(payload))
}

function restoreGridStateFromStorage() {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(gridSplitLocalStorageKey.value)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return { activeImagePath: raw, entries: { [raw]: {} } }
  }
}

function applyGridStateSnapshot(imagePath, meta = {}) {
  gridSplitCompositePath.value = imagePath || ''
  gridSplitRenderJobId.value = meta.generationId || meta.id || null
  if (meta.layout?.rows && meta.layout?.cols) gridSplitTileDimensions.value = meta.layout
  if (Array.isArray(meta.shotIds)) gridSplitSavedShotIds.value = meta.shotIds
  else gridSplitSavedShotIds.value = []
  if (Array.isArray(meta.assignments)) cellAssignmentBuffer.value = meta.assignments
  else cellAssignmentBuffer.value = []
  gridSplitRecoveredAt.value = meta.recoveredAt || meta.createdAtLabel || ''
  gridSplitRecoveredMode.value = meta.recoveredMode || meta.modeLabel || ''
}

function selectGridArchiveItem(item) {
  const cached = restoreGridStateFromStorage()
  const cachedEntry = cached?.entries?.[item.localPath] || {}
  applyGridStateSnapshot(item.localPath, {
    ...item,
    ...cachedEntry,
    generationId: cachedEntry.generationId || item.id,
    recoveredAt: cachedEntry.recoveredAt || item.createdAtLabel,
    recoveredMode: cachedEntry.recoveredMode || item.modeLabel,
  })
  if (!cellAssignmentBuffer.value.length) wipeGridCellSlots()
  storeGridCompositePath(item.localPath)
}

function reopenGridCompositePreview() {
  if (!gridSplitCompositePath.value) {
    openGridMosaicPanel()
    return
  }
  mosaicPanelVisible.value = true
  if (!cellAssignmentBuffer.value.length) wipeGridCellSlots()
  gridSplitWizardCursor.value = 3
}

function parseGridLayoutToken(value) {
  const match = String(value || '').match(/grid_[^_]+_(\d+)x(\d+)$/)
  if (!match) return null
  return { rows: Number(match[1]) || 3, cols: Number(match[2]) || 3 }
}

function continueGridMosaicStep() {
  if (!gridSplitCompositePath.value) {
    toast.warning('还没有可继续切割的拼图')
    return
  }
  if (!cellAssignmentBuffer.value.length) wipeGridCellSlots()
  mosaicPanelVisible.value = true
  gridSplitWizardCursor.value = 3
}

function gatherDramaImagePromptShotIds() {
  if (selectedCellGridMode.value === 'multi_ref') return gridSplitAnchorShotId.value ? [gridSplitAnchorShotId.value] : []
  if (selectedCellGridMode.value === 'first_last') return [...gridSplitSelectedShotIds.value]
  return gridSplitSelectedShotIds.value.slice(0, gridWizardCellTotal.value)
}

async function synthesizeGridCellPrompts() {
  if (!gridSplitWizardReady.value) {
    toast.warning('请先选择镜头')
    return
  }
  gridSplitPromptLoading.value = true
  gridSplitPromptCaption.value = '正在调用 AI 生成拼图提示词...'
  gridSplitMasterPrompt.value = ''
  gridSplitCellPromptRows.value = []
  gridSplitPromptSource.value = ''
  try {
    const shotIds = gatherDramaImagePromptShotIds()
    const { rows, cols } = gridSplitWizardDimensions.value

    const res = await gridAPI.prompt({
      storyboard_ids: shotIds,
      drama_id: dramaId,
      episode_id: activeEpisodeId.value,
      rows,
      cols,
      mode: selectedCellGridMode.value,
    })

    gridSplitMasterPrompt.value = res?.grid_prompt || ''
    gridSplitCellPromptRows.value = Array.isArray(res?.cell_prompts) ? res.cell_prompts : []
    gridSplitPromptSource.value = res?.source || ''

    if (gridSplitMasterPrompt.value) {
      wipeGridCellSlots()
      gridSplitPromptCaption.value = gridSplitPromptSource.value === 'agent' ? 'AI 提示词已生成' : '已使用模板提示词'
      gridSplitWizardCursor.value = 1
    } else {
      gridSplitPromptCaption.value = ''
      toast.error('提示词生成失败')
    }
  } catch (e) {
    gridSplitPromptCaption.value = ''
    toast.error(e?.message || '生成提示词失败')
  } finally {
    gridSplitPromptLoading.value = false
  }
}

async function startGridMosaicRender() {
  let rows, cols, ids
  if (selectedCellGridMode.value === 'multi_ref') {
    rows = gridSplitWizardDimensions.value.rows; cols = gridSplitWizardDimensions.value.cols; ids = [gridSplitAnchorShotId.value]
  } else {
    rows = gridSplitWizardDimensions.value.rows; cols = gridSplitWizardDimensions.value.cols; ids = gridSplitSelectedShotIds.value.slice(0, gridWizardCellTotal.value)
    if (selectedCellGridMode.value === 'first_last') ids = [...gridSplitSelectedShotIds.value]
  }
  gridSplitSavedShotIds.value = ids.filter(Boolean)
  gridSplitTileDimensions.value = { rows, cols }
  if (!cellAssignmentBuffer.value.length) wipeGridCellSlots()
  gridSplitWizardCursor.value = 2
  gridSplitStatusCaption.value = '提交生成请求...'
  try {
    const res = await gridAPI.generate({
      storyboard_ids: ids,
      drama_id: dramaId,
      rows,
      cols,
      mode: selectedCellGridMode.value,
      custom_prompt: gridSplitMasterPrompt.value || undefined,
    })
    gridSplitRenderJobId.value = res.image_generation_id
    gridSplitTileDimensions.value = res.grid || { rows, cols }
    gridSplitStatusCaption.value = '等待图片生成...'
    pollGridMosaicRender()
  } catch (e) {
    toast.error(e.message)
    gridSplitWizardCursor.value = 0
  }
}

async function pollGridMosaicRender() {
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 3000))
    try {
      const res = await gridAPI.status(gridSplitRenderJobId.value)
      gridSplitStatusCaption.value = `状态: ${res.status}`
      if (res.status === 'completed' && res.local_path) {
        gridSplitCompositePath.value = res.local_path
        gridSplitRenderJobId.value = gridSplitRenderJobId.value || res.id || null
        storeGridCompositePath(res.local_path)
        gridSplitWizardCursor.value = 3
        return
      }
      if (res.status === 'failed') {
        toast.error(res.error_msg || '生成失败')
        gridSplitWizardCursor.value = 0
        return
      }
    } catch {}
  }
  toast.error('生成超时'); gridSplitWizardCursor.value = 0
}

async function fetchLatestGridComposite() {
  try {
    const rows = await imageAPI.list({ drama_id: dramaId })
    const list = Array.isArray(rows) ? rows : []
    const grids = list
      .filter((row) => row?.status === 'completed' && String(row?.frame_type || row?.frameType || '').startsWith('grid_') && (row?.local_path || row?.localPath))
      .sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))
      .map((row) => {
        const frameType = String(row?.frame_type || row?.frameType || '')
        const parsedLayout = parseGridLayoutToken(frameType) || { rows: 3, cols: 3 }
        return {
          id: row.id,
          localPath: row?.local_path || row?.localPath || '',
          layout: parsedLayout,
          modeLabel: frameType.replace(/^grid_/, '').replace(/_/g, ' · '),
          createdAtLabel: row?.created_at || row?.createdAt || '',
        }
      })

    gridSplitCompositeArchive.value = grids

    const cached = restoreGridStateFromStorage()
    const preferredPath = cached?.activeImagePath && grids.some(item => item.localPath === cached.activeImagePath)
      ? cached.activeImagePath
      : grids[0]?.localPath
    const current = grids.find(item => item.localPath === preferredPath)
    if (current) {
      const cachedEntry = cached?.entries?.[current.localPath] || {}
      applyGridStateSnapshot(current.localPath, {
        ...current,
        ...cachedEntry,
        generationId: cachedEntry.generationId || current.id,
        recoveredAt: cachedEntry.recoveredAt || current.createdAtLabel,
        recoveredMode: cachedEntry.recoveredMode || current.modeLabel,
      })
      if (!cellAssignmentBuffer.value.length) wipeGridCellSlots()
      storeGridCompositePath(current.localPath)
      return
    }
  } catch {}

  const cached = restoreGridStateFromStorage()
  if (cached?.activeImagePath) {
    const cachedEntry = cached?.entries?.[cached.activeImagePath] || {}
    applyGridStateSnapshot(cached.activeImagePath, {
      ...cachedEntry,
      recoveredAt: cachedEntry.recoveredAt || '',
      recoveredMode: cachedEntry.recoveredMode || '',
    })
  }
}

async function commitGridMosaicToShots() {
  const { rows, cols } = gridSplitTileDimensions.value
  try {
    const assignments = gridVisibleAssignments.value
      .filter(item => !!item.storyboard_id)
      .map(item => ({ storyboard_id: item.storyboard_id, frame_type: item.frame_type }))
    if (!assignments.length) {
      toast.warning('请至少分配一个格子')
      return
    }
    await gridAPI.split({ image_generation_id: gridSplitRenderJobId.value, rows, cols, assignments })
    storeGridCompositePath(gridSplitCompositePath.value)
    gridSplitWizardCursor.value = 4
    toast.success('切分分配完成')
  } catch (e) {
    toast.error(e.message)
  }
}

const readyPortraitCount = computed(() => visiblePortraitCastRows.value.filter(c => c.image_url || c.imageUrl).length)
const readyBackdropCount = computed(() => locationRowsForEpisode.value.filter(s => s.image_url || s.imageUrl).length)
const ttsEligibleShotCount = computed(() => shotRowsForEpisode.value.filter(s => shotContainsSpeakableLine(s)).length)
const ttsCompletedShotCount = computed(() => shotRowsForEpisode.value.filter(s => shotContainsSpeakableLine(s) && shotHasRenderedTts(s)).length)
const shotsHavingFrameUrls = computed(() => {
  if (isFramePipeline.value) {
    return shotRowsForEpisode.value.filter(shotHasKeyframeAssets).length
  }
  return shotRowsForEpisode.value.filter(s =>
    s.first_frame_image || s.firstFrameImage || s.last_frame_image || s.lastFrameImage || s.composed_image || s.composedImage,
  ).length
})
const shotsHavingRawVideos = computed(() => shotRowsForEpisode.value.filter(s => s.video_url || s.videoUrl).length)
const shotsHavingSlideshowClips = computed(() => shotRowsForEpisode.value.filter(s => readShotSlideshowUrl(s)).length)
const slideshowRenderPendingIds = ref([])
const portraitRenderTargetCount = computed(() => visiblePortraitCastRows.value.length)

const assetPaneTabDefs = computed(() => {
  const shared = [
    { id: 'castList', label: '角色形象', icon: Users, badge: portraitRenderTargetCount.value ? `${readyPortraitCount.value}/${portraitRenderTargetCount.value}` : '' },
    { id: 'scenes', label: '场景图片', icon: MapPin, badge: readyBackdropCount.value ? `${readyBackdropCount.value}/${locationRowsForEpisode.value.length}` : '' },
    { id: 'dubbing', label: '配音生成', icon: Mic2, badge: '' },
  ]
  if (isAiPipeline.value) {
    return [
      ...shared,
      { id: 'shots', label: '镜头图片', icon: ImageIcon, badge: shotsHavingFrameUrls.value ? `${shotsHavingFrameUrls.value}/${shotRowsForEpisode.value.length}` : '' },
      { id: 'videos', label: 'AI视频生成', icon: Video, badge: shotsHavingRawVideos.value ? `${shotsHavingRawVideos.value}/${shotRowsForEpisode.value.length}` : '' },
      { id: 'compose', label: '视频合成', icon: Layers, badge: mergedClipShotCount.value ? `${mergedClipShotCount.value}/${shotRowsForEpisode.value.length}` : '' },
    ]
  }
  return [
    ...shared,
    { id: 'keyframes', label: '关键帧序列', icon: ImageIcon, badge: shotsHavingFrameUrls.value ? `${shotsHavingFrameUrls.value}/${shotRowsForEpisode.value.length}` : '' },
    { id: 'slideshow', label: '静帧动画', icon: Film, badge: shotsHavingSlideshowClips.value ? `${shotsHavingSlideshowClips.value}/${shotRowsForEpisode.value.length}` : '' },
    { id: 'compose', label: '视频合成', icon: Layers, badge: mergedClipShotCount.value ? `${mergedClipShotCount.value}/${shotRowsForEpisode.value.length}` : '' },
  ]
})

const productionStageOptions = [
  { id: 'script', label: '剧本', desc: '内容改写与整理', icon: FileText },
  { id: 'assets', label: '资产', desc: '角色、场景与音色', icon: FolderKanban },
  { id: 'storyboard', label: '分镜', desc: '镜头制作与合成', icon: Clapperboard },
  { id: 'export', label: '导出', desc: '拼接与成片输出', icon: Download },
]

const productionSidebarItems = computed(() => {
  if (isAiPipeline.value) {
    return [
      { key: 'prod:castList', label: '角色形象', desc: '', icon: Users, done: assetPaneStepComplete('castList') },
      { key: 'prod:scenes', label: '场景图片', desc: '', icon: MapPin, done: assetPaneStepComplete('scenes') },
      { key: 'prod:dubbing', label: '配音生成', desc: '', icon: Mic2, done: assetPaneStepComplete('dubbing') },
      { key: 'prod:shots', label: '镜头图片', desc: '', icon: ImageIcon, done: assetPaneStepComplete('shots') },
      { key: 'prod:videos', label: 'AI视频生成', desc: '', icon: Video, done: assetPaneStepComplete('videos') },
      { key: 'prod:compose', label: '视频合成', desc: '', icon: Layers, done: assetPaneStepComplete('compose') },
    ]
  }
  return [
    { key: 'prod:castList', label: '角色形象', desc: '', icon: Users, done: assetPaneStepComplete('castList') },
    { key: 'prod:scenes', label: '场景图片', desc: '', icon: MapPin, done: assetPaneStepComplete('scenes') },
    { key: 'prod:dubbing', label: '配音生成', desc: '', icon: Mic2, done: assetPaneStepComplete('dubbing') },
    { key: 'prod:keyframes', label: '关键帧序列', desc: '', icon: ImageIcon, done: assetPaneStepComplete('keyframes') },
    { key: 'prod:slideshow', label: '静帧动画', desc: '', icon: Film, done: assetPaneStepComplete('slideshow') },
    { key: 'prod:compose', label: '视频合成', desc: '', icon: Layers, done: assetPaneStepComplete('compose') },
  ]
})

const workbenchSidebarNav = computed(() => ([
  {
    id: 'script',
    label: '剧本',
    items: [
      { key: 'script:raw', label: '原始内容', desc: '', icon: FileText, done: !!persistedSourceBody.value },
      { key: 'script:rewrite', label: 'AI 改写', desc: '', icon: FileText, done: !!persistedScreenplayBody.value },
      { key: 'script:extract', label: '提取', desc: '', icon: Users, done: !!castList.value.length },
      { key: 'script:voice', label: '音色', desc: '', icon: Mic2, done: !!castList.value.length && assignedVoiceCastCount.value === castList.value.length },
      { key: 'script:storyboard', label: '分镜', desc: '', icon: Clapperboard, done: !!shotRowsForEpisode.value.length },
    ],
  },
  {
    id: 'production',
    label: '制作',
    items: productionSidebarItems.value,
  },
  {
    id: 'export',
    label: '导出',
    items: [
      { key: 'export:merge', label: '拼接导出', desc: '', icon: Download, done: !!episodeMergedVideoUrl.value },
    ],
  },
]))

const activeProductionStage = computed(() => {
  if (workbenchStageKey.value === 'export') return 'export'
  if (workbenchStageKey.value === 'production') {
    return ['castList', 'scenes'].includes(resourcePaneKey.value) ? 'assets' : 'storyboard'
  }
  if (screenplayStepIdx.value <= 1) return 'script'
  if (screenplayStepIdx.value <= 3) return 'assets'
  return 'storyboard'
})

function workbenchStageFinished(stageId) {
  if (stageId === 'script') return !!persistedScreenplayBody.value
  if (stageId === 'assets') {
    const charsReady = !!castList.value.length && assignedVoiceCastCount.value === castList.value.length
    const charImagesReady = !portraitRenderTargetCount.value || readyPortraitCount.value === portraitRenderTargetCount.value
    const sceneImagesReady = !locationRowsForEpisode.value.length || readyBackdropCount.value === locationRowsForEpisode.value.length
    return charsReady && charImagesReady && sceneImagesReady
  }
  if (stageId === 'storyboard') {
    if (!shotRowsForEpisode.value.length) return false
    const ttsReady = !ttsEligibleShotCount.value || ttsCompletedShotCount.value === ttsEligibleShotCount.value
    const framesReady = shotsHavingFrameUrls.value === shotRowsForEpisode.value.length
    const motionReady = isAiPipeline.value
      ? shotsHavingRawVideos.value === shotRowsForEpisode.value.length
      : shotsHavingSlideshowClips.value === shotRowsForEpisode.value.length
    return ttsReady && framesReady && motionReady && mergedClipShotCount.value === shotRowsForEpisode.value.length
  }
  if (stageId === 'export') return !!episodeMergedVideoUrl.value
  return false
}

function activateWorkbenchStage(stageId) {
  if (stageId === 'script') {
    workbenchStageKey.value = 'script'
    screenplayStepIdx.value = Math.min(screenplayStepIdx.value, 1)
    return
  }
  if (stageId === 'assets') {
    const hasAssetWorkspace = !!portraitRenderTargetCount.value || !!locationRowsForEpisode.value.length
    const hasPendingAssetGeneration = (portraitRenderTargetCount.value && readyPortraitCount.value < portraitRenderTargetCount.value)
      || (locationRowsForEpisode.value.length && readyBackdropCount.value < locationRowsForEpisode.value.length)
    if (workbenchStageKey.value === 'production' || hasPendingAssetGeneration || hasAssetWorkspace) {
      workbenchStageKey.value = 'production'
      resourcePaneKey.value = ['castList', 'scenes'].includes(resourcePaneKey.value) ? resourcePaneKey.value : 'castList'
      return
    }
    workbenchStageKey.value = 'script'
    screenplayStepIdx.value = castList.value.length ? 3 : 2
    return
  }
  if (stageId === 'storyboard') {
    if (workbenchStageKey.value === 'production') {
      const keys = isAiPipeline.value
        ? ['dubbing', 'shots', 'videos', 'compose']
        : ['dubbing', 'keyframes', 'slideshow', 'compose']
      resourcePaneKey.value = keys.includes(resourcePaneKey.value) ? resourcePaneKey.value : 'dubbing'
      return
    }
    workbenchStageKey.value = 'script'
    screenplayStepIdx.value = 4
    return
  }
  workbenchStageKey.value = 'export'
}

const sidebarNavSubsteps = computed(() => {
  if (activeProductionStage.value === 'script') {
    return [
      { key: 'script:raw', label: '原始内容', done: !!persistedSourceBody.value },
      { key: 'script:rewrite', label: 'AI 改写', done: !!persistedScreenplayBody.value },
    ]
  }
  if (activeProductionStage.value === 'assets') {
    return [
      { key: 'script:extract', label: '提取角色场景', done: !!castList.value.length },
      { key: 'script:voice', label: '分配音色', done: !!castList.value.length && assignedVoiceCastCount.value === castList.value.length },
      { key: 'prod:castList', label: '角色形象', done: !portraitRenderTargetCount.value || readyPortraitCount.value === portraitRenderTargetCount.value },
      { key: 'prod:scenes', label: '场景图片', done: !locationRowsForEpisode.value.length || readyBackdropCount.value === locationRowsForEpisode.value.length },
    ]
  }
  if (activeProductionStage.value === 'storyboard') {
    if (isAiPipeline.value) {
      return [
        { key: 'script:storyboard', label: '分镜拆解', done: !!shotRowsForEpisode.value.length },
        { key: 'prod:dubbing', label: '配音生成', done: !ttsEligibleShotCount.value || ttsCompletedShotCount.value === ttsEligibleShotCount.value },
        { key: 'prod:shots', label: '镜头图片', done: !!shotRowsForEpisode.value.length && shotsHavingFrameUrls.value === shotRowsForEpisode.value.length },
        { key: 'prod:videos', label: 'AI视频生成', done: !!shotRowsForEpisode.value.length && shotsHavingRawVideos.value === shotRowsForEpisode.value.length },
        { key: 'prod:compose', label: '视频合成', done: !!shotRowsForEpisode.value.length && mergedClipShotCount.value === shotRowsForEpisode.value.length },
      ]
    }
    return [
      { key: 'script:storyboard', label: '分镜拆解', done: !!shotRowsForEpisode.value.length },
      { key: 'prod:dubbing', label: '配音生成', done: !ttsEligibleShotCount.value || ttsCompletedShotCount.value === ttsEligibleShotCount.value },
      { key: 'prod:keyframes', label: '关键帧序列', done: !!shotRowsForEpisode.value.length && shotsHavingFrameUrls.value === shotRowsForEpisode.value.length },
      { key: 'prod:slideshow', label: '静帧动画', done: !!shotRowsForEpisode.value.length && shotsHavingSlideshowClips.value === shotRowsForEpisode.value.length },
      { key: 'prod:compose', label: '视频合成', done: !!shotRowsForEpisode.value.length && mergedClipShotCount.value === shotRowsForEpisode.value.length },
    ]
  }
  return [
    { key: 'export:merge', label: '拼接导出', done: !!episodeMergedVideoUrl.value },
  ]
})

const sidebarNavSubstepKey = computed(() => {
  if (workbenchStageKey.value === 'script') {
    if (screenplayStepIdx.value === 0) return 'script:raw'
    if (screenplayStepIdx.value === 1) return 'script:rewrite'
    if (screenplayStepIdx.value === 2) return 'script:extract'
    if (screenplayStepIdx.value === 3) return 'script:voice'
    return 'script:storyboard'
  }
  if (workbenchStageKey.value === 'production') return `prod:${resourcePaneKey.value}`
  return 'export:merge'
})

const sidebarQuickJumpItems = computed(() => {
  const section = workbenchSidebarNav.value.find((item) => item.items.some(step => step.key === sidebarNavSubstepKey.value))
  return section?.items || []
})

const footerNavItems = computed(() => {
  if (workbenchStageKey.value === 'script') {
    return [
      { key: 'script:raw', label: '原始内容', done: !!persistedSourceBody.value },
      { key: 'script:rewrite', label: 'AI 改写', done: !!persistedScreenplayBody.value },
      { key: 'script:extract', label: '提取', done: !!castList.value.length },
      { key: 'script:voice', label: '音色', done: !!castList.value.length && assignedVoiceCastCount.value === castList.value.length },
      { key: 'script:storyboard', label: '分镜', done: !!shotRowsForEpisode.value.length },
    ]
  }
  if (workbenchStageKey.value === 'production') {
    return assetPaneTabDefs.value.map(step => ({
      key: `prod:${step.id}`,
      label: step.label,
      done: assetPaneStepComplete(step.id),
    }))
  }
  return []
})

const footerNavActiveKey = computed(() => {
  if (workbenchStageKey.value === 'script') return sidebarNavSubstepKey.value
  if (workbenchStageKey.value === 'production') return `prod:${resourcePaneKey.value}`
  return ''
})

const showProductionFooterNav = computed(() => workbenchStageKey.value === 'script' || workbenchStageKey.value === 'production')

function activateWorkbenchSubstep(key) {
  if (key.startsWith('script:')) {
    workbenchStageKey.value = 'script'
    const stepMap = {
      'script:raw': 0,
      'script:rewrite': 1,
      'script:extract': 2,
      'script:voice': 3,
      'script:storyboard': 4,
    }
    screenplayStepIdx.value = stepMap[key] ?? 0
    return
  }
  if (key.startsWith('prod:')) {
    workbenchStageKey.value = 'production'
    resourcePaneKey.value = key.replace('prod:', '')
    return
  }
  workbenchStageKey.value = 'export'
}

const workbenchCompletionTotal = computed(() =>
  workbenchSidebarNav.value.reduce((sum, section) => sum + section.items.length, 0),
)

const workbenchCompletionScore = computed(() =>
  workbenchSidebarNav.value.reduce(
    (sum, section) => sum + section.items.filter(item => item.done).length,
    0,
  ),
)

const workbenchStageTitle = computed(() => {
  if (workbenchStageKey.value === 'script') return `剧本阶段 · ${scriptWizardPhaseLabels[screenplayStepIdx.value]}`
  if (workbenchStageKey.value === 'production') return `制作阶段 · ${assetPaneTabDefs.value[assetPaneTabIndex.value]?.label || '制作'}`
  return episodeMergedVideoUrl.value ? '导出阶段 · 成片已生成' : '导出阶段 · 等待拼接'
})

const workbenchPrimaryLabel = computed(() => {
  const current = productionStageOptions.find(stage => stage.id === activeProductionStage.value)
  return current?.label || '工作台'
})

const workbenchNestedLabel = computed(() => {
  const current = sidebarNavSubsteps.value.find(step => step.key === sidebarNavSubstepKey.value)
  return current?.label || workbenchStageTitle.value
})

function mapCastVoiceSelection(charId, voiceId) {
  characterAPI.update(charId, { voice_id: voiceId, voice_provider: boundAudioProviderKey.value || undefined })
  const c = castList.value.find(ch => ch.id === charId)
  if (c) {
    c.voice_id = voiceId
    c.voiceId = voiceId
    c.voice_provider = boundAudioProviderKey.value || ''
    c.voiceProvider = boundAudioProviderKey.value || ''
    c.voice_preview_url = ''
    c.voicePreviewUrl = ''
  }
}
function lookupVoiceCatalogRow(voiceId) {
  return voiceCatalogEntries.value.find(v => v.id === voiceId) || null
}
const summedShotDurationSec = computed(() => shotRowsForEpisode.value.reduce((s, sb) => s + (sb.duration || 10), 0))

const focusedShotRow = ref(null)
const shotTypeOptions = [
  '大远景', '远景', '全景', '中景', '中近景', '近景', '特写', '大特写',
  '双人镜头', '三人镜头', '群像', '背影', '侧面', '正面', '俯视', '仰视',
  '过肩', '主观视角', '航拍', '运动镜头',
]
const shotAngleOptions = ['平视', '仰视', '俯视', '侧拍', '背拍', '斜侧', '主观视角', '过肩']
const shotMovementOptions = ['固定', '推镜', '拉镜', '摇镜', '移镜', '跟拍', '升降', '手持', '环绕']

function patchShotFieldValue(sb, field, value) {
  const current = sb[field] ?? sb[toCamelCaseField(field)]
  if (current === value) return
  sb[field] = value
  const camelField = toCamelCaseField(field)
  if (camelField !== field) sb[camelField] = value
  storyboardAPI.update(sb.id, { [field]: value })
}

function toCamelCaseField(field) {
  return field.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function readShotLinkedCastIds(sb) {
  return sb?.character_ids || sb?.characterIds || []
}

function readShotLinkedCastNames(sb) {
  const ids = readShotLinkedCastIds(sb)
  return castList.value.filter(char => ids.includes(char.id)).map(char => char.name)
}

function shotHasCastLink(sb, charId) {
  return readShotLinkedCastIds(sb).includes(charId)
}

function toggleShotCastLink(sb, charId) {
  const currentIds = readShotLinkedCastIds(sb)
  const nextIds = currentIds.includes(charId)
    ? currentIds.filter(id => id !== charId)
    : [...currentIds, charId]
  patchShotFieldValue(sb, 'character_ids', nextIds)
}

function renderShotLocationCaption(sb) {
  const sceneId = sb?.scene_id || sb?.sceneId
  if (!sceneId) return '未绑定场景'
  const scene = locationRowsForEpisode.value.find(s => s.id === sceneId)
  return scene ? `${scene.location} · ${scene.time || '未设时间'}` : `场景 #${sceneId}`
}

async function removeShotFromWorkbench(sb) {
  if (!confirm('确定删除此镜头？')) return
  const idx = shotRowsForEpisode.value.indexOf(sb)
  await storyboardAPI.del(sb.id)
  await syncWorkbenchFromApi()
  if (shotRowsForEpisode.value.length) focusedShotRow.value = shotRowsForEpisode.value[Math.min(idx, shotRowsForEpisode.value.length - 1)]
  else focusedShotRow.value = null
}

const scriptWizardStepRows = computed(() => {
  const hasScript = !!persistedScreenplayBody.value
  const hasChars = castList.value.length > 0 && hasScript
  const hasVoice = assignedVoiceCastCount.value > 0 && hasChars
  const hasSbs = shotRowsForEpisode.value.length > 0
  return [
    { label: '原始内容', state: persistedSourceBody.value ? 'done' : 'active', spinning: false },
    { label: 'AI 改写', state: hasScript ? 'done' : (persistedSourceBody.value ? 'active' : ''), spinning: agentBusyType.value === 'drama_script_formatter' },
    { label: '提取', state: hasChars ? 'done' : (hasScript ? 'active' : ''), spinning: agentBusyType.value === 'drama_cast_scene_extract' },
    { label: '音色', state: hasVoice ? 'done' : (hasChars ? 'active' : ''), spinning: agentBusyType.value === 'drama_voice_assign' },
    { label: '分镜', state: hasSbs ? 'done' : (hasVoice ? 'active' : ''), spinning: agentBusyType.value === 'drama_storyboard_breakdown' },
  ]
})

watch(persistedSourceBody, v => { rawDraftBuffer.value = v }, { immediate: true })
watch(persistedScreenplayBody, v => { formattedScriptBuffer.value = v }, { immediate: true })

// ── 数据加载与剧本阶段 Agent ─────────────────────────────────
async function syncWorkbenchFromApi() {
  try {
    const [project, ep] = await Promise.all([
      dramaAPI.get(dramaId, { include_episodes: false, include_assets: false }),
      episodeAPI.getByNumber(dramaId, epIndex),
    ])
    projectBriefSnapshot.value = project
    if (ep) {
      episodeWorkbenchRow.value = ep
      episodeImageSizes.value = readEpisodeImageSizes(ep.metadata)
      episodeVideoGenOptions.value = readEpisodeVideoGenOptions(ep.metadata)
      try { castList.value = await episodeAPI.characters(ep.id) } catch { castList.value = [] }
      try { locationRowsForEpisode.value = await episodeAPI.scenes(ep.id) } catch { locationRowsForEpisode.value = [] }
      shotRowsForEpisode.value = await episodeAPI.storyboards(ep.id)
      if (shotRowsForEpisode.value.length && !focusedShotRow.value) focusedShotRow.value = shotRowsForEpisode.value[0]

      const epHasContent = !!(episodeWorkbenchRow.value?.content)
      const epHasScript = !!(episodeWorkbenchRow.value?.formatted_script || episodeWorkbenchRow.value?.formattedScript)
      const epHasSbs = shotRowsForEpisode.value.length > 0

      if (epHasSbs) screenplayStepIdx.value = 4
      else if (epHasScript && castList.value.some(c => c.voice_id || c.voiceId)) screenplayStepIdx.value = 3
      else if (epHasScript && castList.value.length) screenplayStepIdx.value = 2
      else if (epHasScript || epHasContent) screenplayStepIdx.value = 1
      else screenplayStepIdx.value = 0
      await fetchLatestGridComposite()
    }
  } catch (e) {
    toast.error(e.message)
  }
  try { await resumeEpisodeMergePollFromStatus() } catch {}
}

function readMergeJobId(state) {
  return state?.id ?? state?.merge_id ?? state?.mergeId ?? null
}

function stopEpisodeMergePoll() {
  if (episodeMergePollTimer.value) {
    clearInterval(episodeMergePollTimer.value)
    episodeMergePollTimer.value = null
  }
}

async function pollEpisodeMergeJobOnce(mergeId) {
  const res = await mergeAPI.status(activeEpisodeId.value, productionPipeline.value, mergeId || undefined)
  episodeMergeJobState.value = res
  return res
}

async function resumeEpisodeMergePollFromStatus() {
  if (episodeMergePollTimer.value) return
  const res = await mergeAPI.status(activeEpisodeId.value, productionPipeline.value)
  episodeMergeJobState.value = res
  if (res?.status === 'processing') {
    pollEpisodeMergeJobUntilDone(readMergeJobId(res))
  }
}

function pollEpisodeMergeJobUntilDone(mergeId) {
  stopEpisodeMergePoll()

  const tick = async () => {
    try {
      const res = await pollEpisodeMergeJobOnce(mergeId)
      if (res?.status === 'completed') {
        stopEpisodeMergePoll()
        await syncWorkbenchFromApi()
        toast.success('拼接完成')
      } else if (res?.status === 'failed') {
        stopEpisodeMergePoll()
        toast.error(res.error_msg || res.errorMsg || '拼接失败')
      }
    } catch {}
  }

  tick()
  episodeMergePollTimer.value = setInterval(tick, 3000)
}

function persistRawEpisodeDraft() { episodeAPI.update(activeEpisodeId.value, { content: rawDraftBuffer.value }); episodeWorkbenchRow.value.content = rawDraftBuffer.value }

async function importRawFromUrl() {
  const url = rawUrlInput.value.trim()
  if (!url) {
    toast.warning('请输入链接地址')
    return
  }
  if (rawDraftBuffer.value.trim() && !confirm('将替换当前编辑区中的原始内容，是否继续？')) return
  rawUrlFetching.value = true
  try {
    const res = await templatesAPI.fetchUrl(url)
    rawDraftBuffer.value = res.text || ''
    rawUrlInput.value = ''
    toast.success(res.title ? `已提取：${res.title}` : '已从链接提取正文')
  } catch (e) {
    toast.error(e?.message || '提取失败')
  } finally {
    rawUrlFetching.value = false
  }
}

function persistScreenplayDraft() { episodeAPI.update(activeEpisodeId.value, { formatted_script: formattedScriptBuffer.value }); episodeWorkbenchRow.value.formatted_script = formattedScriptBuffer.value }
function invokeDramaScriptFormatterAgent() { persistRawEpisodeDraft(); invokeWorkbenchAgent('drama_script_formatter', '请读取剧本并改写为格式化剧本，然后保存', dramaId, activeEpisodeId.value, syncWorkbenchFromApi) }
function advanceRewriteWizardSkip() {
  const raw = (rawDraftBuffer.value || persistedSourceBody.value || '').trim()
  if (!raw) {
    toast.warning('请先填写原始内容')
    return
  }
  formattedScriptBuffer.value = raw
  persistScreenplayDraft()
  toast.success('已跳过 AI 改写，当前将直接使用原始内容')
  screenplayStepIdx.value = 2
}
function invokeDramaCastSceneExtractAgent() { persistScreenplayDraft(); invokeWorkbenchAgent('drama_cast_scene_extract', '请从剧本中提取所有角色和场景信息，提取时自动与项目已有数据进行去重合并', dramaId, activeEpisodeId.value, syncWorkbenchFromApi) }
function invokeDramaVoiceAssignAgent() { invokeWorkbenchAgent('drama_voice_assign', '请为所有角色分配合适的音色', dramaId, activeEpisodeId.value, syncWorkbenchFromApi) }
async function batchGenerateCastPreviews() {
  const pending = castList.value.filter(c => (c.voice_id || c.voiceId) && !(c.voice_preview_url || c.voicePreviewUrl))
  if (!pending.length) {
    toast.info(assignedVoiceCastCount.value ? '所有角色的试听文件已生成' : '请先分配音色')
    return
  }
  const results = await Promise.allSettled(pending.map(c => characterAPI.voiceSample(c.id, activeEpisodeId.value)))
  const okCount = results.filter(r => r.status === 'fulfilled').length
  const failCount = results.length - okCount
  if (okCount) toast.success(`已生成 ${okCount} 份试听文件`)
  if (failCount) toast.error(`${failCount} 份试听文件生成失败`)
  await syncWorkbenchFromApi()
}
function invokeDramaStoryboardBreakdownAgent() {
  const cfg = videoProviderRows.value.find(c => c.id === boundVideoConfigId.value)
  const label = cfg ? `${cfg.name} (${cfg.provider})` : '默认'
  invokeWorkbenchAgent('drama_storyboard_breakdown', `请拆解分镜并生成视频提示词。视频模型：${label}，请根据该模型的特性和时长限制生成合适的视频提示词。`, dramaId, activeEpisodeId.value, syncWorkbenchFromApi)
}
async function generateOneCastPreview(id) { try { await characterAPI.voiceSample(id, activeEpisodeId.value); toast.success('试听已生成'); syncWorkbenchFromApi() } catch (e) { toast.error(e.message) } }
async function insertBlankShotRow() { await storyboardAPI.create({ episode_id: activeEpisodeId.value, storyboard_number: shotRowsForEpisode.value.length + 1, title: `镜头${shotRowsForEpisode.value.length + 1}`, duration: 10 }); syncWorkbenchFromApi() }

// ── 异步轮询与素材生成 ───────────────────────────────────────
function pauseMillis(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function pollUntilWorkbenchReady(check, attempts = 24, delay = 2500) {
  void (async () => {
    for (let i = 0; i < attempts; i++) {
      await pauseMillis(delay)
      await syncWorkbenchFromApi()
      if (check()) return
    }
  })()
}

async function requestCastPortraitRender(id) {
  try {
    if (!castPortraitBusy(id)) portraitRenderPendingIds.value.push(id)
    await characterAPI.generateImage(id, activeEpisodeId.value, { aspect_ratio: readImageAspectForScope('character') })
    toast.success('角色图片生成中')
    await syncWorkbenchFromApi()
    pollUntilWorkbenchReady(() => {
      const char = castList.value.find(c => c.id === id)
      const done = !!(char?.image_url || char?.imageUrl)
      if (done) portraitRenderPendingIds.value = portraitRenderPendingIds.value.filter(item => item !== id)
      return done
    })
  } catch (e) {
    portraitRenderPendingIds.value = portraitRenderPendingIds.value.filter(item => item !== id)
    toast.error(e.message)
  }
}
function batchRequestCastPortraits() {
  const ids = visiblePortraitCastRows.value.filter(c => !(c.image_url || c.imageUrl)).map(c => c.id)
  if (!ids.length) { toast.info('所有角色图片已生成'); return }
  portraitRenderPendingIds.value = [...new Set([...portraitRenderPendingIds.value, ...ids])]
  characterAPI.batchImages(ids, activeEpisodeId.value, { aspect_ratio: readImageAspectForScope('character') }).then(async () => {
    toast.success('角色图片批量生成中')
    await syncWorkbenchFromApi()
    pollUntilWorkbenchReady(() => ids.every(id => {
      const char = castList.value.find(c => c.id === id)
      const done = !!(char?.image_url || char?.imageUrl)
      if (done) portraitRenderPendingIds.value = portraitRenderPendingIds.value.filter(item => item !== id)
      return done
    }), 36)
  }).catch(e => {
    portraitRenderPendingIds.value = portraitRenderPendingIds.value.filter(item => !ids.includes(item))
    toast.error(e.message)
  })
}
async function requestLocationBackdropRender(id) {
  try {
    if (!locationBackdropBusy(id)) backdropRenderPendingIds.value.push(id)
    await sceneAPI.generateImage(id, activeEpisodeId.value, { aspect_ratio: readImageAspectForScope('scene') })
    toast.success('场景图片生成中')
    await syncWorkbenchFromApi()
    pollUntilWorkbenchReady(() => {
      const scene = locationRowsForEpisode.value.find(s => s.id === id)
      const done = !!(scene?.image_url || scene?.imageUrl)
      if (done) backdropRenderPendingIds.value = backdropRenderPendingIds.value.filter(item => item !== id)
      return done
    })
  } catch (e) {
    backdropRenderPendingIds.value = backdropRenderPendingIds.value.filter(item => item !== id)
    toast.error(e.message)
  }
}
function batchRequestLocationBackdrops() {
  const ids = locationRowsForEpisode.value.filter(s => !(s.image_url || s.imageUrl)).map(s => s.id)
  if (!ids.length) { toast.info('所有场景图片已生成'); return }
  backdropRenderPendingIds.value = [...new Set([...backdropRenderPendingIds.value, ...ids])]
  ids.forEach(id => { sceneAPI.generateImage(id, activeEpisodeId.value, { aspect_ratio: readImageAspectForScope('scene') }).then(() => syncWorkbenchFromApi()).catch(e => toast.error(e.message)) })
  toast.success('场景图片批量生成中')
  pollUntilWorkbenchReady(() => ids.every(id => {
    const scene = locationRowsForEpisode.value.find(s => s.id === id)
    const done = !!(scene?.image_url || scene?.imageUrl)
    if (done) backdropRenderPendingIds.value = backdropRenderPendingIds.value.filter(item => item !== id)
    return done
  }), 36)
}

const IGNORE_TTS_SPEAKERS = /^(环境音|环境声|音效|效果音|sfx|sound ?effect|bgm|背景音|背景音乐|ambient)$/i
const IGNORE_TTS_TEXT = /^(无|无对白|无台词|无旁白|无需配音|无需对白|none|null|n\/a|na|环境音|环境声|音效|效果音|纯音效|纯环境音|只有环境音|仅环境音|背景音|背景音乐|bgm|sfx|ambient)$/i

function readDialogueSpeakerToken(sb) {
  const dialogue = sb?.dialogue?.trim() || ''
  const match = dialogue.match(/^(.+?)[:：]/)
  return match ? match[1].replace(/[（(].+?[)）]/g, '').trim() : ''
}

function readDialogueUtteranceText(sb) {
  const dialogue = sb?.dialogue?.trim() || ''
  return dialogue ? dialogue.replace(/^.+?[:：]\s*/, '').trim() : ''
}

function shouldSkipShotTts(sb) {
  const speaker = readDialogueSpeakerToken(sb)
  const text = readDialogueUtteranceText(sb)
  if (!sb?.dialogue?.trim()) return true
  if (speaker && IGNORE_TTS_SPEAKERS.test(speaker)) return true
  if (!text) return true
  if (IGNORE_TTS_TEXT.test(text)) return true
  return false
}

function shotContainsSpeakableLine(sb) { return !shouldSkipShotTts(sb) }
function shotHasRenderedTts(sb) { return !!(sb?.tts_audio_url || sb?.ttsAudioUrl) }
function readShotTtsAssetUrl(sb) { return sb?.tts_audio_url || sb?.ttsAudioUrl || '' }
function renderDialogueSpeakerLabel(sb) {
  const speaker = readDialogueSpeakerToken(sb)
  if (!speaker) return '旁白'
  return speaker
}
async function requestShotDialogueTts(sb) {
  try {
    await storyboardAPI.generateTTS(sb.id)
    toast.success(`镜头 #${sb.storyboard_number || sb.storyboardNumber || sb.id} 配音已生成`)
    await syncWorkbenchFromApi()
  } catch (e) { toast.error(e.message) }
}
async function batchRequestShotDialogueTts() {
  const pending = shotRowsForEpisode.value.filter(sb => shotContainsSpeakableLine(sb) && !shotHasRenderedTts(sb))
  if (!pending.length) {
    toast.info(ttsEligibleShotCount.value ? '所有镜头配音已生成' : '当前没有可生成的对白或旁白')
    return
  }
  const results = await Promise.allSettled(pending.map(sb => storyboardAPI.generateTTS(sb.id)))
  const okCount = results.filter(r => r.status === 'fulfilled').length
  const failCount = results.length - okCount
  if (okCount) toast.success(`已生成 ${okCount} 条镜头配音`)
  if (failCount) toast.error(`${failCount} 条镜头配音生成失败`)
  await syncWorkbenchFromApi()
}

function readShotLeadFrameUrl(s) { return s?.first_frame_image || s?.firstFrameImage || null }
function readShotTrailFrameUrl(s) { return s?.last_frame_image || s?.lastFrameImage || null }
function readShotPreviewImageUrl(s) { return s?.composed_image || s?.composedImage || readShotLeadFrameUrl(s) || readShotTrailFrameUrl(s) || null }
function readShotClipUrl(s) { return s?.video_url || s?.videoUrl || null }
function readShotSlideshowUrl(s) {
  return readShotSlideshowUrlFromMeta(s?.reference_images || s?.referenceImages)
}
function readShotSlideshowSequencePaths(s) {
  return collectSlideshowKeyframePaths(s)
}
function readShotSlideshowTargetCount(s) {
  return resolveSlideshowFrameTargetCount(s?.duration || 10)
}
function readShotKeyframePaths(s) {
  return isFramePipeline.value ? readShotSlideshowSequencePaths(s) : collectStoryboardKeyframePaths(s)
}
function readShotMergedClipUrl(s) {
  if (isFramePipeline.value) {
    return readShotFrameComposedUrlFromMeta(s?.reference_images || s?.referenceImages)
  }
  return s?.composed_video_url || s?.composedVideoUrl || null
}
function readShotMotionClipUrl(s) {
  return isAiPipeline.value ? readShotClipUrl(s) : readShotSlideshowUrl(s)
}
function shotOwnsFrameAsset(s) {
  if (isFramePipeline.value) return readShotKeyframePaths(s).length > 0
  return !!readShotPreviewImageUrl(s)
}
function shotOwnsRawClip(s) { return !!readShotClipUrl(s) }
function shotOwnsSlideshowClip(s) { return !!readShotSlideshowUrl(s) }
function shotOwnsMotionClip(s) { return !!readShotMotionClipUrl(s) }
function slideshowClipBusy(id) { return slideshowRenderPendingIds.value.includes(id) }
function shotOwnsMergedClip(s) { return !!readShotMergedClipUrl(s) }

function collectShotReferenceAssets(sb) {
  const refs = []
  const pushRef = (value) => {
    if (!value || refs.includes(value) || refs.length >= 6) return
    refs.push(value)
  }
  const sceneId = sb?.scene_id || sb?.sceneId
  const scene = locationRowsForEpisode.value.find(item => item.id === sceneId)
  pushRef(scene?.image_url || scene?.imageUrl)
  for (const charId of readShotLinkedCastIds(sb)) {
    const char = castList.value.find(item => item.id === charId)
    pushRef(char?.image_url || char?.imageUrl)
  }
  for (const ref of tokenizeShotReferenceList(sb)) {
    pushRef(ref)
  }
  const first = readShotLeadFrameUrl(sb)
  const last = readShotTrailFrameUrl(sb)
  pushRef(first)
  pushRef(last)
  return refs.filter(Boolean).slice(0, 6)
}

function composeShotFramePrompt(sb, frameType) {
  const title = sb.title || ''
  const description = sb.image_prompt || sb.imagePrompt || sb.description || ''
  const shotType = sb.shot_type || sb.shotType || ''
  const angle = sb.angle || ''
  const movement = sb.movement || ''
  const location = sb.location || renderShotLocationCaption(sb)
  const time = sb.time || ''
  const charactersText = readShotLinkedCastNames(sb).join('、')
  const action = sb.action || ''
  const atmosphere = sb.atmosphere || ''
  const frameHint = frameType === 'first_frame'
    ? '生成这个镜头的起始关键帧，突出建立关系和动作开始瞬间'
    : '生成这个镜头的结束关键帧，突出动作结束、情绪落点或结果状态'

  return [
    title ? `镜头标题：${title}` : '',
    description ? `画面描述：${description}` : '',
    shotType ? `景别：${shotType}` : '',
    angle ? `机位：${angle}` : '',
    movement ? `运镜：${movement}` : '',
    charactersText ? `角色：${charactersText}` : '',
    location ? `地点：${location}` : '',
    time ? `时间：${time}` : '',
    action ? `动作：${action}` : '',
    atmosphere ? `氛围：${atmosphere}` : '',
    frameHint,
  ].filter(Boolean).join('；')
}

const SEQUENCE_CAMERA_BEATS = [
  '远景建立镜头，交代环境与人物起始位置',
  '中景，人物动作明显进行中，姿态与上一帧不同',
  '近景或细节镜头，突出手部、面部表情或关键物体',
  '中远景，呈现动作收尾或结果状态',
  '微仰视人物，强调风雨/氛围',
  '低角度地面视角，积水与霓虹反射',
  '侧向构图，人物轮廓与背景分离',
  '过肩或斜侧构图，增加空间纵深',
]

function buildSequenceActionBeat(sb, frameIndex, totalFrames) {
  const action = sb.action || sb.description || sb.title || '场景动作'
  const result = sb.result || ''
  if (totalFrames <= 1) return `定格画面：${action}`
  if (frameIndex === 0) return `动作开端（0%）：${action}`
  if (frameIndex >= totalFrames - 1) {
    return `动作落幅（100%）：${result || action}，与首帧构图和人物姿态明显不同`
  }
  const progress = Math.round((frameIndex / Math.max(1, totalFrames - 1)) * 100)
  return `动作进行中（约 ${progress}%）：${action}，人物肢体与道具位置相对上一帧必须有变化`
}

function collectShotSequenceReferenceAssets(sb) {
  const refs = []
  const pushRef = (value) => {
    if (!value || refs.includes(value) || refs.length >= 4) return
    refs.push(value)
  }
  const sceneId = sb?.scene_id || sb?.sceneId
  const scene = locationRowsForEpisode.value.find(item => item.id === sceneId)
  pushRef(scene?.image_url || scene?.imageUrl)
  for (const charId of readShotLinkedCastIds(sb)) {
    const char = castList.value.find(item => item.id === charId)
    pushRef(char?.image_url || char?.imageUrl)
  }
  // 不传已有序列帧/首尾帧作参考，避免模型逐帧复制同一张图
  return refs.filter(Boolean)
}

function composeShotSequenceFramePrompt(sb, frameIndex, totalFrames) {
  const title = sb.title || ''
  const description = sb.image_prompt || sb.imagePrompt || sb.description || ''
  const shotType = sb.shot_type || sb.shotType || ''
  const angle = sb.angle || ''
  const movement = sb.movement || ''
  const location = sb.location || renderShotLocationCaption(sb)
  const time = sb.time || ''
  const charactersText = readShotLinkedCastNames(sb).join('、')
  const action = sb.action || ''
  const atmosphere = sb.atmosphere || ''
  const cameraBeat = SEQUENCE_CAMERA_BEATS[frameIndex % SEQUENCE_CAMERA_BEATS.length]
  const actionBeat = buildSequenceActionBeat(sb, frameIndex, totalFrames)

  return [
    title ? `镜头标题：${title}` : '',
    description ? `画面描述：${description}` : '',
    shotType ? `景别：${shotType}` : '',
    angle ? `机位：${angle}` : '',
    movement ? `运镜：${movement}` : '',
    charactersText ? `角色：${charactersText}` : '',
    location ? `地点：${location}` : '',
    time ? `时间：${time}` : '',
    action ? `动作：${action}` : '',
    atmosphere ? `氛围：${atmosphere}` : '',
    `序列帧 ${frameIndex + 1}/${totalFrames}：${cameraBeat}；${actionBeat}`,
    '同一镜头保持角色容貌、服装、场景与光影风格一致，但每帧机位、景别、人物姿态必须清晰可见地不同，禁止复制其他序列帧构图',
  ].filter(Boolean).join('；')
}

async function ensureShotSequenceRefsMigrated(sb) {
  const seeded = buildSeededReferenceImagesJson(sb)
  if (!seeded) return sb
  await storyboardAPI.update(sb.id, { reference_images: seeded })
  await syncWorkbenchFromApi()
  return shotRowsForEpisode.value.find(s => s.id === sb.id) || sb
}

async function waitForShotSequenceFrameGrowth(sb, beforeCount) {
  for (let i = 0; i < 24; i++) {
    await pauseMillis(2500)
    await syncWorkbenchFromApi()
    const refreshed = shotRowsForEpisode.value.find(s => s.id === sb.id)
    if (readShotSlideshowSequencePaths(refreshed).length > beforeCount) return true
  }
  return false
}

async function trimShotSequenceRefsToTarget(sb) {
  const target = readShotSlideshowTargetCount(sb)
  const refs = readStoryboardSequenceRefs(sb)
  if (refs.length <= target) return sb
  await storyboardAPI.update(sb.id, { reference_images: buildReferenceImagesJson(sb, refs.slice(0, target)) })
  await syncWorkbenchFromApi()
  return shotRowsForEpisode.value.find(s => s.id === sb.id) || sb
}

async function applyShotSequenceFrameReplace(sb, frameIndex, newPath, refsBefore) {
  const base = refsBefore || readStoryboardSequenceRefs(sb)
  if (frameIndex < 0 || frameIndex >= base.length || !newPath) return
  const next = [...base]
  next[frameIndex] = newPath
  await storyboardAPI.update(sb.id, { reference_images: buildReferenceImagesJson(sb, next) })
  await syncWorkbenchFromApi()
}

async function requestShotReferenceFrameRender(sb, frameIndex) {
  sb = await ensureShotSequenceRefsMigrated(sb)
  if (readStoryboardSequenceRefs(sb).length > readShotSlideshowTargetCount(sb)) {
    sb = await trimShotSequenceRefsToTarget(sb)
  }
  const totalFrames = readShotSlideshowTargetCount(sb)
  const refsBefore = readStoryboardSequenceRefs(sb)
  const replaceMode = frameIndex >= 0 && frameIndex < refsBefore.length
  const prompt = composeShotSequenceFramePrompt(sb, frameIndex, totalFrames)
  const referenceImages = collectShotSequenceReferenceAssets(sb)
  const key = shotFrameTaskKey(sb.id, `reference:${frameIndex}`)
  const beforeCount = refsBefore.length
  try {
    if (!frameRenderPendingKeys.value.includes(key)) frameRenderPendingKeys.value.push(key)
    await imageAPI.generate({
      storyboard_id: sb.id,
      drama_id: dramaId,
      prompt,
      frame_type: 'reference',
      reference_images: referenceImages.length ? referenceImages : undefined,
      aspect_ratio: readImageAspectForScope('shot'),
    })
    toast.success(replaceMode ? `序列帧 ${frameIndex + 1} 重新生成中` : `序列帧 ${frameIndex + 1} 生成中`)
    const done = await waitForShotSequenceFrameGrowth(sb, beforeCount)
    if (!done) {
      toast.warning(`序列帧 ${frameIndex + 1} 生成超时，请稍后刷新或重试`)
      return false
    }
    if (replaceMode) {
      const refreshed = shotRowsForEpisode.value.find(s => s.id === sb.id) || sb
      const refsAfter = readStoryboardSequenceRefs(refreshed)
      const newPath = refsAfter[refsAfter.length - 1]
      await applyShotSequenceFrameReplace(refreshed, frameIndex, newPath, refsBefore)
      toast.success(`序列帧 ${frameIndex + 1} 已重新生成`)
    }
    return true
  } catch (e) {
    toast.error(e.message)
    return false
  } finally {
    frameRenderPendingKeys.value = frameRenderPendingKeys.value.filter(item => item !== key)
  }
}

async function requestShotSequenceRegenerateAll(sb) {
  sb = await ensureShotSequenceRefsMigrated(sb)
  sb = await trimShotSequenceRefsToTarget(sb)
  const target = readShotSlideshowTargetCount(sb)
  if (!readStoryboardSequenceRefs(sb).length) {
    await requestShotSequenceFrames(sb)
    return
  }
  const key = shotFrameTaskKey(sb.id, 'sequence')
  if (frameRenderPendingKeys.value.includes(key)) return
  frameRenderPendingKeys.value.push(key)
  const shotId = sb.id
  try {
    let done = 0
    for (let i = 0; i < target; i++) {
      const ok = await requestShotReferenceFrameRender(sb, i)
      if (!ok) break
      done++
      const refreshed = shotRowsForEpisode.value.find(s => s.id === shotId)
      if (refreshed) sb = refreshed
    }
    if (done >= target) toast.success('序列帧已全部重新生成')
    else if (done) toast.warning(`已完成 ${done}/${target} 张，请重试剩余帧`)
    else toast.warning('序列帧未能重新生成，请检查图片模型或积分')
  } catch (e) {
    toast.error(e.message)
  } finally {
    frameRenderPendingKeys.value = frameRenderPendingKeys.value.filter(item => item !== key)
  }
}

async function requestShotSequenceFrames(sb) {
  sb = await ensureShotSequenceRefsMigrated(sb)
  const target = readShotSlideshowTargetCount(sb)
  let current = readStoryboardSequenceRefs(sb).length
  if (current >= target) {
    openGridMosaicPanelForShotSequence(sb)
    toast.info('建议帧数已满足，可悬停单帧重新生成，或通过分镜拼图追加更多序列帧')
    return
  }
  const key = shotFrameTaskKey(sb.id, 'sequence')
  if (frameRenderPendingKeys.value.includes(key)) return
  frameRenderPendingKeys.value.push(key)
  try {
    let generated = 0
    while (current < target) {
      const ok = await requestShotReferenceFrameRender(sb, current)
      const refreshed = shotRowsForEpisode.value.find(s => s.id === sb.id) || sb
      sb = refreshed
      const after = readStoryboardSequenceRefs(refreshed).length
      if (!ok || after <= current) break
      generated++
      current = after
    }
    if (current >= target) toast.success('序列帧生成完成')
    else if (generated) toast.warning(`已生成 ${generated} 张，尚有 ${Math.max(0, target - current)} 张未完成`)
    else toast.warning('序列帧未能生成，请检查图片模型配置或积分后重试')
  } catch (e) {
    toast.error(e.message)
  } finally {
    frameRenderPendingKeys.value = frameRenderPendingKeys.value.filter(item => item !== key)
  }
}

async function batchRequestShotSequenceFrames() {
  const shots = shotRowsForEpisode.value
  if (!shots.length) {
    toast.warning('请先生成分镜')
    return
  }
  let queued = 0
  for (const sb of shots) {
    const migrated = await ensureShotSequenceRefsMigrated(sb)
    if (readShotSlideshowSequencePaths(migrated).length >= readShotSlideshowTargetCount(migrated)) continue
    queued++
    await requestShotSequenceFrames(migrated)
  }
  if (!queued) toast.info('所有镜头序列帧已就绪')
}

async function requestShotFrameRender(sb, frameType) {
  const prompt = composeShotFramePrompt(sb, frameType)
  const referenceImages = collectShotReferenceAssets(sb)
  const key = shotFrameTaskKey(sb.id, frameType)
  try {
    if (!frameRenderPendingKeys.value.includes(key)) frameRenderPendingKeys.value.push(key)
    const body = {
      storyboard_id: sb.id,
      drama_id: dramaId,
      prompt,
      frame_type: frameType,
      reference_images: referenceImages.length ? referenceImages : undefined,
      aspect_ratio: readImageAspectForScope('shot'),
    }
    await imageAPI.generate(body)
    toast.success(frameType === 'first_frame' ? '首帧生成中' : '尾帧生成中')
    await syncWorkbenchFromApi()
    pollUntilWorkbenchReady(() => {
      const target = shotRowsForEpisode.value.find(s => s.id === sb.id)
      const done = frameType === 'first_frame' ? !!readShotLeadFrameUrl(target) : !!readShotTrailFrameUrl(target)
      if (done) frameRenderPendingKeys.value = frameRenderPendingKeys.value.filter(item => item !== key)
      return done
    })
  } catch (e) {
    frameRenderPendingKeys.value = frameRenderPendingKeys.value.filter(item => item !== key)
    toast.error(e.message)
  }
}

async function requestShotClipRender(sb) {
  const params = {
    storyboard_id: sb.id,
    drama_id: dramaId,
    prompt: sb.video_prompt || sb.videoPrompt || '',
    duration: Number(sb.duration || 5),
    aspect_ratio: readImageAspectForScope('video'),
    generate_audio: episodeVideoGenOptions.value.generate_audio,
    generate_subtitles: episodeVideoGenOptions.value.generate_subtitles,
  }
  const first = readShotLeadFrameUrl(sb)
  const last = readShotTrailFrameUrl(sb)
  const refs = tokenizeShotReferenceList(sb)
  if (first && last) { Object.assign(params, { reference_mode: 'first_last', first_frame_url: first, last_frame_url: last }) }
  else if (refs.length) { Object.assign(params, { reference_mode: 'multiple', reference_image_urls: [first, ...refs].filter(Boolean) }) }
  else if (first) { Object.assign(params, { reference_mode: 'single', image_url: first }) }
  try {
    delete clipFailureMessages.value[sb.id]
    if (!shotClipBusy(sb.id)) clipRenderPendingIds.value.push(sb.id)
    const generation = await videoAPI.generate(params)
    toast.success('视频生成中')
    await syncWorkbenchFromApi()
    pollShotClipJob(generation?.id, sb.id)
  } catch (e) {
    clipRenderPendingIds.value = clipRenderPendingIds.value.filter(item => item !== sb.id)
    toast.error(e.message)
  }
}
async function pollShotClipJob(generationId, storyboardId) {
  if (!generationId) {
    pollUntilWorkbenchReady(() => {
      const target = shotRowsForEpisode.value.find(s => s.id === storyboardId)
      const done = !!(target?.video_url || target?.videoUrl)
      if (done) clipRenderPendingIds.value = clipRenderPendingIds.value.filter(item => item !== storyboardId)
      return done
    }, 60, 4000)
    return
  }
  for (let i = 0; i < 120; i++) {
    await pauseMillis(4000)
    try {
      const res = await videoAPI.get(generationId)
      await syncWorkbenchFromApi()
      if (res?.status === 'completed') {
        clipRenderPendingIds.value = clipRenderPendingIds.value.filter(item => item !== storyboardId)
        delete clipFailureMessages.value[storyboardId]
        toast.success('视频生成完成')
        return
      }
      if (res?.status === 'failed') {
        clipRenderPendingIds.value = clipRenderPendingIds.value.filter(item => item !== storyboardId)
        clipFailureMessages.value = {
          ...clipFailureMessages.value,
          [storyboardId]: res?.error_msg || res?.errorMsg || '视频生成失败',
        }
        toast.error(clipFailureMessages.value[storyboardId])
        return
      }
    } catch {}
  }
  clipRenderPendingIds.value = clipRenderPendingIds.value.filter(item => item !== storyboardId)
  clipFailureMessages.value = {
    ...clipFailureMessages.value,
    [storyboardId]: '视频生成超时',
  }
  toast.error('视频生成超时')
}
async function requestShotClipCompose(sb) {
  try {
    delete mergeFailureMessages.value[sb.id]
    if (!episodeMergeBusy(sb.id)) mergeRenderPendingIds.value.push(sb.id)
    await composeAPI.shot(sb.id, productionPipeline.value)
    toast.success('合成完成')
    mergeRenderPendingIds.value = mergeRenderPendingIds.value.filter(item => item !== sb.id)
    syncWorkbenchFromApi()
  } catch (e) {
    mergeRenderPendingIds.value = mergeRenderPendingIds.value.filter(item => item !== sb.id)
    mergeFailureMessages.value = {
      ...mergeFailureMessages.value,
      [sb.id]: e.message,
    }
    toast.error(e.message)
  }
}
function batchRequestShotClips() {
  const pendingIds = shotRowsForEpisode.value.filter(s => !shotOwnsRawClip(s)).map(s => s.id)
  pendingIds.forEach(id => {
    const sb = shotRowsForEpisode.value.find(item => item.id === id)
    if (sb) requestShotClipRender(sb)
  })
  if (pendingIds.length) {
    clipRenderPendingIds.value = [...new Set([...clipRenderPendingIds.value, ...pendingIds])]
    pollUntilWorkbenchReady(() => pendingIds.every(id => {
      const target = shotRowsForEpisode.value.find(s => s.id === id)
      const done = !!(target?.video_url || target?.videoUrl)
      if (done) clipRenderPendingIds.value = clipRenderPendingIds.value.filter(item => item !== id)
      return done
    }), 80, 4000)
  }
}
async function batchRequestShotComposes() {
  await composeAPI.all(activeEpisodeId.value, productionPipeline.value)
  mergeRenderPendingIds.value = [...new Set(shotRowsForEpisode.value.filter(sb => !!sb.video_url || !!sb.videoUrl).map(sb => sb.id))]
  toast.success('批量合成已开始')
  pollEpisodeMergeJob()
}
async function startEpisodeMergeJob() {
  stopEpisodeMergePoll()
  try {
    const res = await mergeAPI.merge(activeEpisodeId.value, productionPipeline.value)
    const mergeId = readMergeJobId(res)
    episodeMergeJobState.value = { ...(res || {}), id: mergeId, status: 'processing' }
    toast.success('拼接中...')
    pollEpisodeMergeJobUntilDone(mergeId)
  } catch (e) {
    toast.error(e?.message || '拼接启动失败')
  }
}

async function pollEpisodeMergeJob() {
  for (let i = 0; i < 120; i++) {
    await pauseMillis(3000)
    try {
      const res = await composeAPI.status(activeEpisodeId.value, productionPipeline.value)
      await syncWorkbenchFromApi()
      const items = Array.isArray(res?.items) ? res.items : []
      const processingIds = items.filter(item => item.status === 'compose_processing').map(item => item.id)
      mergeRenderPendingIds.value = processingIds

      const failedItems = items.filter(item => item.status === 'compose_failed')
      if (failedItems.length) {
        const next = { ...mergeFailureMessages.value }
        failedItems.forEach((item) => {
          next[item.id] = item.error_msg || item.errorMsg || '视频合成失败'
        })
        mergeFailureMessages.value = next
      }

      if (!processingIds.length) {
        if (failedItems.length) toast.error(`有 ${failedItems.length} 个镜头合成失败`)
        else toast.success('批量合成完成')
        return
      }
    } catch {}
  }
}
function tokenizeShotReferenceList(sb) {
  const raw = sb.reference_images || sb.referenceImages
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.refs)) return parsed.refs
    return []
  } catch { return [] }
}

async function requestShotSlideshowRender(sb) {
  if (!shotOwnsFrameAsset(sb)) {
    toast.warning('请先在关键帧序列中生成场景序列帧')
    return
  }
  try {
    if (!slideshowClipBusy(sb.id)) slideshowRenderPendingIds.value.push(sb.id)
    await slideshowAPI.shot(sb.id)
    toast.success('静帧视频已生成')
    await syncWorkbenchFromApi()
  } catch (e) {
    toast.error(e.message)
  } finally {
    slideshowRenderPendingIds.value = slideshowRenderPendingIds.value.filter(item => item !== sb.id)
  }
}

async function batchRequestShotSlideshows() {
  try {
    await slideshowAPI.all(activeEpisodeId.value)
    toast.success('批量静帧动画已开始')
    pollSlideshowJob()
  } catch (e) {
    toast.error(e.message)
  }
}

async function pollSlideshowJob() {
  for (let i = 0; i < 120; i++) {
    await pauseMillis(3000)
    try {
      await syncWorkbenchFromApi()
      const pending = shotRowsForEpisode.value.filter(s => shotOwnsFrameAsset(s) && !shotOwnsSlideshowClip(s))
      if (!pending.length) {
        toast.success('静帧动画完成')
        return
      }
    } catch {}
  }
  toast.warning('静帧动画仍在进行中，请稍后刷新')
}

async function refreshWorkbenchAiConfigs() {
  try {
    const [imgCfgs, vidCfgs, audCfgs] = await Promise.all([
      aiConfigAPI.list('image'),
      aiConfigAPI.list('video'),
      aiConfigAPI.list('audio'),
    ])
    imageProviderRows.value = imgCfgs || []
    videoProviderRows.value = vidCfgs || []
    audioProviderRows.value = audCfgs || []
  } catch (e) { console.error('Failed to load AI configs', e) }
}

function inferVoiceGenderLabel(name, desc = []) {
  const text = `${name} ${Array.isArray(desc) ? desc.join(' ') : ''}`
  if (/[男|青年|大爷|学长|boy|man|male]/i.test(text)) return '男声'
  if (/[女|少女|御姐|奶奶|girl|woman|female]/i.test(text)) return '女声'
  return '中性'
}

function mapVoiceCatalogToProfile(v) {
  const desc = Array.isArray(v.description) ? v.description : []
  return {
    id: v.voice_id,
    label: v.voice_name || v.voice_id,
    gender: inferVoiceGenderLabel(v.voice_name || v.voice_id, desc),
    traits: desc.length ? desc.slice(0, 2).join('、') : `${v.language || '多语言'}音色`,
    suitable: desc.length > 2 ? desc.slice(2).join('、') : `${v.language || '通用'}角色`,
  }
}

async function hydrateVoiceProfileCatalog() {
  try {
    const provider = boundAudioProviderKey.value || 'minimax'
    const rows = await voicesAPI.list(provider)
    voiceCatalogEntries.value = rows?.length ? rows.map(mapVoiceCatalogToProfile) : defaultVoiceCatalogSeed
  } catch (e) {
    console.error('Failed to load voices', e)
    voiceCatalogEntries.value = defaultVoiceCatalogSeed
  }
}

watch([boundAudioConfigId, audioProviderRows], () => { hydrateVoiceProfileCatalog() }, { deep: true })
async function bootstrapEpisodeWorkbench() {
  restoreShotFrameCaptureMode()
  await syncWorkbenchFromApi()
  await refreshWorkbenchAiConfigs()
  await hydrateVoiceProfileCatalog()
}

onMounted(() => { bootstrapEpisodeWorkbench() })
</script>

<style scoped>
/* ===== Studio Layout ===== */
.bench-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  padding: 14px;
  gap: 12px;
  background:
    radial-gradient(circle at top left, rgba(255,255,255,0.7), transparent 28%),
    linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0)),
    var(--bg-base);
}

.bench-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
  padding: 8px 12px;
  border-radius: 18px;
  background: rgba(252, 253, 255, 0.84);
  border: 1px solid rgba(27, 41, 64, 0.08);
  box-shadow: 0 14px 36px rgba(20, 32, 54, 0.07), 0 3px 10px rgba(20, 32, 54, 0.04);
  backdrop-filter: blur(16px);
}

.bench-header-core,
.rail-panel,
.canvas-main {
  background: rgba(252, 253, 255, 0.84);
  border: 1px solid rgba(27, 41, 64, 0.08);
  box-shadow: 0 18px 48px rgba(20, 32, 54, 0.08), 0 4px 14px rgba(20, 32, 54, 0.05);
  backdrop-filter: blur(16px);
}

.bench-header-core {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  box-shadow: none;
  backdrop-filter: none;
  background: transparent;
  min-width: 0;
}

.bench-back-link {
  width: auto;
  min-width: 76px;
  padding: 0 8px;
  height: 28px;
  border-radius: 999px;
  white-space: nowrap;
  font-size: 11px;
}

.bench-identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.bench-overline {
  display: none;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-3);
}

.bench-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.bench-title {
  font-size: 14px;
  line-height: 1;
  letter-spacing: -0.04em;
  white-space: nowrap;
}

.bench-episode-chip {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  background: rgba(19, 51, 121, 0.08);
  color: var(--accent-text);
  font-size: 9px;
  font-weight: 700;
}

.bench-meta-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
  min-width: 0;
}

.bench-meta-pill {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(18, 25, 42, 0.05);
  color: var(--text-2);
  font-size: 8px;
  font-weight: 600;
  white-space: nowrap;
}

.bench-meta-pill.is-stage {
  background: rgba(19, 51, 121, 0.08);
  color: var(--accent-text);
}
.bench-meta-pill.is-progress {
  background: rgba(45, 122, 69, 0.08);
  color: var(--success);
}
.bench-meta-inline {
  font-size: 9px;
  color: var(--text-3);
  font-weight: 600;
  white-space: nowrap;
}

.bench-header-aside {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.bench-actions {
  display: flex;
  gap: 6px;
}
.bench-header .btn {
  height: 28px;
  padding: 0 10px;
  font-size: 11px;
  white-space: nowrap;
}

.bench-body {
  display: grid;
  grid-template-columns: 244px minmax(0, 1fr);
  gap: 10px;
  min-height: 0;
  flex: 1;
}

/* ===== Sidebar ===== */
.rail-panel {
  width: auto;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  border-radius: 28px;
}
.icon-back-btn {
  width: 40px; height: 40px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid rgba(27, 41, 64, 0.1); border-radius: 14px;
  background: rgba(255,255,255,0.8); color: var(--text-2);
  cursor: pointer; transition: all 0.15s;
  box-shadow: var(--shadow-xs);
}
.icon-back-btn:hover { background: #fff; color: var(--text-0); }

/* Pipeline Nav */
.flow-menu { flex: 1; overflow-y: auto; padding: 16px 14px 12px; display: flex; flex-direction: column; gap: 12px; }
.flow-group { display: flex; flex-direction: column; gap: 4px; }
.flow-group-label {
  font-size: 10px; font-weight: 700; color: #95a1b6;
  text-transform: uppercase; letter-spacing: 0.1em;
  padding: 2px 8px 3px;
}
.flow-node {
  display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px;
  padding: 7px 10px;
  border-radius: 17px;
  font-size: 12px; font-weight: 600;
  background: none; border: 1px solid transparent; color: var(--text-2); cursor: pointer;
  transition: all 0.14s; width: 100%; text-align: left;
}
.flow-node:hover { background: rgba(255,255,255,0.3); color: var(--text-0); }
.flow-node.active {
  background: rgba(255,255,255,0.94);
  color: var(--text-0);
  border-color: rgba(27, 41, 64, 0.05);
  box-shadow: 0 8px 18px rgba(19, 33, 56, 0.045);
}
.flow-node.done { color: var(--success); }
.flow-node-sub {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  padding: 7px 10px;
  position: relative;
  min-height: 42px;
}

.flow-node-sub:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 18px;
  top: 25px;
  bottom: -7px;
  width: 1px;
  background: rgba(27, 41, 64, 0.07);
}

.flow-node-icon {
  width: 17px; height: 17px; border-radius: 999px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(246,248,252,0.98); border: 1px solid rgba(18,25,42,0.08);
  color: #aab4c6; flex-shrink: 0; transition: all 0.15s;
  position: relative;
  z-index: 1;
}
.flow-node.active .flow-node-icon { background: rgba(19, 51, 121, 0.07); border-color: rgba(19, 51, 121, 0.1); color: var(--accent-text); }
.flow-node.done .flow-node-icon { background: rgba(45, 122, 69, 0.96); border-color: rgba(45,122,69,0.18); color: #fff; }
.icon-active { background: var(--accent-dark) !important; border-color: var(--accent-dark) !important; color: #fff !important; }
.icon-done { background: var(--success) !important; border-color: var(--success) !important; color: #fff !important; }

.flow-node-title { flex: 1; font-size: 11.5px; }
.flow-node-copy { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.flow-node-hint {
  font-size: 8.5px;
  line-height: 1.35;
  color: var(--text-3);
  font-weight: 500;
}
.flow-node-badge {
  font-size: 9px; font-weight: 700; padding: 1px 5px;
  border-radius: 99px; background: var(--bg-3); color: var(--text-3);
  font-family: var(--font-mono);
}
.flow-node-badge.badge-done { background: var(--success-bg); color: var(--success); }
.flow-node-spinner { width: 10px; height: 10px; border: 1.5px solid var(--accent-bg); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }

/* Sidebar Bottom */
.rail-footer {
  padding: 12px 14px 14px;
  border-top: 1px solid rgba(27, 41, 64, 0.08);
  display: flex; flex-direction: column; gap: 8px;
  flex-shrink: 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.72));
}
.rail-quick-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 3px 0 2px;
}
.rail-quick-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  border: none;
  background: rgba(45, 122, 69, 0.22);
  cursor: pointer;
  transition: transform 0.14s, background 0.14s, box-shadow 0.14s;
}
.rail-quick-dot:hover {
  transform: scale(1.08);
}
.rail-quick-dot.active {
  background: var(--accent-dark);
  box-shadow: 0 0 0 2px rgba(76, 125, 255, 0.14);
}
.rail-quick-dot.done {
  background: var(--success);
}
.rail-quick-dot.active.done {
  background: #1e3f8a;
}
.tally-wrap { display: flex; flex-direction: column; gap: 5px; }
.tally-head { display: flex; justify-content: space-between; }
.tally-label { font-size: 10.5px; color: var(--text-3); font-weight: 500; }
.tally-val { font-size: 10.5px; color: var(--text-2); font-family: var(--font-mono); font-weight: 600; }
.tally-track { height: 6px; background: rgba(194, 207, 227, 0.92); border-radius: 99px; overflow: hidden; }
.tally-fill { height: 100%; background: var(--accent-gradient); border-radius: 99px; transition: width 0.5s var(--ease-out); }
.rail-reload-btn {
  width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px; font-size: 11.5px; color: var(--text-2);
  background: rgba(255,255,255,0.86); border: 1px solid rgba(27, 41, 64, 0.08); border-radius: 999px;
  cursor: pointer; transition: all 0.15s;
}
.rail-reload-btn:hover { background: #fff; color: var(--text-0); }

/* ===== Main Content ===== */
.canvas-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; min-height: 0; border-radius: 30px; }
.panel-root { flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; min-height: 0; }
.panel-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.86), rgba(255,255,255,0.52));
  overflow-x: auto;
  flex-shrink: 0;
}
.panel-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  background: rgba(255,255,255,0.7);
  color: var(--text-2);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s ease;
}
.panel-tab:hover {
  background: #fff;
  color: var(--text-0);
}
.panel-tab.active {
  background: rgba(19, 51, 121, 0.08);
  border-color: rgba(19, 51, 121, 0.12);
  color: #1e3f8a;
}
.panel-tab.done {
  color: var(--text-1);
}
.panel-tab-mark {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--success);
  box-shadow: 0 0 0 4px rgba(45, 122, 69, 0.1);
}

/* Toolbar */
.wizard-bar {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 14px; border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.8), rgba(255,255,255,0.42)); flex-shrink: 0;
}
.clip-toolbar { background: linear-gradient(180deg, rgba(255,255,255,0.8), rgba(255,255,255,0.42)); }
.bar-start { display: flex; align-items: center; gap: 8px; flex: 1; }
.bar-end { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.wizard-step { display: flex; align-items: center; gap: 8px; }
.wizard-num {
  width: 26px; height: 26px; border-radius: 10px;
  display: inline-flex; align-items: center; justify-content: center;
  background: rgba(19, 51, 121, 0.08);
  font-family: var(--font-mono); font-size: 10px; font-weight: 800; color: var(--accent-text); letter-spacing: 0.05em;
}
.wizard-name { font-size: 13px; font-weight: 700; color: var(--text-1); font-family: var(--font-display); }
.glyph-tally { font-size: 11px; color: var(--text-3); font-family: var(--font-mono); }

/* Editor Area */
.wizard-pane { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.url-fetch-row {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px 0;
  border-bottom: 1px solid rgba(27, 41, 64, 0.06);
  background: rgba(255, 255, 255, 0.35);
}
.url-fetch-input {
  flex: 1; min-width: 0;
  height: 34px; padding: 0 12px;
  border: 1px solid rgba(27, 41, 64, 0.12);
  border-radius: 8px;
  font-size: 12.5px; color: var(--text-0);
  background: rgba(255, 255, 255, 0.85);
  outline: none;
}
.url-fetch-input:focus { border-color: var(--accent); }
.url-fetch-input:disabled { opacity: 0.6; }
.url-fetch-hint {
  margin: 0; padding: 6px 16px 10px;
  font-size: 11px; color: var(--text-3); line-height: 1.5;
  background: rgba(255, 255, 255, 0.35);
  border-bottom: 1px solid rgba(27, 41, 64, 0.06);
}
.stretch-input {
  flex: 1; border: none; border-radius: 0; padding: 26px 28px;
  font-size: 13.5px; line-height: 1.9; resize: none; outline: none;
  font-family: var(--font-body); background: linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0.12)); color: var(--text-0);
}
.stretch-input:focus { box-shadow: none; }

/* Step Empty State */
.wizard-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  flex: 1; min-height: 300px; gap: 10px; padding: 46px;
  animation: fadeIn 0.3s var(--ease-out);
}
.vacant-art {
  width: 72px; height: 72px; border-radius: 22px;
  background: rgba(255,255,255,0.8); color: var(--accent);
  border: 1px solid rgba(27, 41, 64, 0.08);
  box-shadow: var(--shadow-sm);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 8px;
}
.vacant-title { font-size: 22px; font-weight: 700; font-family: var(--font-display); color: var(--text-0); }
.vacant-desc { font-size: 13px; color: var(--text-2); max-width: 420px; text-align: center; line-height: 1.8; }
.wizard-empty-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center; }

/* Step Loading */
.wizard-loading {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  flex: 1; gap: 12px;
}
.wait-msg { font-size: 13px; color: var(--text-2); }

/* Step Navigator Bubble */
.wizard-nav {
  position: static;
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px 12px;
  background: linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.58));
  border-top: 1px solid rgba(27, 41, 64, 0.08);
  margin-top: auto;
}
.wizard-nav-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; border-radius: 999px; font-size: 11.5px; font-weight: 500;
  border: 1px solid rgba(27, 41, 64, 0.08); background: rgba(255,255,255,0.84); color: var(--text-2); cursor: pointer;
  transition: all 0.15s; white-space: nowrap;
}
.wizard-nav-btn:hover:not(:disabled) { background: #fff; color: var(--text-0); }
.wizard-nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.wizard-nav-btn.primary { margin-left: auto; background: linear-gradient(135deg, #557ff4, #345fcc); color: #fff; box-shadow: 0 6px 16px rgba(53, 95, 206, 0.2); border-color: transparent; }
.wizard-nav-btn.primary:hover:not(:disabled) { filter: brightness(1.08); }
.wizard-nav-btn.primary:disabled { filter: none; box-shadow: none; opacity: 0.5; }
.wizard-nav-dots { display: flex; gap: 7px; padding: 0 4px; }
.wizard-nav-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: rgba(143, 160, 184, 0.4); cursor: pointer; transition: all 0.15s;
  border: none;
}
.wizard-nav-dot.done { background: var(--success); }
.wizard-nav-dot.current { background: var(--accent-dark); transform: scale(1.2); box-shadow: 0 0 0 2px rgba(76, 125, 255, 0.14); }

/* Extract grid */
.parse-stage { flex: 1; min-height: 0; overflow: hidden; padding: 12px 16px; display: grid; grid-template-columns: 280px minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: stretch; }
.parse-summary { padding: 16px; display: flex; flex-direction: column; gap: 14px; align-self: stretch; position: sticky; top: 0; max-height: 100%; }
.parse-summary-kicker { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-3); }
.parse-summary-title { font-size: 20px; line-height: 1.05; font-family: var(--font-display); color: var(--text-0); }
.parse-summary-desc { font-size: 12px; color: var(--text-2); line-height: 1.7; }
.parse-summary-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.parse-summary-stat { padding: 10px 12px; border-radius: 14px; background: rgba(19, 51, 121, 0.05); border: 1px solid rgba(19, 51, 121, 0.08); display: flex; flex-direction: column; gap: 4px; }
.parse-summary-stat span { font-size: 10px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.08em; }
.parse-summary-stat strong { font-size: 18px; color: var(--text-0); font-family: var(--font-display); }
.parse-summary-note { padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,0.56); border: 1px solid rgba(27, 41, 64, 0.08); font-size: 11px; line-height: 1.7; color: var(--text-2); }
.parse-card { overflow: hidden; min-height: 0; display: flex; flex-direction: column; }
.parse-card-head {
  display: flex; align-items: center; gap: 8px;
  padding: 11px 14px; font-size: 12px; font-weight: 600;
  border-bottom: 1px solid var(--border); background: var(--bg-1);
  color: var(--text-1);
}
.parse-list { padding: 8px 14px; flex: 1; min-height: 0; overflow-y: auto; }
.parse-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; }
.parse-row + .parse-row { border-top: 1px solid var(--border); }
.cast-avatar {
  width: 30px; height: 30px; border-radius: 50%;
  background: var(--accent-bg); color: var(--accent-text);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; flex-shrink: 0;
}
.set-marker {
  width: 30px; height: 30px; border-radius: 6px;
  background: var(--bg-2); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  color: var(--text-3); flex-shrink: 0;
}
.parse-info { min-width: 0; }
.parse-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.parse-name { font-size: 13px; font-weight: 600; }
.parse-meta { font-size: 11px; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.parse-meta.wrap { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }

/* Voice grid */
.tts-stage { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 16px; display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 12px; }
.tts-stage-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-self: start;
  position: sticky;
  top: 0;
  min-height: 0;
  max-height: calc(100vh - 210px);
  overflow: hidden;
}
.tts-stage-kicker { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-3); }
.tts-stage-title { font-size: 20px; line-height: 1.05; font-family: var(--font-display); color: var(--text-0); }
.tts-stage-desc { font-size: 12px; color: var(--text-2); line-height: 1.7; }
.tts-stage-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.tts-stage-stat { padding: 10px 12px; border-radius: 14px; background: rgba(19, 51, 121, 0.05); border: 1px solid rgba(19, 51, 121, 0.08); display: flex; flex-direction: column; gap: 3px; }
.tts-stage-stat-label { font-size: 10px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.08em; }
.tts-stage-stat strong { font-size: 18px; color: var(--text-0); font-family: var(--font-display); }
.tts-catalog-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
}
.tts-catalog {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}
.tts-catalog-item { padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,0.56); border: 1px solid rgba(27, 41, 64, 0.08); display: flex; flex-direction: column; gap: 4px; }
.tts-catalog-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tts-catalog-name { font-size: 13px; font-weight: 700; color: var(--text-0); }
.tts-catalog-traits { font-size: 11px; color: var(--text-1); }
.tts-catalog-fit { font-size: 10px; color: var(--text-3); line-height: 1.5; }

.tts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; align-content: start; }
.tts-card { padding: 16px; display: flex; flex-direction: column; gap: 12px; border-radius: 22px; min-height: 0; }
.tts-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.tts-char { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.tts-name { min-width: 0; flex: 1; }
.tts-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tts-card-copy { min-height: 58px; }
.tts-card-text { font-size: 12px; line-height: 1.7; color: var(--text-2); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.tts-select-block { display: flex; flex-direction: column; gap: 6px; }
.tts-block-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-3); }
.tts-profile-card { padding: 12px; border-radius: 16px; background: linear-gradient(135deg, rgba(19, 51, 121, 0.08), rgba(255,255,255,0.78)); border: 1px solid rgba(19, 51, 121, 0.1); display: flex; flex-direction: column; gap: 4px; }
.tts-profile-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tts-profile-name { font-size: 13px; font-weight: 700; color: var(--accent-text); }
.tts-profile-traits { font-size: 11px; color: var(--text-1); }
.tts-profile-fit { font-size: 10px; color: var(--text-2); line-height: 1.5; }
.tts-actions-row { display: flex; align-items: center; gap: 8px; }
.tts-player audio { width: 100%; height: 30px; border-radius: var(--radius); }
.cast-avatar.lg { width: 38px; height: 38px; font-size: 16px; }

/* Split layout (storyboard) */
.split-cols { flex: 1; display: flex; min-height: 0; overflow: hidden; }
.lens-list { width: 296px; flex-shrink: 0; overflow-y: auto; border-right: 1px solid var(--border); background: var(--bg-0); }
.lens-list-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 11px 12px 10px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.06);
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(10px);
}
.lens-list-title { font-size: 13px; font-weight: 700; color: var(--text-0); }
.lens-list-sub { margin-top: 3px; font-size: 11px; color: var(--text-3); line-height: 1.45; }
.lens-list-body { padding: 6px; }
.lens-item {
  position: relative; padding: 10px 11px; cursor: pointer;
  border: 1px solid transparent; border-left: 3px solid transparent;
  transition: all 0.15s;
  display: flex; flex-direction: column; gap: 5px;
  border-radius: 14px;
}
.lens-item + .lens-item { margin-top: 6px; }
.lens-item:hover { background: var(--bg-hover); border-color: rgba(27, 41, 64, 0.06); }
.lens-item.active {
  background: var(--bg-0);
  border-left-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent-glow);
  z-index: 1;
}
.lens-item-header { display: flex; align-items: center; gap: 8px; }
.lens-num {
  font-size: 11px; font-family: var(--font-mono); font-weight: 700;
  color: var(--accent); background: var(--accent-bg);
  padding: 2px 6px; border-radius: 4px; flex-shrink: 0;
  letter-spacing: 0.03em;
}
.lens-item.active .lens-num { background: var(--accent); color: #fff; }
.lens-status { display: flex; gap: 4px; margin-left: auto; flex-shrink: 0; }
.lens-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--bg-3); flex-shrink: 0; }
.lens-dot.has-img { background: var(--success); }
.lens-dot.has-video { background: var(--info); }
.lens-dot.has-dialogue { background: var(--warning); }
.lens-body { }
.lens-desc { font-size: 12px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: var(--text-1); }
.lens-item.active .lens-desc { color: var(--text-0); }
.lens-meta { display: flex; align-items: center; gap: 6px; }
.lens-location {
  font-size: 10px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lens-dialogue {
  font-size: 10px; color: var(--text-3); margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  padding-left: 2px; border-left: 2px solid var(--border);
  padding-left: 6px;
}

.inspector-panel { flex: 1; display: flex; flex-direction: column; overflow-y: auto; min-width: 0; }
.inspector-head { display: flex; align-items: center; gap: 8px; padding: 9px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.inspector-head-copy { display: flex; flex-direction: column; gap: 2px; }
.inspector-head-title { font-size: 14px; font-weight: 700; color: var(--text-0); }
.inspector-head-sub { font-size: 11px; color: var(--text-3); }
.inspector-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.inspector-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(220px, 0.9fr);
  gap: 12px;
  padding: 12px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(20,39,82,0.08), rgba(255,255,255,0.68));
  border: 1px solid rgba(27, 41, 64, 0.08);
}
.inspector-hero-copy { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.inspector-hero-label {
  font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--text-3);
}
.inspector-hero-text { font-size: 13px; color: var(--text-1); line-height: 1.7; }
.inspector-status-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.inspector-preview-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.inspector-preview-card { display: flex; flex-direction: column; gap: 6px; }
.inspector-preview-title { font-size: 11px; font-weight: 700; color: var(--text-2); }
.inspector-preview-media {
  position: relative; aspect-ratio: 16/9; overflow: hidden;
  border-radius: 14px; background: rgba(18,25,42,0.08);
  border: 1px solid rgba(27, 41, 64, 0.08);
}
.inspector-preview-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.inspector-preview-empty {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  color: var(--text-3); font-size: 12px;
}
.inspector-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255,255,255,0.72);
  border: 1px solid rgba(27, 41, 64, 0.08);
}
.inspector-block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.inspector-block-title { font-size: 12px; font-weight: 700; color: var(--text-0); }
.inspector-block-copy { font-size: 11px; color: var(--text-3); }

/* Field */
.form-block { display: flex; flex-direction: column; gap: 5px; }
.form-label { font-size: 12px; font-weight: 500; color: var(--text-1); }
.form-row { display: flex; gap: 12px; }
.form-grid { display: grid; gap: 12px; }
.form-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.form-grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.config-pin {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(19, 51, 121, 0.08);
  border: 1px solid rgba(19, 51, 121, 0.12);
  color: var(--text-1);
  font-size: 11px;
  font-weight: 600;
}
.config-pin-banner {
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-2);
}
.cast-chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
.cast-chip {
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(27, 41, 64, 0.12);
  background: rgba(255,255,255,0.86);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.cast-chip:hover { border-color: var(--accent); color: var(--text-0); }
.cast-chip.active {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
  box-shadow: 0 8px 18px rgba(29, 77, 176, 0.18);
}

/* Production tabs */
.clip-tabs { display: flex; gap: 0; background: var(--bg-2); border-radius: var(--radius); padding: 2px; }
.clip-tab {
  display: flex; align-items: center; gap: 4px; padding: 6px 12px; font-size: 12px;
  border: none; background: transparent; color: var(--text-2); cursor: pointer;
  border-radius: calc(var(--radius) - 2px); transition: all 0.15s; font-weight: 500;
}
.clip-tab:hover { color: var(--text-0); }
.clip-tab.active { background: var(--bg-0); color: var(--text-0); font-weight: 600; box-shadow: var(--shadow-xs); }
.clip-tab-badge { font-size: 10px; font-family: var(--font-mono); padding: 0 4px; background: var(--bg-3); border-radius: 99px; }
.clip-tab.active .clip-tab-badge { background: var(--accent-bg); color: var(--accent-text); }

/* Production content */
.clip-pane { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; }
.clip-section-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

/* Asset grid */
.tile-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; }
.tile-card {
  display: flex; flex-direction: column; overflow: hidden;
  transition: transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out), border-color 0.18s var(--ease-out);
}
.tile-card:hover { transform: translateY(-2px); box-shadow: 0 16px 30px rgba(20, 32, 54, 0.08); }
.tile-cover { position: relative; aspect-ratio: 1; background: var(--bg-2); overflow: hidden; }
.tile-cover.wide { aspect-ratio: 16/9; }
.tile-cover img { width: 100%; height: 100%; object-fit: cover; }
.zoom-hit { cursor: zoom-in; transition: transform 0.18s var(--ease-out), filter 0.18s var(--ease-out); }
.zoom-hit:hover { transform: scale(1.015); filter: saturate(1.04); }
.tile-cover-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(7,11,21,0.58);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}
.tile-cover-badge.is-ready {
  background: rgba(36, 125, 72, 0.92);
}
.tile-cover-badge.is-pending {
  background: rgba(19, 51, 121, 0.92);
}
.tile-cover-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-3); }
.tile-body { padding: 8px 10px; }
.tile-name { font-size: 13px; font-weight: 600; }
.tile-meta { font-size: 11px; }
.tile-foot { display: flex; align-items: center; gap: 4px; padding: 6px 10px; border-top: 1px solid var(--border); }

/* Frame grid */
.keyframe-grid { display: flex; flex-direction: column; gap: 8px; }
.keyframe-row {
  display: flex; align-items: center; gap: 14px;
  padding: 12px 14px; cursor: pointer;
  border-radius: var(--radius-lg);
  transition: all 0.15s;
  border: 1.5px solid transparent;
}
.keyframe-row:hover { background: var(--bg-0); border-color: var(--border); }
.keyframe-row.active {
  background: var(--bg-0);
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}
.keyframe-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.keyframe-top { display: flex; align-items: center; gap: 8px; }
.keyframe-num {
  font-size: 13px; font-family: var(--font-mono); font-weight: 800;
  color: var(--accent);
}
.keyframe-badge {
  font-size: 11px; font-weight: 600; padding: 2px 8px;
  border-radius: 20px;
  background: var(--accent-bg); color: var(--accent);
  border: 1px solid var(--accent-glow);
  white-space: nowrap;
}
.keyframe-desc {
  font-size: 12px; line-height: 1.5; color: var(--text-1);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.keyframe-meta { display: flex; align-items: center; gap: 6px; }
.keyframe-thumbs { display: flex; gap: 8px; flex-shrink: 0; }
.keyframe-thumb-wrap { display: flex; flex-direction: column; gap: 3px; align-items: center; }
.keyframe-thumb-label { font-size: 10px; font-weight: 600; color: var(--text-3); }
.keyframe-thumb {
  position: relative; width: 130px; aspect-ratio: 16/9;
  border-radius: 6px; overflow: hidden;
  background: var(--bg-2); cursor: pointer;
  transition: all 0.15s; border: 1.5px solid var(--border);
}
.keyframe-thumb:hover { border-color: var(--accent); box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
.keyframe-thumb img { width: 100%; height: 100%; object-fit: cover; }
.keyframe-thumb-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-3); }
.keyframe-re {
  position: absolute; top: 3px; right: 3px; width: 18px; height: 18px;
  border-radius: 50%; background: rgba(0,0,0,0.5); color: #fff;
  display: none; align-items: center; justify-content: center;
}
.keyframe-thumb:hover .keyframe-re { display: flex; }
.keyframe-scroll { flex: 1; overflow-y: auto; padding: 10px 12px; }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--bg-3); flex-shrink: 0; }
.status-dot.ok { background: var(--success); }
.status-dot.pending {
  background: var(--accent-dark);
  box-shadow: 0 0 0 3px rgba(76, 125, 255, 0.14);
}

/* Prod grid */
.clip-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
.clip-card {
  display: flex; flex-direction: column; overflow: hidden;
  transition: transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out), border-color 0.18s var(--ease-out);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(255,255,255,0.74), rgba(248,251,255,0.58));
}
.clip-card:hover { transform: translateY(-2px); box-shadow: 0 16px 30px rgba(20, 32, 54, 0.08); }
.clip-cover { position: relative; aspect-ratio: 16/9; background: var(--bg-2); overflow: hidden; }
.clip-cover img { width: 100%; height: 100%; object-fit: cover; }
.clip-video { width: 100%; height: 100%; object-fit: cover; background: #000; display: block; }
.clip-cover-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-3); }
.clip-idx {
  position: absolute; top: 5px; left: 5px; font-size: 10px; font-weight: 700;
  font-family: var(--font-mono); background: rgba(0,0,0,0.5); color: #fff; padding: 1px 5px; border-radius: 3px;
}
.clip-overlay-badge {
  position: absolute; bottom: 5px; right: 5px; font-size: 10px; font-weight: 600;
  background: var(--success); color: #fff; padding: 1px 5px; border-radius: 3px;
}
.clip-info { padding: 10px 12px 8px; }
.clip-desc { font-size: 12px; line-height: 1.4; }
.clip-meta-line { margin-top: 5px; font-size: 10px; color: var(--text-3); }
.clip-dots { display: flex; align-items: center; gap: 4px; margin-top: 5px; color: var(--text-3); }
.clip-error {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--error);
}
.clip-actions { display: flex; gap: 6px; padding: 8px 10px 10px; border-top: 1px solid rgba(27, 41, 64, 0.08); }
.clip-actions .btn { flex: 1; justify-content: center; }

/* Image viewer */
.lightbox-overlay {
  z-index: 120;
  padding: 28px;
  background: rgba(18, 24, 34, 0.68);
  backdrop-filter: blur(10px);
}
.lightbox-dialog {
  width: min(1100px, calc(100vw - 56px));
  max-height: calc(100vh - 56px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,251,255,0.92));
}
.lightbox-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
}
.lightbox-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
  font-family: var(--font-display);
}
.lightbox-body {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  overflow: auto;
  min-height: 0;
}
.lightbox-img {
  display: block;
  max-width: 100%;
  max-height: calc(100vh - 140px);
  border-radius: 18px;
  box-shadow: 0 18px 48px rgba(8, 14, 24, 0.22);
  background: rgba(255,255,255,0.9);
}

/* Grid tool dialog */
.field-label-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.storyboard-puzzle-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.image-aspect-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.video-config-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.compose-options-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.compose-opt {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-2);
  cursor: pointer;
  user-select: none;
}
.compose-opt input {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--accent);
}
.mosaic-tool { width: min(1320px, calc(100vw - 40px)); max-height: calc(100vh - 48px); display: flex; flex-direction: column; overflow: hidden; animation: scaleIn 0.2s var(--ease-out); }
.mosaic-tool-head { display: flex; align-items: center; gap: 8px; padding: 16px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.mosaic-tool-body { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
.mosaic-tool-body-preview { overflow: hidden; min-height: 0; padding-bottom: 10px; }
.mosaic-tool-foot { display: flex; align-items: center; gap: 8px; padding-top: 12px; border-top: 1px solid var(--border); margin-top: 4px; }
.mosaic-preview-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.72fr) minmax(340px, 400px);
  gap: 14px;
  min-height: 0;
  flex: 1;
  align-items: start;
}
.mosaic-preview-pane {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mosaic-assignment-pane {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(27, 41, 64, 0.08);
  border-radius: 18px;
  background: rgba(255,255,255,0.66);
  overflow: hidden;
  max-height: min(70vh, 840px);
}
.mosaic-assign-head {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0.72));
}
.mosaic-assign-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-0);
  font-family: var(--font-display);
}
.mosaic-assign-subtitle {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-3);
}
.mosaic-assign-pagination {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  background: rgba(255,255,255,0.86);
}
.mosaic-assign-columns {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 96px minmax(0, 1fr);
  gap: 8px;
  padding: 7px 12px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  background: rgba(246, 248, 252, 0.92);
  font-size: 10px;
  font-weight: 700;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* Prompt preview */
.mosaic-prompt-summary { background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; }
.mosaic-prompt-label { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; color: var(--text-2); margin-bottom: 6px; }
.mosaic-prompt-text { font-size: 12px; color: var(--text-1); line-height: 1.7; }

.mosaic-blank-preview {
  display: grid;
  gap: 4px;
  border: 1.5px dashed var(--border-strong);
  border-radius: var(--radius);
  padding: 8px;
  min-height: 200px;
}
.mosaic-blank-cell {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 70px;
}
.mosaic-blank-cell.vacant { opacity: 0.4; }
.mosaic-blank-cell-index { font-size: 10px; font-weight: 700; color: var(--accent); font-family: var(--font-mono); }
.mosaic-blank-cell-desc { font-size: 11px; color: var(--text-2); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.mosaic-mode-tabs { display: flex; gap: 6px; }
.mosaic-mode-tab { flex: 1; display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: var(--radius); background: var(--bg-0); cursor: pointer; transition: all 0.15s; text-align: left; }
.mosaic-mode-tab:hover { border-color: var(--border-strong); }
.mosaic-mode-tab.active { border-color: var(--accent); background: var(--accent-bg); }
.mosaic-config { display: flex; gap: 12px; align-items: flex-end; }
.mosaic-pick-list { display: flex; flex-direction: column; gap: 2px; max-height: 260px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius); padding: 4px; }
.mosaic-pick-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 4px; cursor: pointer; transition: background 0.1s; }
.mosaic-pick-item:hover { background: var(--bg-hover); }
.mosaic-pick-item.selected { background: var(--accent-bg); }
.mosaic-pick-item input { accent-color: var(--accent); }
.mosaic-preview-wrap {
  border-radius: var(--radius);
  overflow: auto;
  border: 1px solid var(--border);
  background: rgba(14, 19, 28, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  max-height: min(70vh, 860px);
  padding: 10px;
}
.mosaic-preview-stage {
  position: relative;
  width: fit-content;
  max-width: 100%;
  margin: auto;
  line-height: 0;
}
.mosaic-preview-img {
  display: block;
  width: auto;
  max-width: 100%;
  max-height: min(66vh, 820px);
  object-fit: contain;
}
.mosaic-overlay { position: absolute; inset: 0; display: grid; }
.mosaic-overlay-cell {
  border: 1px dashed rgba(255,255,255,0.42);
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  padding: 4px 6px;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
.mosaic-overlay-cell.active {
  background: rgba(255,255,255,0.08);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.28);
}
.mosaic-cell-label { font-size: 10px; font-weight: 700; color: #fff; background: rgba(0,0,0,0.5); padding: 1px 5px; border-radius: 3px; }
.mosaic-adjust-summary { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 0 2px; }
.mosaic-assign-info {
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 4px 12px 10px;
}
.mosaic-assign-row {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 112px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(27, 41, 64, 0.08);
}
.mosaic-assign-row.active {
  background: rgba(32, 86, 190, 0.05);
  border-radius: 12px;
  padding-left: 6px;
  padding-right: 6px;
}
.mosaic-assign-row:last-child { border-bottom: 0; }
.mosaic-assign-index {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-3);
  font-family: var(--font-mono);
}
.mosaic-assign-bind {
  font-size: 11px;
  color: var(--text-2);
  line-height: 1.45;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mosaic-history-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  padding: 10px 12px 12px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(255,255,255,0.82), rgba(255,255,255,0.64));
}
.mosaic-history-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.mosaic-history-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-0);
  font-family: var(--font-display);
}
.mosaic-history-subtitle {
  font-size: 11px;
  color: var(--text-3);
}
.mosaic-history-list {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(160px, 182px);
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.mosaic-history-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  border-radius: 16px;
  background: rgba(255,255,255,0.78);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}
.mosaic-history-item:hover {
  border-color: rgba(33, 88, 255, 0.18);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}
.mosaic-history-item.active {
  border-color: rgba(33, 88, 255, 0.26);
  background: linear-gradient(180deg, rgba(244,248,255,0.96), rgba(255,255,255,0.86));
  box-shadow: 0 14px 28px rgba(33, 88, 255, 0.12);
}
.mosaic-history-thumb {
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  background: rgba(14, 19, 28, 0.05);
}
.mosaic-history-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.mosaic-history-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mosaic-history-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.mosaic-history-meta {
  font-size: 10.5px;
  color: var(--text-3);
  line-height: 1.45;
  word-break: break-word;
}

.mosaic-strip {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(255,255,255,0.84), rgba(255,255,255,0.62));
}
.mosaic-strip-thumb {
  width: 72px;
  height: 48px;
  padding: 0;
  border: 1px solid rgba(27, 41, 64, 0.08);
  border-radius: 10px;
  overflow: hidden;
  background: rgba(14, 19, 28, 0.06);
  cursor: zoom-in;
  box-shadow: none;
}
.mosaic-strip-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.mosaic-strip-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.mosaic-strip-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.mosaic-strip-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-0);
  font-family: var(--font-display);
}
.mosaic-strip-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 10px;
  color: var(--text-3);
}
.mosaic-strip-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* Export */
.deliver-split { flex: 1; display: flex; min-height: 0; }
.deliver-main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px; }
.deliver-video { max-width: 720px; width: 100%; border-radius: var(--radius-lg); background: #000; }
.deliver-bar { display: flex; align-items: center; gap: 12px; margin-top: 16px; width: 100%; max-width: 720px; }
.deliver-bar-actions { display: flex; align-items: center; gap: 8px; }
.deliver-hint { margin: 10px 0 0; max-width: 720px; width: 100%; font-size: 12px; line-height: 1.5; }
.deliver-list { width: 240px; flex-shrink: 0; border-left: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
.deliver-list-head { padding: 11px 14px; font-size: 11px; font-weight: 700; color: var(--text-3); border-bottom: 1px solid var(--border); text-transform: uppercase; letter-spacing: 0.06em; }
.deliver-list-body { flex: 1; overflow-y: auto; padding: 6px; }
.ui-exp-row { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: var(--radius); }
.ui-exp-row:hover { background: var(--bg-hover); }

/* Shared */
.text-muted { color: var(--text-3); }

@media (max-width: 1240px) {
  .bench-body {
    grid-template-columns: 1fr;
  }

  .bench-header {
    flex-direction: column;
    align-items: stretch;
  }

  .bench-header-aside {
    justify-content: space-between;
  }

  .split-cols,
  .deliver-split {
    flex-direction: column;
  }

  .rail-panel {
    max-height: 340px;
  }

  .lens-list,
  .deliver-list {
    width: 100%;
  }

  .inspector-panel {
    min-height: 420px;
  }

  .form-grid-4 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .lightbox-overlay {
    padding: 16px;
  }

  .lightbox-dialog {
    width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
  }

  .mosaic-tool {
    width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);
  }

  .mosaic-preview-layout {
    grid-template-columns: 1fr;
  }

  .mosaic-preview-wrap,
  .mosaic-preview-img {
    max-height: 42vh;
  }

  .mosaic-assignment-pane {
    max-height: 42vh;
  }

  .mosaic-assign-columns {
    display: none;
  }

  .mosaic-assign-row {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
}

@media (max-width: 860px) {
  .bench-shell {
    padding: 12px;
    gap: 12px;
  }

  .bench-header-core {
    align-items: flex-start;
  }

  .bench-header-aside,
  .bench-actions {
    flex-wrap: wrap;
  }

  .bar-end,
  .wizard-nav,
  .deliver-bar {
    flex-wrap: wrap;
  }

  .parse-grid,
  .tts-grid,
  .tile-grid,
  .clip-grid {
    grid-template-columns: 1fr;
  }

  .tts-stage {
    grid-template-columns: 1fr;
  }

  .parse-stage {
    grid-template-columns: 1fr;
  }

  .parse-summary {
    position: static;
  }

  .tts-stage-panel {
    position: static;
    max-height: none;
    overflow: visible;
  }

  .keyframe-row {
    flex-direction: column;
    align-items: stretch;
  }

  .inspector-hero {
    grid-template-columns: 1fr;
  }

  .form-grid-2,
  .form-grid-4 {
    grid-template-columns: 1fr;
  }

  .keyframe-thumbs {
    width: 100%;
  }

  .keyframe-thumb {
    width: 100%;
  }

  .mosaic-strip {
    grid-template-columns: 1fr;
  }

  .mosaic-history-list {
    grid-auto-columns: minmax(148px, 168px);
  }

  .mosaic-strip-thumb {
    width: 100%;
    height: auto;
    aspect-ratio: 16 / 9;
  }

  .mosaic-strip-actions {
    justify-content: flex-start;
  }
}
</style>
