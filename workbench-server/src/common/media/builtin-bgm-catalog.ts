import fs from 'fs'
import path from 'path'

const LOOP_SEC = 24
export const BUILTIN_BGM_PREFIX = 'builtin:'

export type BuiltinBgmPreset = {
  id: string
  label: string
  description: string
  /** Relative under static/, e.g. static/bgm/builtin/soft-pad.wav */
  relativePath: string
}

type HarmonicSpec = {
  freqs: number[]
  weights: number[]
  gain: number
}

const PRESET_HARMONICS: Record<string, HarmonicSpec> = {
  'soft-pad': {
    freqs: [82.41, 123.47, 164.81, 220, 329.63],
    weights: [0.34, 0.26, 0.2, 0.14, 0.06],
    gain: 0.09,
  },
  'warm-dawn': {
    freqs: [98, 146.83, 196, 246.94, 392],
    weights: [0.28, 0.3, 0.22, 0.12, 0.08],
    gain: 0.085,
  },
  'tense-drone': {
    freqs: [55, 82.5, 110.5, 165.2, 220.7],
    weights: [0.4, 0.28, 0.18, 0.1, 0.04],
    gain: 0.08,
  },
  'night-rain': {
    freqs: [65.41, 98, 130.81, 196, 261.63],
    weights: [0.32, 0.24, 0.2, 0.14, 0.1],
    gain: 0.075,
  },
  'hope-lift': {
    freqs: [130.81, 164.81, 196, 246.94, 329.63],
    weights: [0.22, 0.26, 0.24, 0.16, 0.12],
    gain: 0.08,
  },
}

/** Built-in BGM catalog (procedurally generated ambient loops). */
export const BUILTIN_BGM_PRESETS: BuiltinBgmPreset[] = [
  {
    id: 'soft-pad',
    label: '柔和铺底',
    description: '低沉弦乐感，适合日常对话',
    relativePath: 'static/bgm/builtin/soft-pad.wav',
  },
  {
    id: 'warm-dawn',
    label: '暖意晨光',
    description: '偏亮温暖，适合温情/和解',
    relativePath: 'static/bgm/builtin/warm-dawn.wav',
  },
  {
    id: 'tense-drone',
    label: '压抑低鸣',
    description: '不协和低频，适合对峙/危机',
    relativePath: 'static/bgm/builtin/tense-drone.wav',
  },
  {
    id: 'night-rain',
    label: '夜雨氛围',
    description: '阴郁铺垫，适合悬疑/独处',
    relativePath: 'static/bgm/builtin/night-rain.wav',
  },
  {
    id: 'hope-lift',
    label: '希望抬升',
    description: '明亮推进，适合反转/爽点',
    relativePath: 'static/bgm/builtin/hope-lift.wav',
  },
]

export const DEFAULT_BUILTIN_BGM_ID = BUILTIN_BGM_PRESETS[0].id

/** Legacy sentinel stored before multi-preset support. */
export const STORYBOARD_BGM_BUILTIN_LEGACY = '__builtin__'

export function builtinBgmRef(id: string): string {
  return `${BUILTIN_BGM_PREFIX}${id}`
}

export function parseBuiltinBgmId(bgmUrl: string | null | undefined): string | null {
  const raw = (bgmUrl || '').trim()
  if (!raw) return null
  if (raw === STORYBOARD_BGM_BUILTIN_LEGACY) return DEFAULT_BUILTIN_BGM_ID
  if (!raw.startsWith(BUILTIN_BGM_PREFIX)) return null
  const id = raw.slice(BUILTIN_BGM_PREFIX.length).trim()
  return BUILTIN_BGM_PRESETS.some(p => p.id === id) ? id : DEFAULT_BUILTIN_BGM_ID
}

export function findBuiltinBgmPreset(id: string | null | undefined): BuiltinBgmPreset | null {
  if (!id) return null
  return BUILTIN_BGM_PRESETS.find(p => p.id === id) || null
}

function writeWavHeader(buffer: Buffer, dataSize: number, sampleRate: number, channels: number, bitsPerSample: number): void {
  const blockAlign = channels * (bitsPerSample / 8)
  const byteRate = sampleRate * blockAlign
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
}

function writeHarmonicLoopWav(outputPath: string, durationSec: number, spec: HarmonicSpec): void {
  const sampleRate = 48000
  const channels = 2
  const bitsPerSample = 16
  const numSamples = Math.max(1, Math.ceil(durationSec * sampleRate))
  const blockAlign = channels * (bitsPerSample / 8)
  const dataSize = numSamples * blockAlign
  const buffer = Buffer.alloc(44 + dataSize)

  writeWavHeader(buffer, dataSize, sampleRate, channels, bitsPerSample)

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    const fadeIn = Math.min(1, t / 1.5)
    const fadeOut = Math.min(1, (durationSec - t) / 1.5)
    const envelope = fadeIn * fadeOut
    let mono = 0
    for (let h = 0; h < spec.freqs.length; h++) {
      mono += Math.sin(2 * Math.PI * spec.freqs[h] * t) * (spec.weights[h] || 0)
    }
    mono *= envelope * spec.gain
    const sample = Math.max(-32768, Math.min(32767, Math.round(mono * 32767)))
    const offset = 44 + i * blockAlign
    buffer.writeInt16LE(sample, offset)
    buffer.writeInt16LE(sample, offset + 2)
  }

  fs.writeFileSync(outputPath, buffer)
}

/** Ensure one builtin preset wav exists under staticRoot (absolute file path returned). */
export function ensureBuiltinBgmFile(staticRoot: string, presetId: string): string {
  const preset = findBuiltinBgmPreset(presetId) || findBuiltinBgmPreset(DEFAULT_BUILTIN_BGM_ID)!
  const absolute = path.join(staticRoot, preset.relativePath.replace(/^static\//, ''))
  if (fs.existsSync(absolute)) return absolute

  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  const harmonic = PRESET_HARMONICS[preset.id] || PRESET_HARMONICS[DEFAULT_BUILTIN_BGM_ID]
  writeHarmonicLoopWav(absolute, LOOP_SEC, harmonic)
  return absolute
}

/** Ensure all catalog tracks exist; return public metadata for API / UI. */
export function listBuiltinBgmPresets(staticRoot: string): Array<BuiltinBgmPreset & { preview_url: string }> {
  return BUILTIN_BGM_PRESETS.map((preset) => {
    ensureBuiltinBgmFile(staticRoot, preset.id)
    return {
      ...preset,
      preview_url: `/${preset.relativePath}`,
    }
  })
}
