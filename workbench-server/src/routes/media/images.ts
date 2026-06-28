import { Hono } from 'hono'
import { imageGenerationForUser } from '../../services/drama/drama-access-service.js';
import {
  deleteImageGeneration,
  enqueueImageFromRequest,
  listImageGenerations,
} from '../../services/media/image-route-service.js'
import { countImageGenerations } from '../../db/repos/image-generations/index.js'
import { registerGenerationRoutes } from '../helpers/generation-routes.js'

const app = new Hono()

registerGenerationRoutes(app, {
  logTag: 'ImageAPI',
  resourceForUser: imageGenerationForUser,
  enqueue: enqueueImageFromRequest,
  list: listImageGenerations,
  count: countImageGenerations,
  remove: deleteImageGeneration,
})

export default app
