import * as dramasRepo from '../../db/repos/dramas/index.js'
import * as usersRepo from '../../db/repos/users/index.js'
import { now } from '../../common/http/response.js'
import { toSnakeCase, toSnakeCaseArray } from '../../common/http/transform.js'
import { getPublishedTemplate } from './project-template.js'

export type TemplateListQuery = {
  projectType?: string
  keyword?: string
}

async function resolveAuthorName(userId: number): Promise<string> {
  const user = await usersRepo.findUserById(userId)
  return user?.username || '用户'
}

export async function listPublishedTemplates(query: TemplateListQuery = {}) {
  let rows = await dramasRepo.listPublishedTemplates()

  if (query.projectType === 'drama' || query.projectType === 'novel') {
    rows = rows.filter(d => (d.projectType || 'drama') === query.projectType)
  }
  if (query.keyword) {
    const kw = query.keyword.toLowerCase()
    rows = rows.filter(d =>
      d.title.toLowerCase().includes(kw)
      || (d.description || '').toLowerCase().includes(kw)
      || (d.templateSummary || '').toLowerCase().includes(kw),
    )
  }

  const items = await Promise.all(rows.map(async (d) => {
    const [eps, chars, scns] = await Promise.all([
      dramasRepo.listActiveEpisodesByDrama(d.id),
      dramasRepo.listActiveCharactersByDrama(d.id),
      dramasRepo.listActiveScenesByDrama(d.id),
    ])
    return {
      ...toSnakeCase(d),
      author_name: await resolveAuthorName(d.userId),
      episode_count: eps.length,
      character_count: chars.length,
      scene_count: scns.length,
      template_summary: d.templateSummary || d.description || '',
    }
  }))

  return { items }
}

export async function getPublishedTemplateDetail(id: number) {
  const drama = await getPublishedTemplate(id)
  if (!drama) return null

  const [eps, chars, scns] = await Promise.all([
    dramasRepo.listActiveEpisodesByDrama(id),
    dramasRepo.listActiveCharactersByDrama(id),
    dramasRepo.listActiveScenesByDrama(id),
  ])

  return {
    ...toSnakeCase(drama),
    author_name: await resolveAuthorName(drama.userId),
    template_summary: drama.templateSummary || drama.description || '',
    episodes: toSnakeCaseArray(eps).map((ep: Record<string, unknown>) => ({
      id: ep.id,
      episode_number: ep.episode_number,
      title: ep.title,
      description: ep.description,
      has_content: !!(ep.content || ep.formatted_script || ep.script_content),
    })),
    characters: toSnakeCaseArray(chars).map((ch: Record<string, unknown>) => ({
      id: ch.id,
      name: ch.name,
      role: ch.role,
      personality: ch.personality,
    })),
    scenes: toSnakeCaseArray(scns).map((sc: Record<string, unknown>) => ({
      id: sc.id,
      location: sc.location,
      time: sc.time,
    })),
  }
}

export async function unpublishTemplate(dramaId: number) {
  await dramasRepo.updateDrama(dramaId, { isTemplate: 0, updatedAt: now() })
}

export async function deleteTemplate(dramaId: number): Promise<{ kind: 'hard' | 'unpublish' }> {
  const row = await dramasRepo.findDramaById(dramaId)
  if (!row || !row.isTemplate) throw new Error('模板不存在')
  // Pure templates (created via the template library's manual/url flow) have no
  // associated project — hard-delete the row and its children. For a template
  // published FROM a project (is_template_only=0), the project must stay intact,
  // so only unpublish it (remove from the library, keep the project).
  if (row.isTemplateOnly === 1) {
    await dramasRepo.hardDeleteDrama(dramaId)
    return { kind: 'hard' }
  }
  await unpublishTemplate(dramaId)
  return { kind: 'unpublish' }
}

export async function findDramaSnapshot(id: number) {
  const row = await dramasRepo.findDramaById(id)
  return row ? toSnakeCase(row) : null
}
