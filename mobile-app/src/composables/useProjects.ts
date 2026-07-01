import { ref } from 'vue'
import { dramasApi } from '../api'
import type { ProjectListItem, ProjectType } from '../api'

const selectedProjectId = ref<number | null>(null)
const selectedProjectTitle = ref('')

export function useProjectSelection() {
  function selectProject(item: Pick<ProjectListItem, 'id' | 'title'>) {
    selectedProjectId.value = item.id
    selectedProjectTitle.value = item.title
    uni.setStorageSync('mobile_selected_drama_id', item.id)
    uni.setStorageSync('mobile_selected_drama_title', item.title)
  }

  function loadSelection() {
    const id = Number(uni.getStorageSync('mobile_selected_drama_id'))
    const title = uni.getStorageSync('mobile_selected_drama_title') || ''
    if (Number.isFinite(id) && id > 0) {
      selectedProjectId.value = id
      selectedProjectTitle.value = title
    }
  }

  function clearSelection() {
    selectedProjectId.value = null
    selectedProjectTitle.value = ''
    uni.removeStorageSync('mobile_selected_drama_id')
    uni.removeStorageSync('mobile_selected_drama_title')
  }

  return {
    selectedProjectId,
    selectedProjectTitle,
    selectProject,
    loadSelection,
    clearSelection,
  }
}

export function useProjects() {
  const items = ref<ProjectListItem[]>([])
  const loading = ref(false)
  const filter = ref<'all' | ProjectType>('all')

  async function fetchList() {
    loading.value = true
    try {
      const res = await dramasApi.list({
        project_type: filter.value === 'all' ? undefined : filter.value,
        page: 1,
        page_size: 50,
      })
      items.value = res.items
    } finally {
      loading.value = false
    }
  }

  return { items, loading, filter, fetchList }
}
