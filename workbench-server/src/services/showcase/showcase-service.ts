import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as imageGenerationsRepo from '../../db/repos/image-generations/index.js'
import * as videoGenerationsRepo from '../../db/repos/video-generations/index.js'
import type { ImageGenerationRow, VideoGenerationRow } from '../../db/repos/types.js'
import {
  INDUSTRY_SLUGS,
  isValidIndustrySlug,
  type IndustrySlug,
} from '../../common/industry/industry-catalog.js'
import { resolveGenerationStorageUri } from '../../common/media/generation-storage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STATIC_ROOT = path.resolve(__dirname, '../../../../workbench-data')

function localFileExists(relativePath: string): boolean {
  if (!relativePath) return false
  const clean = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath
  try { return fs.existsSync(path.join(STATIC_ROOT, clean)) } catch { return false }
}

function inferIndustry(text: string): string {
  const t = (text || '').toLowerCase()
  const hit = (arr: string[]) => arr.some((k) => t.includes(k))
  if (hit(['dress', 'shirt', 'jacket', 'skirt', '鞋', '服装', '穿搭', '连衣裙', '上衣', '裤'])) return 'apparel'
  if (hit(['jewel', 'ring', 'necklace', 'diamond', '珠宝', '钻石', '项链', '戒指'])) return 'jewelry'
  if (hit(['lipstick', 'makeup', 'skincare', 'cosmetic', 'beauty', '口红', '护肤', '化妆', '美妆'])) return 'beauty'
  if (hit(['food', 'meal', 'snack', 'fruit', 'drink', '餐', '零食', '水果', '饮料', '生鲜'])) return 'food'
  if (hit(['baby', 'kids', 'diaper', 'mother', '育儿', '母婴', '宝宝', '儿童'])) return 'motherBaby'
  if (hit(['sofa', 'kitchen', 'home', 'furniture', '装修', '家居', '厨房', '客厅'])) return 'home'
  if (hit(['course', 'class', 'teacher', 'education', '学习', '课程', '培训', '老师'])) return 'edu'
  if (hit(['phone', 'laptop', 'camera', 'digital', 'appliance', '手机', '电脑', '数码', '家电'])) return 'digital'
  if (hit(['car', 'vehicle', 'automotive', 'engine', '汽车', '车载', '轮胎'])) return 'auto'
  if (hit(['hospital', 'medical', 'health', 'doctor', '药', '医疗', '健康', '医生'])) return 'medical'
  if (hit(['sport', 'fitness', 'outdoor', 'gym', '运动', '健身', '户外'])) return 'sport'
  if (hit(['pet', 'dog', 'cat', '宠物', '猫粮', '狗粮'])) return 'pet'
  if (hit(['hotel', 'restaurant', '团购', '探店', '到店', '本地生活', '美团'])) return 'localLife'
  if (hit(['travel', 'trip', 'flight', 'hotel', '景点', '旅行', '旅游', '机票'])) return 'travel'
  if (hit(['bank', 'insurance', 'fund', 'stock', '理财', '保险', '基金', '股票'])) return 'finance'
  if (hit(['live', 'show', 'variety', '主播', '直播', '综艺', '娱乐'])) return 'entertainment'
  if (hit(['game', 'esport', 'anime', '游戏', '电竞', '二次元', '动漫'])) return 'gaming'
  if (hit(['book', 'reading', 'literature', '图书', '阅读', '出版'])) return 'books'
  if (hit(['music', 'dance', 'song', '音乐', '舞蹈', '唱歌'])) return 'music'
  if (hit(['news', '热点', '资讯', '时事'])) return 'news'
  if (hit(['farm', 'seed', 'fertilizer', '农业', '农资', '绿植', '花卉'])) return 'agriculture'
  if (hit(['saas', 'crm', 'cloud', '企业服务', '获客', '营销'])) return 'business'
  if (hit(['政务', '公益', '公共服务', 'government'])) return 'government'
  return 'generic'
}

/** 站内路径，避免反代后 origin 变成 http://127.0.0.1:18555 导致浏览器无法访问 */
function toPublicUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return encodeURI(raw)
  if (raw.startsWith('/')) return encodeURI(raw)
  if (raw.startsWith('static/')) return encodeURI(`/${raw}`)

  const normalized = raw.replace(/\\/g, '/')
  const idx = normalized.indexOf('/static/')
  if (idx >= 0) return encodeURI(normalized.slice(idx))
  return null
}

function looksLikeImage(url: string | null): boolean {
  if (!url) return false
  return /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(url)
}

function looksLikeVideo(url: string | null): boolean {
  if (!url) return false
  return /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url)
}

function mapImageRow(r: ImageGenerationRow) {
  const bestUrl = resolveGenerationStorageUri(r, localFileExists)
  return {
    id: r.id,
    url: toPublicUrl(bestUrl),
    prompt: r.prompt || '',
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    provider: r.provider || '',
    model: r.model || '',
    industry: inferIndustry(r.prompt || ''),
  }
}

function mapVideoRow(r: VideoGenerationRow) {
  const bestUrl = resolveGenerationStorageUri(r, localFileExists)
  return {
    id: r.id,
    url: toPublicUrl(bestUrl),
    prompt: r.prompt || '',
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    duration: r.duration || 0,
    provider: r.provider || '',
    model: r.model || '',
    industry: inferIndustry(r.prompt || ''),
  }
}

async function listCompletedImages(limit?: number) {
  // Fetch slightly more than the requested cap so we still have a usable
  // result set after the looksLikeImage/url filters drop some rows. The repo
  // already enforces an upper bound (500) so we never blow up the page.
  const fetchLimit = limit ? Math.min(500, Math.max(limit * 2, limit)) : 500
  const rows = (await imageGenerationsRepo.listCompletedImageGenerations(fetchLimit))
    .map(mapImageRow)
    .filter((r) => !!r.url && looksLikeImage(r.url))
  return limit ? rows.slice(0, limit) : rows
}

async function listCompletedVideos(limit?: number) {
  const fetchLimit = limit ? Math.min(500, Math.max(limit * 2, limit)) : 500
  const rows = (await videoGenerationsRepo.listCompletedVideoGenerations(fetchLimit))
    .map(mapVideoRow)
    .filter((r) => !!r.url && looksLikeVideo(r.url))
  return limit ? rows.slice(0, limit) : rows
}

async function listCompletedImagesByIndustry(industry: IndustrySlug, limit: number) {
  const fetchLimit = Math.min(500, Math.max(limit * 2, limit))
  const rows = (await imageGenerationsRepo.listCompletedImageGenerationsByIndustry(industry, fetchLimit))
    .map(mapImageRow)
    .filter((r) => !!r.url && looksLikeImage(r.url))
  return rows.slice(0, limit)
}

async function listCompletedVideosByIndustry(industry: IndustrySlug, limit: number) {
  const fetchLimit = Math.min(500, Math.max(limit * 2, limit))
  const rows = (await videoGenerationsRepo.listCompletedVideoGenerationsByIndustry(industry, fetchLimit))
    .map(mapVideoRow)
    .filter((r) => !!r.url && looksLikeVideo(r.url))
  return rows.slice(0, limit)
}

export async function getShowcaseMedia(imageLimit: number, videoLimit: number) {
  return {
    images: await listCompletedImages(imageLimit),
    videos: await listCompletedVideos(videoLimit),
  }
}

export async function getShowcaseEntries() {
  // Showcase entries (sitemap payload) only needs ids + timestamps, not URLs.
  // Cap at 500 per type — same limit the repo enforces — instead of streaming
  // every completed row in history.
  const images = (await listCompletedImages(500)).map(({ id, updatedAt, createdAt }) => ({ id, updatedAt, createdAt }))
  const videos = (await listCompletedVideos(500)).map(({ id, updatedAt, createdAt }) => ({ id, updatedAt, createdAt }))
  return { images, videos }
}

export async function getShowcaseImageById(id: number) {
  const row = await imageGenerationsRepo.findImageGenerationById(id)
  if (!row || row.status !== 'completed' || row.errorMsg) return null
  const item = mapImageRow(row)
  if (!item.url || !looksLikeImage(item.url)) return null
  return item
}

export async function getShowcaseVideoById(id: number) {
  const row = await videoGenerationsRepo.findVideoGenerationById(id)
  if (!row || row.status !== 'completed' || row.errorMsg) return null
  const item = mapVideoRow(row)
  if (!item.url || !looksLikeVideo(item.url)) return null
  return item
}

/**
 * Per-industry showcase feed for the public landing pages.
 *  - `slug` MUST be a known industry; unknown slugs throw so the route can
 *    map them to 404 (instead of silently returning empty arrays).
 *  - SQL pushes the keyword OR-LIKE filter so we never read more rows than
 *    needed even when the prompt corpus is huge.
 *  - `limit` is per type; image and video pools are independent.
 */
export async function getShowcaseMediaByIndustry(slug: string, imageLimit: number, videoLimit: number) {
  if (!isValidIndustrySlug(slug)) {
    throw new Error(`Unknown industry slug: ${slug}`)
  }
  const industry = slug as IndustrySlug
  return {
    industry,
    images: await listCompletedImagesByIndustry(industry, imageLimit),
    videos: await listCompletedVideosByIndustry(industry, videoLimit),
  }
}

export function listKnownIndustrySlugs(): readonly IndustrySlug[] {
  return INDUSTRY_SLUGS
}
