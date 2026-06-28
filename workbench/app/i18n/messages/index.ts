import type { Lang } from '../constants'
import type { ConsoleMessages } from './zh-CN'
import { zhCNMessages } from './zh-CN'
import { enMessages } from './en'
import { filMessages } from './fil'
import { viMessages } from './vi'

export const MESSAGES: Record<Lang, ConsoleMessages> = {
  'zh-CN': zhCNMessages,
  en: enMessages,
  fil: filMessages,
  vi: viMessages,
}

export type { ConsoleMessages }
