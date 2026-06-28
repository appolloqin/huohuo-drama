import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import ffmpeg from 'fluent-ffmpeg'
import { configureFfmpegPaths, getFfmpegExecutable } from '../../common/media/ffmpeg-path.js'

configureFfmpegPaths()
import { v4 as uuid } from 'uuid'
import { getActiveConfig, getTextConfig, type AIConfig } from './ai.js'
import { joinProviderUrl } from './adapters/url.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'

const MAX_ASR_BYTES = 15 * 1024 * 1024

function audioMime(ext: string): string {
  const map: Record<string, string> = {
    '.mp3': 'audio/mp3',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.webm': 'audio/webm',
    '.flac': 'audio/flac',
  }
  return map[ext] || 'audio/mp3'
}

function parseSrtToText(srt: string): string {
  return srt
    .split(/\r?\n\r?\n/)
    .map(block => block
      .split(/\r?\n/)
      .filter(line => !/^\d+$/.test(line) && !/\d{2}:\d{2}:\d{2},\d{3}\s*-->/.test(line))
      .join(' ')
      .trim())
    .filter(Boolean)
    .join('\n')
}

export function tryExtractSubtitleText(videoPath: string): string | null {
  const tmp = path.join(path.dirname(videoPath), `${uuid()}.srt`)
  try {
    execFileSync(getFfmpegExecutable(), ['-i', videoPath, '-map', '0:s:0', tmp, '-y'], { stdio: 'pipe' })
    if (!fs.existsSync(tmp)) return null
    const text = parseSrtToText(fs.readFileSync(tmp, 'utf8'))
    fs.unlinkSync(tmp)
    return text.trim() || null
  } catch {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
    return null
  }
}

export async function extractAudioToWav(srcPath: string, outPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    ffmpeg(srcPath)
      .noVideo()
      .audioChannels(1)
      .audioFrequency(16000)
      .audioCodec('pcm_s16le')
      .format('wav')
      .on('end', () => resolve())
      .on('error', err => reject(err))
      .save(outPath)
  })
}

async function transcribeWithAliMultimodal(absPath: string, config: AIConfig): Promise<string> {
  const buffer = fs.readFileSync(absPath)
  if (buffer.length > MAX_ASR_BYTES) {
    throw new Error('音频过大（超过 15MB），请裁剪或压缩后再试')
  }
  const ext = path.extname(absPath).toLowerCase()
  const mime = audioMime(ext)
  const base64 = buffer.toString('base64')
  const url = joinProviderUrl(config.baseUrl, '/api/v1', '/services/aigc/multimodal-generation/generation')
  const models = ['qwen-audio-asr', 'qwen2-audio-instruct', 'qwen-audio-turbo']
  let lastErr = 'ASR 失败'

  for (const model of models) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: {
            messages: [{
              role: 'user',
              content: [
                { audio: `data:${mime};base64,${base64}` },
                { text: '请完整转写音频中的语音内容，只输出转写文本，不要添加任何说明或标点以外的格式。' },
              ],
            }],
          },
        }),
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        lastErr = json?.message || json?.error?.message || `ASR ${resp.status}`
        continue
      }
      const text = json?.output?.choices?.[0]?.message?.content
        || json?.output?.text
        || json?.choices?.[0]?.message?.content
      if (typeof text === 'string' && text.trim()) return text.trim()
      lastErr = 'ASR 返回空文本'
    } catch (err: any) {
      lastErr = err?.message || lastErr
    }
  }
  throw new Error(lastErr)
}

async function transcribeWithOpenAIWhisper(absPath: string, config: AIConfig): Promise<string> {
  const buffer = fs.readFileSync(absPath)
  if (buffer.length > MAX_ASR_BYTES) {
    throw new Error('音频过大（超过 15MB），请裁剪或压缩后再试')
  }
  const url = joinProviderUrl(config.baseUrl, '/v1', '/audio/transcriptions')
  const blob = new Blob([buffer])
  const form = new FormData()
  form.append('file', blob, path.basename(absPath))
  form.append('model', config.model || 'whisper-1')
  form.append('response_format', 'text')

  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(text || `Whisper ${resp.status}`)
  return text.trim()
}

export async function transcribeAudioFile(absPath: string): Promise<string> {
  logTaskStart('AiDetect', 'asr', { path: absPath })
  const audioCfg = await getActiveConfig('audio')
  const textCfg = await getTextConfig()
  const provider = (audioCfg?.provider || textCfg.provider).toLowerCase()

  try {
    let text = ''
    if (provider === 'ali' && audioCfg) {
      text = await transcribeWithAliMultimodal(absPath, audioCfg)
    } else if (provider === 'openai' || provider === 'openrouter' || provider === 'huohuo') {
      text = await transcribeWithOpenAIWhisper(absPath, textCfg)
    } else if (audioCfg) {
      text = await transcribeWithAliMultimodal(absPath, audioCfg)
    } else {
      text = await transcribeWithOpenAIWhisper(absPath, textCfg)
    }
    if (!text.trim()) throw new Error('未能识别出语音内容')
    logTaskSuccess('AiDetect', 'asr', { chars: text.length })
    return text.trim()
  } catch (err: any) {
    logTaskError('AiDetect', 'asr', { error: err?.message })
    throw err
  }
}

export async function transcribeVideoFile(videoPath: string): Promise<{ text: string; from: 'subtitle' | 'asr' }> {
  logTaskProgress('AiDetect', 'video-subtitle-try', { path: videoPath })
  const subs = tryExtractSubtitleText(videoPath)
  if (subs && subs.length >= 20) {
    logTaskSuccess('AiDetect', 'video-subtitle', { chars: subs.length })
    return { text: subs, from: 'subtitle' }
  }

  const wavPath = path.join(path.dirname(videoPath), `${uuid()}.wav`)
  try {
    logTaskProgress('AiDetect', 'video-extract-audio', { path: videoPath })
    await extractAudioToWav(videoPath, wavPath)
    const text = await transcribeAudioFile(wavPath)
    return { text, from: 'asr' }
  } finally {
    if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath)
  }
}
