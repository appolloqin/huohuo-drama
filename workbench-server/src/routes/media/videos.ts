import { Hono } from 'hono'
import { videoGenerationForUser } from '../../services/drama/drama-access-service.js';
import {
  deleteVideoGeneration,
  enqueueVideoFromRequest,
  listVideoGenerations,
} from '../../services/media/video-route-service.js'
import { countVideoGenerations } from '../../db/repos/video-generations/index.js'
import { registerGenerationRoutes } from '../helpers/generation-routes.js'

const app = new Hono()

registerGenerationRoutes(app, {
  logTag: 'VideoAPI',
  resourceForUser: videoGenerationForUser,
  enqueue: enqueueVideoFromRequest,
  list: listVideoGenerations,
  count: countVideoGenerations,
  remove: deleteVideoGeneration,
})

export default app
