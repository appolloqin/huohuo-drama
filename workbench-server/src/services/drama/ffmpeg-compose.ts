import path from 'path'
import { fileURLToPath } from 'url'
import { composeStoryboard as composeStoryboardInternal } from './storyboard-compose-service.js'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const STATIC_ROOT = process.env.STORAGE_PATH || path.resolve(moduleDir, '../../../workbench-data/static')
const DATA_ROOT = path.resolve(moduleDir, '../../../workbench-data')

export function composeStoryboard(storyboardId: number, motionPipeline?: import('../../common/drama/episode-meta.js').ProductionPipeline): Promise<string> {
  return composeStoryboardInternal(storyboardId, {
    staticRoot: STATIC_ROOT,
    dataRoot: DATA_ROOT,
  }, motionPipeline)
}
