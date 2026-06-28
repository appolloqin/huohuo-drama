<template>
  <div class="page">
    <div v-if="dramaLoadBusy" class="page-loading">
      <div class="page-loading-head skeleton-line"></div>
      <div class="page-loading-card card"></div>
      <div class="page-loading-card card"></div>
    </div>
    <div v-else-if="drama" class="page-inner">
    <!-- Header -->
    <div class="page-head">
      <div class="head-left">
        <button class="back-btn" @click="navigateTo('/')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          {{ isNovel ? tm.novel.back : tm.drama.back }}
        </button>
        <div class="head-info">
          <input
            v-model="titleDraft"
            class="page-title-input"
            type="text"
            :placeholder="titleEditPlaceholder"
            :disabled="titleSaveBusy"
            maxlength="200"
            @blur="commitTitleEdit"
            @keydown.enter.prevent="$event.target.blur()"
          />
          <div class="page-meta">
            <template v-if="isNovel">
              <span v-if="novelGenreLabel" class="style-chip novel-chip">{{ novelGenreLabel }}</span>
              <span v-else class="style-chip novel-chip novel-chip-muted">{{ tm.novel.genreUnset }}</span>
              <span class="meta-divider"></span>
              <span class="meta-item">{{ tx(tm.novel.totalBookWords, { n: formatNovelWords(novelStats.totalChars) }) }}</span>
              <span class="meta-divider"></span>
              <span class="meta-item">{{ tx(tm.novel.chaptersWritten, { written: novelStats.written, total: novelStats.total }) }}</span>
            </template>
            <template v-else>
              <span v-if="drama.style" class="style-chip">{{ resolveDramaStyleLabel(drama.style) }}</span>
              <button type="button" class="style-edit-btn" @click="revealStylePicker">{{ tm.drama.setStyle }}</button>
              <span v-if="drama.style" class="meta-divider"></span>
              <span class="meta-item">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                {{ drama.characters?.length || 0 }} {{ tm.drama.characters }}
              </span>
              <span class="meta-divider"></span>
              <span class="meta-item">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>
                {{ drama.scenes?.length || 0 }} {{ tm.drama.scenes }}
              </span>
            </template>
          </div>
        </div>
      </div>
      <div class="head-actions">
        <button
          type="button"
          class="btn btn-template"
          :class="{ 'is-published': dramaIsTemplate }"
          @click="revealTemplatePublishSheet"
        >
          {{ dramaIsTemplate ? tm.templates.publishedBadge : tm.templates.publishTitle }}
        </button>
        <HoverTip
          v-if="!isNovel && pendingUnitCount > 0"
          :text="tm.drama.digitalDirectorHint"
          :disabled="batchRunningOnPage"
        >
          <button
            type="button"
            class="btn btn-batch"
            :disabled="batchRunningOnPage || !canGenerate"
            @click="openBatchJobDialog"
          >
            {{ batchRunningOnPage ? tm.drama.digitalDirectorRunning : tm.drama.digitalDirector }}
          </button>
        </HoverTip>
        <button class="btn btn-primary" @click="isNovel ? revealCreateChapterSheet() : revealCreateEpisodeSheet()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {{ isNovel ? tm.novel.addChapter : tm.drama.addEpisode }}
        </button>
      </div>
    </div>

    <!-- Novel premise & outline -->
    <div v-if="isNovel" class="novel-meta-stack">
      <div class="outline-panel card">
        <div class="outline-head">
          <span class="section-label inline">{{ tm.index.premise }}</span>
          <div class="outline-actions">
            <HoverTip
              v-if="episodeStats.total > 0"
              :text="tm.novel.digitalWriterHint"
              :disabled="batchRunningOnPage"
            >
              <button
                type="button"
                class="btn btn-sm btn-batch"
                :disabled="batchRunningOnPage || !canGenerate"
                @click="openBatchJobDialog"
              >
                {{ batchRunningOnPage ? tm.novel.digitalWriterRunning : tm.novel.digitalWriter }}
              </button>
            </HoverTip>
            <button type="button" class="btn btn-sm" :disabled="premiseSaveBusy" @click="persistPremiseDraft">{{ premiseSaveBusy ? tm.novel.saving : tm.novel.savePremise }}</button>
          </div>
        </div>
        <div class="premise-keywords-row">
          <input
            v-model="premiseSeedKeywords"
            class="input"
            :placeholder="tm.index.premiseKeywordsPlaceholder"
            @keydown.enter.prevent="generatePremiseDraft"
          />
          <button
            type="button"
            class="btn btn-sm btn-primary premise-gen-btn"
            :disabled="premiseGenBusy || !premiseSeedKeywords.trim() || !canGenerate"
            @click="generatePremiseDraft"
          >
            {{ premiseGenBusy ? tm.index.generatingPremise : tm.index.generatePremise }}
          </button>
        </div>
        <textarea v-model="novelPremiseText" class="input outline-textarea premise-textarea" rows="4" :placeholder="tm.index.premisePlaceholder" />
        <p class="outline-hint">{{ tm.novel.premiseHint }}</p>
      </div>

      <div class="outline-panel card">
        <div class="outline-head">
          <span class="section-label inline">{{ tm.novel.outline }}</span>
          <div class="outline-actions">
            <button type="button" class="btn btn-sm" :disabled="outlineSaveBusy" @click="persistOutlineDraft">{{ outlineSaveBusy ? tm.novel.saving : tm.novel.saveOutline }}</button>
            <button type="button" class="btn btn-sm btn-primary" :disabled="outlineGenBusy || !canGenerate" @click="generateOutlineDraft">
              {{ outlineGenBusy ? tm.novel.generatingOutline : tm.novel.generateOutline }}
            </button>
          </div>
        </div>
        <textarea v-model="novelOutlineText" class="input outline-textarea" rows="6" :placeholder="tm.novel.outlinePlaceholder" />
        <p class="outline-hint">{{ tm.novel.outlineHint }}</p>
      </div>
    </div>

    <!-- Drama synopsis -->
    <div v-if="!isNovel" class="drama-synopsis-stack">
      <div class="outline-panel card">
        <div class="outline-head">
          <span class="section-label inline">{{ tm.drama.projectSynopsis }}</span>
          <div class="outline-actions">
            <button type="button" class="btn btn-sm" :disabled="synopsisSaveBusy" @click="persistSynopsisDraft">
              {{ synopsisSaveBusy ? tm.drama.savingSynopsis : tm.drama.saveSynopsis }}
            </button>
          </div>
        </div>
        <div class="premise-keywords-row">
          <input
            v-model="synopsisSeedKeywords"
            class="input"
            :placeholder="tm.drama.synopsisKeywordsPlaceholder"
            @keydown.enter.prevent="generateSynopsisDraft"
          />
          <button
            type="button"
            class="btn btn-sm btn-primary premise-gen-btn"
            :disabled="synopsisGenBusy || !synopsisSeedKeywords.trim() || !canGenerate"
            @click="generateSynopsisDraft"
          >
            {{ synopsisGenBusy ? tm.drama.generatingSynopsis : tm.drama.generateSynopsis }}
          </button>
        </div>
        <textarea
          v-model="dramaSynopsisText"
          class="input outline-textarea premise-textarea"
          rows="4"
          :placeholder="tm.index.projectSynopsisPlaceholder"
        />
        <p class="outline-hint">{{ tm.drama.projectSynopsisHint }}</p>
      </div>
    </div>

    <!-- Chapter / Episode List -->
    <div class="ep-list-head">
      <div class="section-label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <rect x="2" y="2" width="20" height="20" rx="2.5"/>
          <line x1="7" y1="8" x2="7" y2="16"/>
          <line x1="10" y1="8" x2="10" y2="16"/>
          <line x1="13" y1="8" x2="13" y2="16"/>
          <line x1="16" y1="8" x2="16" y2="16"/>
        </svg>
        {{ isNovel ? tm.novel.chapterList : tm.drama.episodeList }}
      </div>
      <div class="ep-filter-bar">
        <button
          v-for="opt in episodeFilterOptions"
          :key="opt.value"
          type="button"
          :class="['ep-filter-btn', episodeFilter === opt.value && 'active']"
          @click="setEpisodeFilter(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <div class="ep-grid">
      <template v-for="(block, i) in chapterListBlocks" :key="block.key">
        <div v-if="block.type === 'volume' && isNovel" class="vol-section-head">
          <span class="vol-section-title">{{ block.volume.label }}</span>
          <span class="vol-section-range">{{ tx(tm.novel.volumeChapterRange, { start: block.volume.start, end: block.volume.end }) }}</span>
        </div>
        <div
          v-else
          class="card ep-card"
          :style="{ animationDelay: `${Math.min(i, 8) * 0.04}s` }"
          @click="goToUnit(block.ep)"
        >
          <div class="ep-number">
            {{ isNovel
              ? tx(tm.novel.chapterNumberBadge, { n: block.ep.episode_number || block.ep.episodeNumber })
              : tx(tm.drama.episodeNumberBadge, { n: String(block.ep.episode_number || block.ep.episodeNumber).padStart(2, '0') })
            }}
          </div>
          <div class="ep-body">
            <span class="ep-title">{{ isNovel ? novelChapterTitle(block.ep) : block.ep.title }}</span>
            <div class="ep-status">
              <span :class="['status-dot', hasContent(block.ep) ? 'dot-ready' : 'dot-pending']"></span>
              <span class="status-text">{{ hasContent(block.ep) ? (isNovel ? tm.novel.chapterReady : tm.drama.scriptReady) : (isNovel ? tm.novel.chapterPending : tm.drama.scriptPending) }}</span>
              <span v-if="isNovel" class="ep-word-count">{{ tx(tm.novel.wordCount, { n: formatNovelWords(chapterCharCount(block.ep)) }) }}</span>
              <template v-else>
                <span class="ep-pipeline-tags" @click.stop>
                  <template v-for="(opt, pi) in PRODUCTION_PIPELINE_OPTIONS" :key="opt.value">
                    <span v-if="pi > 0" class="ep-pipeline-sep">·</span>
                    <button
                      type="button"
                      class="ep-pipeline-link"
                      :title="`进入${pipelineLabel(opt.value)}工作台`"
                      @click="goToUnit(block.ep, opt.value)"
                    >
                      {{ pipelineLabel(opt.value) }}出片
                    </button>
                  </template>
                </span>
                <span v-if="block.ep.duration" class="ep-duration">{{ tx(tm.common.durationSec, { n: block.ep.duration }) }}</span>
              </template>
            </div>
          </div>
          <div class="ep-arrow">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        </div>
      </template>

      <div v-if="episodeListBusy" class="card ep-empty">
        <p>{{ isNovel ? tm.novel.listLoading : tm.drama.listLoading }}</p>
      </div>
      <div v-else-if="!episodeRows.length" class="card ep-empty">
        <div class="ep-empty-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="16"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
        </div>
        <p>{{ episodeEmptyHint }}</p>
      </div>
    </div>

    <div v-if="episodeStats.total > 0" class="ep-pagination">
      <label class="ep-page-size">
        <span class="ep-page-size-label">{{ isNovel ? tm.novel.pageSize : tm.drama.pageSize }}</span>
        <select
          class="input ep-page-size-select"
          :value="episodePageSize"
          :disabled="episodeListBusy"
          @change="setEpisodePageSize(Number(($event.target).value))"
        >
          <option v-for="n in EPISODE_PAGE_SIZE_OPTIONS" :key="n" :value="n">{{ n }} {{ isNovel ? tm.novel.pageSizeUnit : tm.drama.pageSizeUnit }}</option>
        </select>
      </label>
      <button type="button" class="btn btn-sm" :disabled="episodePage <= 1 || episodeListBusy" @click="setEpisodePage(episodePage - 1)">
        {{ isNovel ? tm.novel.pagePrev : tm.drama.pagePrev }}
      </button>
      <span class="ep-page-meta">
        <span>{{ tx(isNovel ? tm.novel.pageIdx : tm.drama.pageIdx, { a: episodePage, b: episodePagination.total_pages }) }}</span>
        <span class="ep-page-range">{{ episodePageRangeLabel }}</span>
      </span>
      <div class="ep-jump">
        <input
          v-model="episodeJumpInput"
          type="number"
          min="1"
          class="input ep-jump-input"
          :placeholder="isNovel ? tm.novel.jumpChapterPh : tm.drama.jumpEpisodePh"
          @keydown.enter.prevent="jumpToEpisodeNumber"
        />
        <button type="button" class="btn btn-sm" :disabled="episodeListBusy" @click="jumpToEpisodeNumber">
          {{ isNovel ? tm.novel.jumpChapter : tm.drama.jumpEpisode }}
        </button>
      </div>
      <button type="button" class="btn btn-sm" :disabled="episodePage >= episodePagination.total_pages || episodeListBusy" @click="setEpisodePage(episodePage + 1)">
        {{ isNovel ? tm.novel.pageNext : tm.drama.pageNext }}
      </button>
    </div>

    <div v-if="createChapterSheetOpen" class="dialog-mask" @click.self="createChapterSheetOpen = false">
      <div class="card dialog chapter-dialog">
        <div class="dialog-head">
          <div class="dialog-head-copy">
            <div class="dialog-title">{{ tm.novel.newChapterTitle }}</div>
          </div>
          <button type="button" class="modal-close-btn" :aria-label="tm.common.closeAria" @click="createChapterSheetOpen = false">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <label class="field">
          <span class="field-label">{{ tm.novel.chapterFieldTitle }}</span>
          <input v-model="createChapterTitle" class="input" :placeholder="tm.novel.chapterTitlePlaceholder" />
        </label>
        <div class="dialog-foot">
          <button class="btn" @click="createChapterSheetOpen = false">{{ tm.index.cancel }}</button>
          <button class="btn btn-primary" :disabled="chapterCreateBusy" @click="submitNewChapter">
            {{ chapterCreateBusy ? tm.novel.creatingChapter : tm.novel.createChapterSubmit }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="createEpisodeSheetOpen" class="dialog-mask" @click.self="createEpisodeSheetOpen = false">
      <div class="card dialog">
        <div class="dialog-head">
          <div class="dialog-head-copy">
            <div class="dialog-kicker">{{ tm.drama.newEpisodeKicker }}</div>
            <div class="dialog-title-row">
              <div class="dialog-title">{{ tm.drama.newEpisodeTitle }}</div>
              <span class="dialog-badge">{{ tm.drama.configLockedBadge }}</span>
            </div>
            <div class="dialog-sub">{{ tm.drama.newEpisodeIntro }}</div>
          </div>
          <div class="dialog-head-trailing">
            <button type="button" class="back-btn" @click="createEpisodeSheetOpen = false">{{ tm.index.cancel }}</button>
            <button type="button" class="modal-close-btn" :aria-label="tm.common.closeAria" @click="createEpisodeSheetOpen = false">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="dialog-summary">
          <div class="summary-chip">{{ tx(tm.drama.newEpisodeSummaryImage, { n: imageConfigRows.length }) }}</div>
          <div class="summary-chip">{{ tx(tm.drama.newEpisodeSummaryVideo, { n: videoConfigRows.length }) }}</div>
          <div class="summary-chip">{{ tx(tm.drama.newEpisodeSummaryAudio, { n: audioConfigRows.length }) }}</div>
        </div>
        <div class="dialog-body">
          <div class="dialog-section">
            <div class="dialog-section-head">
              <span class="dialog-section-title">{{ tm.drama.sectionBasics }}</span>
              <span class="dialog-section-copy">{{ tm.drama.sectionBasicsCopy }}</span>
            </div>
            <label class="field">
              <span class="field-label">出片方式</span>
              <div class="pipeline-picker">
                <label
                  v-for="opt in PRODUCTION_PIPELINE_OPTIONS"
                  :key="opt.value"
                  :class="['pipeline-option', createEpisodePipeline === opt.value && 'active']"
                >
                  <input v-model="createEpisodePipeline" type="radio" :value="opt.value" />
                  <span class="pipeline-option-title">{{ opt.label }}</span>
                  <span class="pipeline-option-desc">{{ opt.desc }}</span>
                </label>
              </div>
              <span class="field-hint">同一集可同时制作 AI 视频与静帧动画；此处选择默认进入的工作台</span>
            </label>
            <label class="field">
              <span class="field-label">{{ tm.drama.episodeFieldTitle }}</span>
              <input v-model="createEpisodeTitle" class="input" :placeholder="tm.drama.episodeTitlePlaceholder" />
              <span class="field-hint">{{ tx(tm.drama.episodeTitleHint, { example: 3 }) }}</span>
            </label>
          </div>

          <div class="dialog-section">
            <div class="dialog-section-head">
              <span class="dialog-section-title">{{ tm.drama.sectionGeneration }}</span>
              <span class="dialog-section-copy">{{ tm.drama.sectionGenerationCopy }}</span>
            </div>
            <div class="config-grid">
              <label class="config-card">
                <span class="config-card-kicker">{{ tm.settings.modelPrefKickerImage }}</span>
                <span class="field-label">{{ tm.settings.imageModel }}</span>
                <BaseSelect v-model="episodeImageCfgId" :options="imageConfigSelectOptions" :placeholder="tm.settings.pickImage" searchable />
              </label>
              <label class="config-card">
                <span class="config-card-kicker">{{ tm.settings.modelPrefKickerVideo }}</span>
                <span class="field-label">{{ tm.settings.videoModel }}</span>
                <BaseSelect v-model="episodeVideoCfgId" :options="videoConfigSelectOptions" :placeholder="tm.settings.pickVideo" searchable />
              </label>
              <label class="config-card">
                <span class="config-card-kicker">{{ tm.settings.modelPrefKickerAudio }}</span>
                <span class="field-label">{{ tm.settings.audioModel }}</span>
                <BaseSelect v-model="episodeAudioCfgId" :options="audioConfigSelectOptions" :placeholder="tm.settings.pickAudio" searchable />
              </label>
            </div>
          </div>
        </div>
        <div class="dialog-foot">
          <div class="dialog-foot-copy">{{ tm.drama.newEpisodeFootNote }}</div>
          <button class="btn btn-primary" :disabled="episodeCreateBusy || !episodeCreateReady" @click="submitNewEpisode">
            {{ episodeCreateBusy ? tm.drama.creatingEpisode : tm.drama.createEpisodeSubmit }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="batchScopeSheetOpen" class="dialog-mask batch-mask" @click.self="batchScopeSheetOpen = false">
      <div class="card dialog batch-scope-dialog">
        <div class="dialog-head">
          <div class="dialog-head-copy">
            <div class="dialog-kicker">{{ batchScopePack.batchConfirmKicker }}</div>
            <div class="dialog-title batch-confirm-title">{{ isNovel ? tm.novel.digitalWriter : tm.drama.digitalDirector }}</div>
            <div class="dialog-sub">{{ batchScopePack.batchScopeTitle }}</div>
          </div>
          <button type="button" class="modal-close-btn" :aria-label="tm.common.closeAria" @click="batchScopeSheetOpen = false">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="batch-scope-options">
          <div v-if="!isNovel" class="batch-scope-pipeline">
            <span class="field-label">出片方式</span>
            <div class="pipeline-picker">
              <label
                v-for="opt in PRODUCTION_PIPELINE_OPTIONS"
                :key="opt.value"
                :class="['pipeline-option', batchScopeDraft.productionPipeline === opt.value && 'active']"
              >
                <input v-model="batchScopeDraft.productionPipeline" type="radio" :value="opt.value" />
                <span class="pipeline-option-title">{{ opt.label }}</span>
                <span class="pipeline-option-desc">{{ opt.desc }}</span>
              </label>
            </div>
            <span class="field-hint">批量任务会写入各集默认工作台，并按所选方式生成成片</span>
            <div class="batch-pipeline-steps">
              <span class="field-label">完整流水线（每集）</span>
              <ol class="batch-pipeline-steps-list">
                <li v-for="(step, idx) in DIGITAL_DIRECTOR_PIPELINE_STEPS" :key="step.key">
                  <span class="batch-pipeline-step-num">{{ String(idx + 1).padStart(2, '0') }}</span>
                  <span>{{ step.label }}</span>
                </li>
              </ol>
            </div>
          </div>
          <label class="batch-scope-option" :class="{ active: batchScopeDraft.mode === 'remaining' }">
            <input v-model="batchScopeDraft.mode" type="radio" value="remaining" class="batch-scope-radio">
            <span class="batch-scope-option-copy">
              <span class="batch-scope-option-title">{{ batchScopePack.batchScopeModeRemaining }}</span>
              <span class="batch-scope-option-desc">{{ tx(batchScopePack.batchScopeModeRemainingDesc, { n: episodeStats.pending }) }}</span>
            </span>
          </label>
          <label class="batch-scope-option" :class="{ active: batchScopeDraft.mode === 'all' }">
            <input v-model="batchScopeDraft.mode" type="radio" value="all" class="batch-scope-radio">
            <span class="batch-scope-option-copy">
              <span class="batch-scope-option-title">{{ batchScopePack.batchScopeModeAll }}</span>
              <span class="batch-scope-option-desc">{{ tx(batchScopePack.batchScopeModeAllDesc, { n: episodeStats.total }) }}</span>
            </span>
          </label>
          <label class="batch-scope-option" :class="{ active: batchScopeDraft.mode === 'range' }">
            <input v-model="batchScopeDraft.mode" type="radio" value="range" class="batch-scope-radio">
            <span class="batch-scope-option-copy">
              <span class="batch-scope-option-title">{{ batchScopePack.batchScopeModeRange }}</span>
              <span class="batch-scope-option-desc">{{ batchScopePack.batchScopeModeRangeDesc }}</span>
            </span>
          </label>
          <div v-if="batchScopeDraft.mode === 'range'" class="batch-scope-fields">
            <label class="field">
              <span class="field-label">{{ batchScopePack.batchScopeFrom }}</span>
              <input v-model.number="batchScopeDraft.fromChapter" type="number" min="1" :max="episodeStats.total" class="input">
            </label>
            <label class="field">
              <span class="field-label">{{ batchScopePack.batchScopeTo }}</span>
              <input v-model.number="batchScopeDraft.toChapter" type="number" min="1" :max="episodeStats.total" class="input">
            </label>
          </div>
          <label class="batch-scope-option" :class="{ active: batchScopeDraft.mode === 'chapters' }">
            <input v-model="batchScopeDraft.mode" type="radio" value="chapters" class="batch-scope-radio">
            <span class="batch-scope-option-copy">
              <span class="batch-scope-option-title">{{ batchScopePack.batchScopeModeChapters }}</span>
              <span class="batch-scope-option-desc">{{ batchScopePack.batchScopeModeChaptersDesc }}</span>
            </span>
          </label>
          <div v-if="batchScopeDraft.mode === 'chapters'" class="batch-scope-fields">
            <label class="field">
              <span class="field-label">{{ batchScopePack.batchScopeChapterNumbers }}</span>
              <input
                v-model="batchScopeDraft.chapterNumbersText"
                type="text"
                class="input"
                :placeholder="batchScopePack.batchScopeChapterNumbersPh"
              >
            </label>
          </div>
        </div>
        <div class="dialog-foot batch-confirm-foot">
          <button type="button" class="btn" @click="batchScopeSheetOpen = false">{{ tm.index.cancel }}</button>
          <button type="button" class="btn btn-primary btn-batch-primary" @click="proceedBatchScope">
            {{ batchScopePack.batchScopeNext }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="batchConfirmSheetOpen" class="dialog-mask batch-mask" @click.self="batchConfirmSheetOpen = false">
      <div class="card dialog batch-confirm-dialog">
        <div class="dialog-head">
          <div class="dialog-head-copy">
            <div class="dialog-kicker">{{ isNovel ? tm.novel.batchConfirmKicker : tm.drama.batchConfirmKicker }}</div>
            <div class="dialog-title batch-confirm-title">{{ isNovel ? tm.novel.digitalWriter : tm.drama.digitalDirector }}</div>
            <div class="dialog-sub">{{ batchConfirmMessage }}</div>
          </div>
          <button type="button" class="modal-close-btn" :aria-label="tm.common.closeAria" @click="batchConfirmSheetOpen = false">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="batch-confirm-note">
          <span class="batch-confirm-chip">{{ batchConfirmCountLabel }}</span>
        </div>
        <div class="dialog-foot batch-confirm-foot">
          <button type="button" class="btn" @click="batchConfirmSheetOpen = false">{{ tm.index.cancel }}</button>
          <button type="button" class="btn btn-primary btn-batch-primary" @click="confirmBatchGenerate">
            {{ isNovel ? tm.novel.batchConfirmSubmit : tm.drama.batchConfirmSubmit }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="templatePublishSheetOpen" class="dialog-mask" @click.self="templatePublishSheetOpen = false">
      <div class="card dialog publish-dialog">
        <div class="dialog-head">
          <div class="dialog-head-copy">
            <div class="dialog-title">{{ tm.templates.publishTitle }}</div>
            <div class="dialog-sub">{{ tm.templates.publishDesc }}</div>
          </div>
          <button type="button" class="modal-close-btn" :aria-label="tm.common.closeAria" @click="templatePublishSheetOpen = false">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <label class="field">
          <span class="field-label">{{ tm.templates.publishSummary }}</span>
          <textarea v-model="templateSummaryDraft" class="input outline-textarea" rows="4" :placeholder="tm.templates.publishSummaryPlaceholder" />
        </label>
        <div class="dialog-foot batch-confirm-foot">
          <button type="button" class="btn" @click="templatePublishSheetOpen = false">{{ tm.index.cancel }}</button>
          <button v-if="dramaIsTemplate" type="button" class="btn" :disabled="templatePublishBusy" @click="unpublishTemplate">
            {{ templatePublishBusy ? tm.templates.using : tm.templates.unpublishSubmit }}
          </button>
          <button type="button" class="btn btn-primary" :disabled="templatePublishBusy" @click="publishTemplate">
            {{ templatePublishBusy ? tm.templates.using : tm.templates.publishSubmit }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="stylePickerOpen" class="dialog-mask" @click.self="stylePickerOpen = false">
      <div class="card dialog style-dialog">
        <div class="dialog-head">
          <div class="dialog-head-copy">
            <div class="dialog-kicker">{{ tm.drama.styleKicker }}</div>
            <div class="dialog-title-row">
              <div class="dialog-title">{{ tm.drama.projectVisualStyle }}</div>
            </div>
            <div class="dialog-sub">{{ tm.drama.styleDialogIntro }}</div>
          </div>
          <button type="button" class="modal-close-btn" :aria-label="tm.common.closeAria" @click="stylePickerOpen = false">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="dialog-body">
          <label class="field">
            <span class="field-label">{{ tm.drama.visualStyleField }}</span>
            <BaseSelect v-model="stylePickValue" :options="dramaStyleSelectOptions" :placeholder="tm.index.stylePlaceholder" searchable />
            <span class="field-hint">{{ tm.drama.styleCurrentPrefix }}{{ resolveDramaStyleLabel(drama?.style) || tm.drama.styleUnset }}</span>
          </label>
        </div>
        <div class="dialog-foot">
          <div class="dialog-foot-copy">{{ tm.drama.styleFootNote }}</div>
          <button class="btn btn-primary" :disabled="styleSaveBusy" @click="persistDramaStyle">
            {{ styleSaveBusy ? tm.drama.savingStyle : tm.drama.saveStyleSubmit }}
          </button>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>

<script setup>
import { toast } from 'vue-sonner'
import { aiConfigAPI, dramaAPI, episodeAPI, novelAPI, templatesAPI } from '~/composables/use-api'
import { useBatchJob } from '~/composables/use-batch-job'
import { useCreditsGate } from '~/composables/use-credits-gate'
import { useI18n, tx } from '~/composables/use-i18n'
import {
  DRAMA_STYLE_CATALOG,
  buildDramaStyleSelectOptionsFromCatalog,
  dramaStyleLabelFromCatalog,
  mergeDramaStyleCatalog,
} from '~/common/drama/dramaStyle'
import { chapterDisplayTitle } from '~/common/novel/novelChapter'
import { countNovelChars, formatNovelCharCount } from '~/common/novel/novelCharCount'
import { buildChapterListBlocks, parseVolumeRangesFromOutline } from '~/common/novel/novelVolume'
import {
  buildBatchScope,
  estimateBatchCount,
  parseChapterNumbersInput,
} from '~/common/novel/novelBatchScope'
import {
  PRODUCTION_PIPELINE_OPTIONS,
  DIGITAL_DIRECTOR_PIPELINE_STEPS,
  episodeWorkbenchPath,
  pipelineLabel,
  readEpisodeProductionPipeline,
  readEpisodeFrameMergedUrl,
} from '~/common/media/productionPipeline'

const EPISODE_PAGE_SIZE_DEFAULT = 20
const EPISODE_PAGE_SIZE_OPTIONS = [10, 20, 30, 50]
const EP_LIST_PAGE_SIZE_KEY = 'huohuo_ep_list_page_size'

const { messages: tm, init, lang } = useI18n()
const { canGenerate, guardGenerate } = useCreditsGate()

// ── 路由与项目元数据 ─────────────────────────────────────────
const route = useRoute()
const drama = ref(null)
const dramaLoadBusy = ref(true)
const dramaId = Number(route.params.id)
const isNovel = computed(() => (drama.value?.project_type || drama.value?.projectType || 'drama') === 'novel')
const episodeRows = ref([])
const episodeListBusy = ref(false)
const episodePage = ref(1)
const episodePageSize = ref(EPISODE_PAGE_SIZE_DEFAULT)
const episodeFilter = ref('all')
const episodeJumpInput = ref('')
const episodePagination = ref({ page: 1, page_size: EPISODE_PAGE_SIZE_DEFAULT, total: 0, total_pages: 1 })
const episodeStats = ref({ total: 0, written: 0, pending: 0, total_chars: 0 })
const novelStats = computed(() => ({
  total: episodeStats.value.total,
  written: episodeStats.value.written,
  totalChars: episodeStats.value.total_chars,
}))
const novelGenreLabel = computed(() => (drama.value?.genre || '').trim())

// ── 分集/章节列表分页 ───────────────────────────────────────
const episodeFilterOptions = computed(() => {
  const pack = isNovel.value ? tm.value.novel : tm.value.drama
  return [
    { value: 'all', label: pack.filterAll },
    { value: 'written', label: pack.filterReady },
    { value: 'pending', label: pack.filterPending },
  ]
})

const episodePageRangeLabel = computed(() => {
  const { total, page_size: pageSize } = episodePagination.value
  if (!total) return ''
  const size = pageSize || episodePageSize.value
  const start = (episodePage.value - 1) * size + 1
  const end = Math.min(episodePage.value * size, total)
  const pack = isNovel.value ? tm.value.novel : tm.value.drama
  return tx(pack.pageRange, { a: start, b: end, total })
})

const episodeEmptyHint = computed(() => {
  const pack = isNovel.value ? tm.value.novel : tm.value.drama
  if (episodeFilter.value === 'pending') return pack.emptyFilterPending
  if (episodeFilter.value === 'written') return pack.emptyFilterWritten
  return isNovel.value ? tm.value.novel.emptyChaptersHint : tm.value.drama.emptyEpisodesHint
})

function episodeListStorageKey(suffix) {
  return `huohuo_drama_${dramaId}_ep_${suffix}`
}

function formatNovelWords(n) {
  return formatNovelCharCount(n, lang.value)
}

// ── 小说设定（梗概 / 大纲）与模板发布 ───────────────────────
const createEpisodeSheetOpen = ref(false)
const createChapterSheetOpen = ref(false)
const chapterCreateBusy = ref(false)
const createChapterTitle = ref('')
const novelPremiseText = ref('')
const dramaSynopsisText = ref('')
const synopsisSaveBusy = ref(false)
const synopsisSeedKeywords = ref('')
const synopsisGenBusy = ref(false)
const premiseSeedKeywords = ref('')
const premiseSaveBusy = ref(false)
const premiseGenBusy = ref(false)
const novelOutlineText = ref('')
const outlineSaveBusy = ref(false)
const outlineGenBusy = ref(false)

const outlineVolumes = computed(() => {
  if (!isNovel.value || !novelOutlineText.value.trim()) return []
  return parseVolumeRangesFromOutline(novelOutlineText.value, episodeStats.value.total || 0)
})

const chapterListBlocks = computed(() => {
  const eps = episodeRows.value
  if (!eps.length) return []
  if (!isNovel.value) {
    return eps.map(ep => ({ type: 'chapter', key: `ep-${ep.id}`, ep }))
  }
  return buildChapterListBlocks(eps, outlineVolumes.value)
})

const episodeCreateBusy = ref(false)
const stylePickerOpen = ref(false)
const styleSaveBusy = ref(false)
const stylePickValue = ref('')
const createEpisodeTitle = ref('')
const createEpisodePipeline = ref('ai_video')
const titleDraft = ref('')
const titleSaved = ref('')
const titleSaveBusy = ref(false)
const imageConfigRows = ref([])
const videoConfigRows = ref([])
const audioConfigRows = ref([])
const episodeImageCfgId = ref(null)
const episodeVideoCfgId = ref(null)
const episodeAudioCfgId = ref(null)
const dramaStyleCatalog = ref(DRAMA_STYLE_CATALOG)
const templatePublishSheetOpen = ref(false)
const templateSummaryDraft = ref('')
const templatePublishBusy = ref(false)
const dramaIsTemplate = computed(() => !!(drama.value?.is_template || drama.value?.isTemplate))
const titleEditPlaceholder = computed(() => tm.value.common.titlePlaceholder)

// ── 批量撰写（数字作家 / 数字导演）──────────────────────────
const batchConfirmSheetOpen = ref(false)
const batchConfirmMessage = ref('')
const batchScopeSheetOpen = ref(false)
const batchScopeDraft = ref({
  mode: 'remaining',
  fromChapter: 1,
  toChapter: 1,
  chapterNumbersText: '',
  productionPipeline: 'ai_video',
})
const queuedBatchScope = ref(null)
const batchUnitTotal = ref(0)
const batchJob = useBatchJob()
const batchRunningOnPage = computed(() => batchJob.isRunningForDrama(dramaId))

const batchScopePack = computed(() => (isNovel.value ? tm.value.novel : tm.value.drama))

const pendingUnitCount = computed(() => episodeStats.value.pending)

const batchConfirmCountLabel = computed(() => {
  const pack = batchScopePack.value
  const key = queuedBatchScope.value?.mode === 'remaining'
    ? pack.batchConfirmCount
    : (pack.batchConfirmUnitCount || pack.batchConfirmCount)
  return tx(key, { n: batchUnitTotal.value || pendingUnitCount.value })
})

function hasScript(ep) { return !!(ep.formatted_script || ep.formattedScript) }
function hasMergedVideo(ep) {
  const pipeline = readEpisodeProductionPipeline(ep)
  if (pipeline === 'frame_slideshow') {
    return !!readEpisodeFrameMergedUrl(ep)
  }
  return !!(ep.video_url || ep.videoUrl || '').trim()
}
function hasContent(ep) {
  if (isNovel.value) return !!(ep.has_content ?? (ep.content || '').trim())
  return hasMergedVideo(ep)
}
function novelChapterTitle(ep) {
  return chapterDisplayTitle(ep)
}
function chapterCharCount(ep) {
  if (ep.content_char_count != null) return Number(ep.content_char_count) || 0
  return countNovelChars(ep.content)
}

async function fetchEpisodePage() {
  try {
    episodeListBusy.value = true
    const res = await dramaAPI.listEpisodes(dramaId, {
      page: episodePage.value,
      page_size: episodePageSize.value,
      filter: episodeFilter.value,
    })
    episodeRows.value = res.items || []
    episodePagination.value = res.pagination || episodePagination.value
    if (res.stats) episodeStats.value = res.stats
    if (episodePage.value > episodePagination.value.total_pages) {
      episodePage.value = Math.max(1, episodePagination.value.total_pages)
      if (episodePage.value !== res.pagination?.page) {
        await fetchEpisodePage()
      }
    }
  } catch (e) {
    toast.error(e.message)
  } finally {
    episodeListBusy.value = false
  }
}

async function alignChapterTitlesToOutline() {
  if (!novelOutlineText.value.trim()) return
  try {
    await novelAPI.syncChapterTitles(dramaId)
    await fetchEpisodePage()
  } catch {
    // 忽略同步失败，列表仍显示已有标题
  }
}

function setEpisodePage(page) {
  const next = Math.max(1, Math.min(page, episodePagination.value.total_pages || 1))
  if (next === episodePage.value) return
  episodePage.value = next
  if (import.meta.client) sessionStorage.setItem(episodeListStorageKey('page'), String(next))
  fetchEpisodePage()
}

function setEpisodePageSize(size) {
  if (!EPISODE_PAGE_SIZE_OPTIONS.includes(size) || size === episodePageSize.value) return
  const firstItem = (episodePage.value - 1) * episodePageSize.value + 1
  episodePageSize.value = size
  episodePage.value = Math.max(1, Math.ceil(firstItem / size))
  if (import.meta.client) {
    localStorage.setItem(EP_LIST_PAGE_SIZE_KEY, String(size))
    sessionStorage.setItem(episodeListStorageKey('page'), String(episodePage.value))
  }
  fetchEpisodePage()
}

function setEpisodeFilter(filter) {
  if (filter === episodeFilter.value) return
  episodeFilter.value = filter
  episodePage.value = 1
  if (import.meta.client) {
    sessionStorage.setItem(episodeListStorageKey('filter'), filter)
    sessionStorage.setItem(episodeListStorageKey('page'), '1')
  }
  fetchEpisodePage()
}

function jumpToEpisodeNumber() {
  const num = Number(episodeJumpInput.value)
  if (!Number.isFinite(num) || num < 1 || num > episodeStats.value.total) {
    toast.error(isNovel.value ? tm.value.novel.jumpChapterInvalid : tm.value.drama.jumpEpisodeInvalid)
    return
  }
  const page = Math.ceil(num / episodePageSize.value)
  episodeFilter.value = 'all'
  if (import.meta.client) {
    sessionStorage.setItem(episodeListStorageKey('filter'), 'all')
    sessionStorage.setItem(episodeListStorageKey('page'), String(page))
  }
  episodePage.value = page
  episodeJumpInput.value = ''
  fetchEpisodePage()
}

function goToUnit(ep, pipeline) {
  const num = ep.episode_number || ep.episodeNumber
  if (import.meta.client) {
    sessionStorage.setItem(episodeListStorageKey('page'), String(episodePage.value))
    sessionStorage.setItem(episodeListStorageKey('filter'), episodeFilter.value)
  }
  if (isNovel.value) navigateTo(`/drama/${dramaId}/chapter/${num}`)
  else navigateTo(episodeWorkbenchPath(dramaId, num, pipeline || readEpisodeProductionPipeline(ep)))
}
function resolveDramaStyleLabel(value) { return dramaStyleLabelFromCatalog(dramaStyleCatalog.value, value) }

function formatProviderConfigLabel(config) {
  if (!config) return ''
  let modelName = ''
  try { const m = JSON.parse(config.model || '[]'); modelName = Array.isArray(m) ? (m[0] || '') : (m || '') } catch { modelName = config.model || '' }
  const credit = Number(config.credit_cost || 0)
  const core = modelName ? `${modelName} (${config.provider})` : `${config.name} (${config.provider})`
  return `${core} · ${credit} ${tm.value.settings.creditsPerRun}`
}

const imageConfigSelectOptions = computed(() => imageConfigRows.value.map(c => ({ label: formatProviderConfigLabel(c), value: c.id })))
const videoConfigSelectOptions = computed(() => videoConfigRows.value.map(c => ({ label: formatProviderConfigLabel(c), value: c.id })))
const audioConfigSelectOptions = computed(() => audioConfigRows.value.map(c => ({ label: formatProviderConfigLabel(c), value: c.id })))
const episodeCreateReady = computed(() => !!(episodeImageCfgId.value && episodeVideoCfgId.value && episodeAudioCfgId.value))
const dramaStyleSelectOptions = computed(() => buildDramaStyleSelectOptionsFromCatalog(dramaStyleCatalog.value))

function parseDramaMetadata(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function applyNovelFieldsFromDrama(d) {
  if (!d) return
  const meta = parseDramaMetadata(d.metadata)
  novelPremiseText.value = d.novel_premise || meta.premise || d.description || ''
  const outline = d.novel_outline || meta.outline || ''
  if (outline.trim()) novelOutlineText.value = outline
}

async function fetchDramaDetail() {
  const initial = !drama.value
  try {
    if (initial) dramaLoadBusy.value = true
    drama.value = await dramaAPI.get(dramaId, { include_episodes: false, include_assets: false })
    if (drama.value) {
      const t = drama.value.title || ''
      titleDraft.value = t
      titleSaved.value = t
    }
    if (drama.value?.episode_stats) episodeStats.value = drama.value.episode_stats
    if (isNovel.value) {
      applyNovelFieldsFromDrama(drama.value)
    } else {
      dramaSynopsisText.value = drama.value?.description || ''
    }
  } catch (e) {
    toast.error(e.message)
  } finally {
    if (initial) dramaLoadBusy.value = false
  }
  void fetchDramaAssets()
  void loadDramaDetailFollowups()
}

async function loadDramaDetailFollowups() {
  if (isNovel.value) {
    await fetchNovelMeta()
    if (novelOutlineText.value.trim()) {
      try {
        await novelAPI.syncChapterTitles(dramaId)
      } catch {
        // 忽略同步失败
      }
    }
  }
  await fetchEpisodePage()
}

async function fetchDramaAssets() {
  try {
    const full = await dramaAPI.get(dramaId, { include_episodes: false })
    if (!full || !drama.value) return
    drama.value.characters = full.characters
    drama.value.scenes = full.scenes
    drama.value.props = full.props
  } catch {
    // 角色/场景统计非首屏必需
  }
}

async function fetchNovelMeta() {
  applyNovelFieldsFromDrama(drama.value)
  try {
    const meta = await novelAPI.getMeta(dramaId)
    if (meta.premise?.trim()) novelPremiseText.value = meta.premise
    else if (!novelPremiseText.value.trim()) novelPremiseText.value = meta.premise || drama.value?.description || ''
    if (meta.outline?.trim()) novelOutlineText.value = meta.outline
    if (drama.value) {
      drama.value.novel_premise = novelPremiseText.value
      drama.value.novel_outline = novelOutlineText.value
    }
  } catch {
    applyNovelFieldsFromDrama(drama.value)
  }
}

async function persistPremiseDraft() {
  try {
    premiseSaveBusy.value = true
    await novelAPI.saveMeta(dramaId, { premise: novelPremiseText.value })
    if (drama.value) drama.value.description = novelPremiseText.value
    toast.success(tm.value.novel.toastPremiseSaved)
  } catch (e) {
    toast.error(e.message)
  } finally {
    premiseSaveBusy.value = false
  }
}

async function persistSynopsisDraft() {
  const text = dramaSynopsisText.value.trim()
  try {
    synopsisSaveBusy.value = true
    await dramaAPI.update(dramaId, { description: text || null })
    if (drama.value) drama.value.description = text || null
    toast.success(tm.value.drama.toastSynopsisSaved)
  } catch (e) {
    toast.error(e.message)
  } finally {
    synopsisSaveBusy.value = false
  }
}

async function generateSynopsisDraft() {
  if (!guardGenerate()) return
  const keywords = synopsisSeedKeywords.value.trim()
  if (!keywords) return
  try {
    synopsisGenBusy.value = true
    const { synopsis } = await dramaAPI.generateSynopsis({
      keywords,
      title: drama.value?.title || undefined,
      style: drama.value?.style ? resolveDramaStyleLabel(drama.value.style) : undefined,
      total_episodes: episodeStats.value.total || undefined,
    })
    dramaSynopsisText.value = synopsis || ''
  } catch (e) {
    toast.error(e.message)
  } finally {
    synopsisGenBusy.value = false
  }
}

async function generatePremiseDraft() {
  if (!guardGenerate()) return
  const keywords = premiseSeedKeywords.value.trim()
  if (!keywords) return
  try {
    premiseGenBusy.value = true
    const { premise } = await novelAPI.generatePremise({
      keywords,
      title: drama.value?.title || undefined,
      genre: drama.value?.genre || undefined,
      total_chapters: episodeStats.value.total || undefined,
    })
    novelPremiseText.value = premise || ''
  } catch (e) {
    toast.error(e.message)
  } finally {
    premiseGenBusy.value = false
  }
}

function revealTemplatePublishSheet() {
  templateSummaryDraft.value = (
    drama.value?.template_summary
    || drama.value?.templateSummary
    || drama.value?.description
    || novelPremiseText.value
    || dramaSynopsisText.value
    || ''
  ).trim()
  templatePublishSheetOpen.value = true
}

async function publishTemplate() {
  if (!drama.value?.id) return
  templatePublishBusy.value = true
  try {
    await templatesAPI.publish(drama.value.id, { template_summary: templateSummaryDraft.value })
    drama.value.is_template = true
    drama.value.template_summary = templateSummaryDraft.value
    toast.success(tm.value.templates.toastPublished)
    templatePublishSheetOpen.value = false
  } catch (e) {
    toast.error(e.message)
  } finally {
    templatePublishBusy.value = false
  }
}

async function unpublishTemplate() {
  if (!drama.value?.id) return
  templatePublishBusy.value = true
  try {
    await templatesAPI.unpublish(drama.value.id)
    drama.value.is_template = false
    toast.success(tm.value.templates.toastUnpublished)
    templatePublishSheetOpen.value = false
  } catch (e) {
    toast.error(e.message)
  } finally {
    templatePublishBusy.value = false
  }
}

function revealCreateChapterSheet() {
  createChapterTitle.value = ''
  createChapterSheetOpen.value = true
}

async function submitNewChapter() {
  try {
    chapterCreateBusy.value = true
    await novelAPI.createChapter(dramaId, { title: createChapterTitle.value || undefined })
    toast.success(tm.value.novel.toastChapterAdded)
    createChapterSheetOpen.value = false
    episodeFilter.value = 'all'
    await fetchDramaDetail()
    const lastPage = Math.max(1, Math.ceil(episodeStats.value.total / episodePageSize.value))
    if (lastPage !== episodePage.value) setEpisodePage(lastPage)
  } catch (e) {
    toast.error(e.message)
  } finally {
    chapterCreateBusy.value = false
  }
}

async function persistOutlineDraft() {
  try {
    outlineSaveBusy.value = true
    await novelAPI.saveMeta(dramaId, { outline: novelOutlineText.value })
    await alignChapterTitlesToOutline()
    toast.success(tm.value.novel.toastOutlineSaved)
  } catch (e) {
    toast.error(e.message)
  } finally {
    outlineSaveBusy.value = false
  }
}

async function generateOutlineDraft() {
  if (!guardGenerate()) return
  if (!novelPremiseText.value.trim()) {
    toast.error(tm.value.novel.premiseRequiredForOutline)
    return
  }
  try {
    if (novelPremiseText.value.trim()) {
      await novelAPI.saveMeta(dramaId, { premise: novelPremiseText.value })
    }
    outlineGenBusy.value = true
    const res = await novelAPI.generateOutline(dramaId, { premise: novelPremiseText.value })
    novelOutlineText.value = res.outline || ''
    await alignChapterTitlesToOutline()
    toast.success(tm.value.novel.toastOutlineGenerated)
  } catch (e) {
    toast.error(e.message)
  } finally {
    outlineGenBusy.value = false
  }
}

async function reloadStyleCatalog() {
  try {
    const rows = await dramaAPI.styles()
    dramaStyleCatalog.value = mergeDramaStyleCatalog(rows)
  } catch {
    dramaStyleCatalog.value = DRAMA_STYLE_CATALOG
  }
}

async function reloadEpisodeAiConfigs() {
  try {
    const [imgs, vids, auds, saved] = await Promise.all([
      aiConfigAPI.list('image'),
      aiConfigAPI.list('video'),
      aiConfigAPI.list('audio'),
      aiConfigAPI.getUserDefaultModels().catch(() => null),
    ])
    imageConfigRows.value = imgs || []
    videoConfigRows.value = vids || []
    audioConfigRows.value = auds || []
    const activeImages = imageConfigRows.value.filter(c => c.is_active)
    const activeVideos = videoConfigRows.value.filter(c => c.is_active)
    const activeAudios = audioConfigRows.value.filter(c => c.is_active)
    const savedByType = new Map((saved?.items || []).map(i => [i.service_type, i.config_id]))
    if (!episodeImageCfgId.value && activeImages.length) {
      const preferred = Number(savedByType.get('image') || localStorage.getItem('huohuo_preferred_image_config_id') || 0)
      episodeImageCfgId.value = activeImages.some(c => c.id === preferred) ? preferred : null
    }
    if (!episodeVideoCfgId.value && activeVideos.length) {
      const preferred = Number(savedByType.get('video') || localStorage.getItem('huohuo_preferred_video_config_id') || 0)
      episodeVideoCfgId.value = activeVideos.some(c => c.id === preferred) ? preferred : null
    }
    if (!episodeAudioCfgId.value && activeAudios.length) {
      const preferred = Number(savedByType.get('audio') || localStorage.getItem('huohuo_preferred_audio_config_id') || 0)
      episodeAudioCfgId.value = activeAudios.some(c => c.id === preferred) ? preferred : null
    }
  } catch (e) {
    toast.error(e.message)
  }
}

function revealCreateEpisodeSheet() {
  createEpisodeTitle.value = ''
  createEpisodePipeline.value = 'ai_video'
  createEpisodeSheetOpen.value = true
  void reloadEpisodeAiConfigs()
}

function revealStylePicker() {
  stylePickValue.value = String(drama.value?.style || '')
  stylePickerOpen.value = true
  void reloadStyleCatalog()
}

async function persistDramaStyle() {
  if (!drama.value?.id) return
  try {
    styleSaveBusy.value = true
    await dramaAPI.update(drama.value.id, { style: stylePickValue.value || null })
    if (drama.value) drama.value.style = stylePickValue.value || null
    stylePickerOpen.value = false
    toast.success(tm.value.drama.toastStyleUpdated)
  } catch (e) {
    toast.error(e.message)
  } finally {
    styleSaveBusy.value = false
  }
}

async function commitTitleEdit() {
  if (!drama.value?.id || titleSaveBusy.value) return
  const next = titleDraft.value.trim()
  if (!next) {
    titleDraft.value = titleSaved.value
    toast.error(tm.value.drama.titleEmpty)
    return
  }
  if (next === titleSaved.value) return
  titleSaveBusy.value = true
  try {
    await dramaAPI.update(drama.value.id, { title: next })
    if (drama.value) drama.value.title = next
    titleSaved.value = next
    toast.success(tm.value.drama.toastTitleSaved)
  } catch (e) {
    toast.error(e.message)
    titleDraft.value = titleSaved.value
  } finally {
    titleSaveBusy.value = false
  }
}

function revealBatchScopeSheet() {
  if (batchRunningOnPage.value) {
    batchJob.openPanel()
    return
  }
  if (!guardGenerate()) return
  if (!episodeStats.value.total) return

  if (isNovel.value && !novelPremiseText.value.trim() && !novelOutlineText.value.trim()) {
    toast.error(tm.value.novel.batchNeedPremise)
    return
  }

  const total = episodeStats.value.total
  batchScopeDraft.value = {
    mode: episodeStats.value.pending > 0 ? 'remaining' : 'all',
    fromChapter: 1,
    toChapter: total,
    chapterNumbersText: '',
    productionPipeline: 'ai_video',
  }
  batchScopeSheetOpen.value = true
}

function proceedBatchScope() {
  const form = batchScopeDraft.value
  const stats = episodeStats.value
  const total = stats.total
  const pack = batchScopePack.value

  if (form.mode === 'range') {
    const from = Math.floor(form.fromChapter) || 1
    const to = Math.floor(form.toChapter) || from
    if (from < 1 || to < from || from > total || to > total) {
      toast.error(tx(pack.batchScopeInvalidRange, { max: total }))
      return
    }
    batchScopeDraft.value = { ...form, fromChapter: from, toChapter: to }
  }

  if (form.mode === 'chapters') {
    const nums = parseChapterNumbersInput(form.chapterNumbersText, total)
    if (!nums.length) {
      toast.error(pack.batchScopeInvalidChapters)
      return
    }
  }

  const count = estimateBatchCount(batchScopeDraft.value, stats)
  if (!count) {
    toast.info(pack.batchScopeNoTargets)
    return
  }

  queuedBatchScope.value = buildBatchScope(batchScopeDraft.value)
  batchUnitTotal.value = count
  batchScopeSheetOpen.value = false

  const f = batchScopeDraft.value
  if (f.mode === 'all') {
    batchConfirmMessage.value = tx(pack.batchConfirmAll, { n: count })
  } else if (f.mode === 'range') {
    batchConfirmMessage.value = tx(pack.batchConfirmRange, {
      from: f.fromChapter,
      to: f.toChapter,
      n: count,
    })
  } else if (f.mode === 'chapters') {
    const list = parseChapterNumbersInput(f.chapterNumbersText, total).join(', ')
    batchConfirmMessage.value = tx(pack.batchConfirmChapters, { list, n: count })
  } else {
    batchConfirmMessage.value = tx(pack.batchConfirm, { n: count })
  }
  batchConfirmSheetOpen.value = true
}

function openBatchJobDialog() {
  if (batchRunningOnPage.value) {
    batchJob.openPanel()
    return
  }
  revealBatchScopeSheet()
}

async function confirmBatchGenerate() {
  batchConfirmSheetOpen.value = false

  try {
    const scope = isNovel.value ? 'novel' : 'drama'
    const readiness = await aiConfigAPI.readiness(scope)
    if (!readiness?.ready) {
      const first = readiness?.items?.find(i => !i.ready)
      toast.error(first?.message || tm.value.settings.aiConfigNotReady)
      return
    }
  } catch (e) {
    toast.error(e.message)
    return
  }

  if (isNovel.value) {
    try {
      await novelAPI.saveMeta(dramaId, {
        premise: novelPremiseText.value,
        outline: novelOutlineText.value,
      })
    } catch {
      // 保存失败不阻断，后端仍可用已存 meta
    }
  }

  const batchScope = queuedBatchScope.value ?? { mode: 'remaining' }
  const total = batchUnitTotal.value || pendingUnitCount.value

  void batchJob.startJob({
    dramaId,
    dramaTitle: drama.value?.title || '',
    projectType: isNovel.value ? 'novel' : 'drama',
    total,
    scope: batchScope,
    openPanel: true,
  })
}

async function submitNewEpisode() {
  try {
    episodeCreateBusy.value = true
    await episodeAPI.create({
      drama_id: dramaId,
      title: createEpisodeTitle.value || undefined,
      drama_image_config_id: episodeImageCfgId.value,
      drama_video_config_id: episodeVideoCfgId.value,
      drama_audio_config_id: episodeAudioCfgId.value,
      production_pipeline: createEpisodePipeline.value,
    })
    toast.success(tm.value.drama.toastEpisodeAdded)
    createEpisodeSheetOpen.value = false
    episodeFilter.value = 'all'
    await fetchDramaDetail()
    const lastPage = Math.max(1, Math.ceil(episodeStats.value.total / episodePageSize.value))
    if (lastPage !== episodePage.value) setEpisodePage(lastPage)
  } catch (e) {
    toast.error(e.message)
  } finally {
    episodeCreateBusy.value = false
  }
}

onMounted(async () => {
  init()
  batchJob.registerDramaCallbacks(dramaId, {
    onChapterDone: () => fetchEpisodePage(),
    onFinished: fetchDramaDetail,
  })
  if (import.meta.client) {
    const savedPage = Number(sessionStorage.getItem(episodeListStorageKey('page')) || 0)
    const savedPageSize = Number(localStorage.getItem(EP_LIST_PAGE_SIZE_KEY) || 0)
    const savedFilter = sessionStorage.getItem(episodeListStorageKey('filter'))
    if (savedPage > 0) episodePage.value = savedPage
    if (EPISODE_PAGE_SIZE_OPTIONS.includes(savedPageSize)) episodePageSize.value = savedPageSize
    if (savedFilter === 'all' || savedFilter === 'written' || savedFilter === 'pending') {
      episodeFilter.value = savedFilter
    }
  }
  await fetchDramaDetail()
  void reloadStyleCatalog()
})

onActivated(() => {
  void fetchEpisodePage()
  if (isNovel.value) void fetchNovelMeta()
})

onUnmounted(() => {
  batchJob.unregisterDramaCallbacks(dramaId)
})
</script>

<style scoped>
.page {
  padding: 28px 48px 40px;
  overflow-y: auto;
  height: 100%;
  animation: fadeUp 0.35s var(--ease-out) both;
}

.page-loading {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-loading-head {
  height: 28px;
  width: 220px;
  border-radius: var(--radius);
}
.page-loading-card {
  height: 88px;
  border-radius: var(--radius-lg);
  background: linear-gradient(90deg, var(--bg-2) 25%, var(--bg-hover) 50%, var(--bg-2) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
.skeleton-line {
  background: linear-gradient(90deg, var(--bg-2) 25%, var(--bg-hover) 50%, var(--bg-2) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 24px;
  gap: 20px;
}
.head-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.btn-template {
  border-color: rgba(120, 90, 200, 0.3);
  color: #5b45b8;
  background: rgba(120, 90, 200, 0.06);
  font-size: 12px;
}
.btn-template.is-published {
  background: rgba(120, 90, 200, 0.14);
  border-color: rgba(120, 90, 200, 0.4);
}
.publish-dialog { max-width: 480px; width: 100%; }
.head-left { display: flex; align-items: flex-start; gap: 12px; }
.head-info { display: flex; flex-direction: column; gap: 8px; }

.back-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 12px; font-size: 13px; font-weight: 500;
  border: 1px solid var(--border); border-radius: var(--radius);
  background: var(--bg-0); color: var(--text-2);
  cursor: pointer; transition: all 0.18s var(--ease-out);
  box-shadow: var(--shadow-xs);
}
.back-btn:hover { background: var(--bg-hover); border-color: var(--border-strong); color: var(--text-0); }

.page-title {
  font-family: var(--font-display);
  font-size: 26px; font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
}
.page-title-input {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius);
  color: var(--text-0);
  padding: 4px 10px;
  margin: -4px -10px;
  min-width: 320px;
  max-width: 720px;
  width: 100%;
  outline: none;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.page-title-input:hover {
  border-color: var(--border);
}
.page-title-input:focus {
  border-color: var(--accent);
  background: var(--bg-1);
}
.page-title-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.style-chip {
  font-size: 11px; font-weight: 500;
  padding: 2px 8px;
  background: var(--accent-bg); color: var(--accent-text);
  border-radius: 99px; border: 1px solid rgba(184,120,20,0.12);
}
.style-edit-btn {
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-0);
  color: var(--text-2);
  font-size: 11px;
  cursor: pointer;
}
.style-edit-btn:hover {
  border-color: var(--border-strong);
  color: var(--text-0);
  background: var(--bg-hover);
}
.meta-divider { width: 3px; height: 3px; border-radius: 50%; background: var(--text-3); }
.meta-item {
  display: flex; align-items: center; gap: 5px;
  font-size: 12px; color: var(--text-2);
}
.novel-chip-muted {
  opacity: 0.75;
  background: var(--bg-2);
  color: var(--text-3);
  border-color: var(--border);
}

/* Section label */
.section-label {
  display: flex; align-items: center; gap: 7px;
  font-size: 11px; font-weight: 700;
  color: var(--text-3); letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 12px;
}

/* Episode Grid */
.ep-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  max-width: 760px;
}
.ep-filter-bar {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.ep-filter-btn {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-2);
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 999px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.ep-filter-btn:hover {
  border-color: var(--accent);
  color: var(--text-1);
}
.ep-filter-btn.active {
  border-color: rgba(184, 120, 20, 0.35);
  background: var(--accent-bg);
  color: var(--accent);
}
.ep-pagination {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  max-width: 760px;
  margin-top: 12px;
  padding: 10px 0 4px;
}
.ep-page-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: var(--text-2);
  min-width: 120px;
}
.ep-page-range {
  color: var(--text-3);
  font-size: 11px;
}
.ep-jump {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
.ep-jump-input {
  width: 72px;
  padding: 6px 8px;
  font-size: 12px;
}
.ep-page-size {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ep-page-size-label {
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
}
.ep-page-size-select {
  width: auto;
  min-width: 88px;
  padding: 6px 8px;
  font-size: 12px;
}
.ep-grid { display: flex; flex-direction: column; gap: 10px; max-width: 760px; }

.vol-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 4px 4px;
  margin-top: 4px;
}
.vol-section-head:first-child { margin-top: 0; padding-top: 0; }
.vol-section-title {
  font-size: 13px;
  font-weight: 600;
  color: #5b45b8;
  letter-spacing: 0.02em;
}
.vol-section-range {
  font-size: 11px;
  color: var(--text-3);
  font-family: var(--font-mono);
  flex-shrink: 0;
}

.ep-card {
  display: flex; align-items: center; gap: 16px;
  padding: 14px 16px;
  cursor: pointer;
  animation: fadeUp 0.35s var(--ease-out) both;
  transition: transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out), border-color 0.18s;
}
.ep-card:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow);
  transform: translateX(4px);
}

.ep-number {
  width: 44px; height: 44px; flex-shrink: 0;
  border-radius: var(--radius);
  background: var(--bg-2);
  border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-mono);
  font-size: 12px; font-weight: 700;
  color: var(--text-2);
  transition: all 0.18s;
}
.ep-card:hover .ep-number {
  background: var(--accent-bg);
  border-color: rgba(184,120,20,0.2);
  color: var(--accent);
}

.ep-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.ep-title { font-size: 14px; font-weight: 600; color: var(--text-0); }
.ep-status { display: flex; align-items: center; gap: 6px; }
.status-dot {
  width: 6px; height: 6px; border-radius: 50%;
}
.dot-ready { background: var(--success); }
.dot-pending { background: var(--text-3); }
.status-text { font-size: 11px; color: var(--text-3); }
.ep-duration,
.ep-pipeline-tags {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
}
.ep-pipeline-sep {
  font-size: 10px;
  color: var(--text-3);
  user-select: none;
}
.ep-pipeline-link {
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: 11px;
  color: var(--text-3);
  cursor: pointer;
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: 2px;
  transition: color 0.15s, text-decoration-color 0.15s;
}
.ep-pipeline-link:hover,
.ep-pipeline-link:focus-visible {
  color: var(--text-2);
  text-decoration-color: currentColor;
}
.ep-word-count { font-size: 11px; color: var(--text-3); font-family: var(--font-mono); }
.ep-duration { margin-left: auto; }

.pipeline-picker {
  display: grid;
  gap: 8px;
}
.pipeline-option {
  display: grid;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
}
.pipeline-option.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.pipeline-option input { display: none; }
.pipeline-option-title { font-size: 13px; font-weight: 600; color: var(--text-0); }
.pipeline-option-desc { font-size: 11px; color: var(--text-3); line-height: 1.45; }

.ep-arrow { color: var(--text-3); flex-shrink: 0; transition: transform 0.18s; }
.ep-card:hover .ep-arrow { transform: translateX(3px); color: var(--accent); }

/* Empty */
.ep-empty {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 48px; text-align: center; color: var(--text-3); font-size: 13px;
  border-style: dashed;
}
.ep-empty-icon {
  width: 48px; height: 48px; border-radius: 50%;
  background: var(--bg-2); display: flex; align-items: center; justify-content: center;
}

.novel-chip { background: rgba(120, 90, 200, 0.12); color: #6b4fc7; border-color: rgba(120, 90, 200, 0.2); }
.novel-meta-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 20px;
  max-width: 760px;
}
.drama-synopsis-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 20px;
  max-width: 760px;
}
.outline-panel {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.premise-keywords-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}
.premise-keywords-row .input { flex: 1; min-width: 0; }
.premise-gen-btn { flex-shrink: 0; white-space: nowrap; }
.premise-textarea { min-height: 96px; }
.outline-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.outline-head .inline { margin-bottom: 0; }
.outline-actions { display: flex; gap: 8px; }
.outline-textarea {
  min-height: 120px;
  resize: vertical;
  line-height: 1.65;
  font-family: inherit;
}
.outline-hint { font-size: 12px; color: var(--text-3); margin: 0; }
.chapter-dialog { max-width: 480px; width: 100%; padding: 22px; gap: 16px; }
.btn-sm { height: 32px; padding: 0 12px; font-size: 12px; }
.btn-batch {
  border-color: rgba(120, 90, 200, 0.35);
  background: rgba(120, 90, 200, 0.08);
  color: #5b45b8;
}
.btn-batch:hover:not(:disabled) {
  background: rgba(120, 90, 200, 0.14);
  border-color: rgba(120, 90, 200, 0.45);
}
.batch-confirm-dialog,
.batch-scope-dialog,
.batch-dialog {
  max-width: 560px;
  width: 100%;
  max-height: min(88vh, 780px);
  padding: 24px;
  gap: 12px;
  background:
    radial-gradient(circle at top left, rgba(120, 90, 200, 0.12), transparent 38%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 246, 255, 0.94));
}
.batch-scope-dialog > .dialog-head,
.batch-scope-dialog > .dialog-foot {
  flex-shrink: 0;
}
.batch-scope-dialog > .batch-scope-options {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
  margin-right: -4px;
}
.batch-scope-dialog > .dialog-foot {
  padding-top: 12px;
  border-top: 1px solid rgba(27, 41, 64, 0.08);
}
.dialog.batch-scope-dialog {
  max-height: min(88vh, calc(100vh - 40px));
}
.batch-confirm-title,
.batch-progress-title {
  font-size: 22px;
  line-height: 1.25;
}
.batch-confirm-note {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.batch-confirm-chip {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(120, 90, 200, 0.1);
  border: 1px solid rgba(120, 90, 200, 0.18);
  font-size: 12px;
  font-weight: 600;
  color: #5b45b8;
}
.batch-scope-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.batch-scope-pipeline {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 8px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--border);
}
.batch-pipeline-steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}
.batch-pipeline-steps-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 10px;
}
.batch-pipeline-steps-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-2);
  line-height: 1.35;
}
.batch-pipeline-step-num {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  color: var(--text-3);
  flex-shrink: 0;
}
@media (max-width: 640px) {
  .batch-pipeline-steps-list { grid-template-columns: 1fr; }
}
.batch-scope-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid rgba(27, 41, 64, 0.1);
  background: rgba(255, 255, 255, 0.72);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.batch-scope-option.active {
  border-color: rgba(120, 90, 200, 0.35);
  background: rgba(120, 90, 200, 0.06);
}
.batch-scope-radio {
  margin-top: 3px;
  flex-shrink: 0;
}
.batch-scope-option-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.batch-scope-option-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-0);
}
.batch-scope-option-desc {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-3);
}
.batch-scope-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 0 4px 4px 28px;
}
.batch-scope-fields .field:last-child:nth-child(odd) {
  grid-column: 1 / -1;
}
.batch-confirm-foot,
.batch-progress-foot {
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
.btn-batch-primary {
  background: linear-gradient(135deg, #7c5fd4, #5b45b8);
  border-color: transparent;
}
.btn-batch-primary:hover:not(:disabled) {
  filter: brightness(1.05);
}
.batch-progress-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}
.batch-progress-bar {
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: rgba(120, 90, 200, 0.12);
  overflow: hidden;
}
.batch-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #9b7ee8, #5b45b8);
  transition: width 0.25s var(--ease-out);
  border-radius: inherit;
}
.batch-progress-pct {
  font-size: 12px;
  font-weight: 700;
  font-family: var(--font-mono);
  color: #5b45b8;
  min-width: 36px;
  text-align: right;
}
.batch-running-note {
  font-size: 12px;
  color: var(--text-3);
  margin: 0;
  line-height: 1.5;
}
.batch-stop-hint {
  font-size: 12px;
  color: var(--warn, #c97a2e);
  margin: 8px 0 0;
  line-height: 1.5;
}
.btn-warn {
  border-color: rgba(201, 122, 46, 0.35);
  color: var(--warn, #c97a2e);
  background: rgba(201, 122, 46, 0.08);
}
.btn-warn:hover {
  background: rgba(201, 122, 46, 0.14);
}
.batch-phase {
  font-size: 13px;
  color: var(--text-2);
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(27, 41, 64, 0.06);
}
.batch-error { font-size: 12px; color: var(--danger); margin: 0; line-height: 1.5; }
.batch-mask {
  z-index: 120;
  align-items: flex-start;
  overflow-y: auto;
  padding-top: max(20px, 3vh);
  padding-bottom: max(20px, 3vh);
}

.dialog-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 38, 0.18);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.dialog {
  width: min(760px, 100%);
  max-height: min(860px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 26px 26px 22px;
  border-radius: 28px;
  background:
    radial-gradient(circle at top left, rgba(122,167,255,0.14), transparent 34%),
    radial-gradient(circle at top right, rgba(76,125,255,0.08), transparent 26%),
    linear-gradient(180deg, rgba(255,255,255,0.98), rgba(242,247,255,0.92));
  overflow: hidden;
  border: 1px solid rgba(27, 41, 64, 0.08);
  box-shadow: 0 22px 52px rgba(32, 48, 77, 0.14), 0 8px 18px rgba(32, 48, 77, 0.08);
}
.style-dialog {
  max-width: 620px;
}
.dialog-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.dialog-head-trailing { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.dialog-head-copy { display: flex; flex-direction: column; gap: 8px; max-width: 520px; min-width: 0; flex: 1; }
.dialog-kicker {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-3);
}
.dialog-title-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dialog-title { font-size: 28px; font-weight: 800; color: var(--text-0); letter-spacing: -0.03em; }
.dialog-badge {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(76,125,255,0.1);
  color: var(--accent-text);
  font-size: 12px;
  font-weight: 700;
}
.dialog-sub { font-size: 14px; line-height: 1.7; color: var(--text-2); }
.dialog-summary {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.summary-chip {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255,255,255,0.78);
  border: 1px solid rgba(27, 41, 64, 0.08);
  font-size: 12px;
  color: var(--text-2);
}
.dialog-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding-right: 4px;
}
.dialog-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
  border-radius: 22px;
  background: rgba(255,255,255,0.72);
  border: 1px solid rgba(27, 41, 64, 0.08);
}
.dialog-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.dialog-section-title { font-size: 14px; font-weight: 700; color: var(--text-0); }
.dialog-section-copy { font-size: 12px; color: var(--text-3); }
.config-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.config-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(244,248,255,0.96), rgba(255,255,255,0.78));
  border: 1px solid rgba(27, 41, 64, 0.08);
}
.config-card-kicker {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-3);
}
.dialog-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 2px;
}
.dialog-foot-copy {
  flex: 1;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-3);
}
.field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 12px; font-weight: 600; color: var(--text-1); }
.field-hint { font-size: 12px; color: var(--text-3); }

@media (max-width: 860px) {
  .dialog {
    width: 100%;
    max-height: calc(100vh - 24px);
    padding: 18px;
    border-radius: 22px;
  }

  .dialog-title {
    font-size: 24px;
  }

  .config-grid {
    grid-template-columns: 1fr;
  }

  .dialog-foot {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
