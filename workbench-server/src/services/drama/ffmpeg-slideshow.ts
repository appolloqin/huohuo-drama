import path from 'path'
import { fileURLToPath } from 'url'
import { generateStoryboardSlideshow } from './storyboard-slideshow-service.js'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const STATIC_ROOT = process.env.STORAGE_PATH || path.resolve(moduleDir, '../../../workbench-data/static')
const DATA_ROOT = path.resolve(moduleDir, '../../../workbench-data')

export function getSlideshowServicePaths() {
  return {
    staticRoot: STATIC_ROOT,
    dataRoot: DATA_ROOT,
  }
}

export function renderStoryboardSlideshow(storyboardId: number): Promise<string> {
  return generateStoryboardSlideshow(storyboardId, getSlideshowServicePaths())
}
