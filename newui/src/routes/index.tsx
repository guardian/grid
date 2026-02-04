import { createFileRoute } from '@tanstack/react-router'
import ImageGrid from '@/components/ImageGrid'

interface SearchParams {
  query?: string
}

export const Route = createFileRoute('/')({
  component: ImageGrid,
  head: () => ({
    meta: [{ title: 'search | the Grid '}]
  }),
  validateSearch: (search: Record<string, unknown>): SearchParams => {
    return {
      query: typeof search.query === 'string' ? search.query : undefined,
    }
  },
})
