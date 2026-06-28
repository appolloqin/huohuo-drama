import { Hono } from 'hono'
import { attachEpisodeMergeRoutes } from '../helpers/merge-routes.js'

const app = new Hono()
attachEpisodeMergeRoutes(app)

export default app
