import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import type { ImageResponse } from '@/types/api'
import { ArrowLeft } from 'lucide-react'
import MetadataPanel from '@/components/MetadataPanel'
import { useAppSelector } from '@/store/hooks'
import { fetchImageById } from '@/api/images'

export const Route = createFileRoute('/images/$imageId')({
  component: ImageDetail,
  head: () => ({
    meta: [{ title: 'image | the Grid '}]
  })
})

function ImageDetail() {
  const { imageId } = Route.useParams()
  const navigate = useNavigate()
  const [imageData, setImageData] = useState<ImageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Get images from Redux to enable navigation
  const { images } = useAppSelector((state) => state.images)
  const currentIndex = images.findIndex((img) => img.data.id === imageId)
  const hasPrevious = currentIndex > 0
  const hasNext = currentIndex >= 0 && currentIndex < images.length - 1

  useEffect(() => {
    const fetchImage = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchImageById(imageId)
        setImageData(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch image')
      } finally {
        setLoading(false)
      }
    }

    fetchImage()
  }, [imageId])

  // Keyboard navigation for slideshow
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' && hasPrevious) {
        const prevImage = images[currentIndex - 1]
        navigate({ to: '/images/$imageId', params: { imageId: prevImage.data.id } })
      } else if (event.key === 'ArrowRight' && hasNext) {
        const nextImage = images[currentIndex + 1]
        navigate({ to: '/images/$imageId', params: { imageId: nextImage.data.id } })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, images, hasPrevious, hasNext, navigate])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading image...</div>
      </div>
    )
  }

  if (error || !imageData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="text-xl text-red-600">Error: {error || 'Image not found'}</div>
        <Link to="/" className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700">
          <div className="flex items-center gap-2">
            <ArrowLeft size={20} />
            Back to Search
          </div>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 pt-6 pb-4 flex-shrink-0">
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
        >
          <ArrowLeft size={20} />
          Back to Search
        </Link>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        {/* Image viewer - left side */}
        <div className="flex-1 min-w-0">
          <div className="bg-white h-full">
            <div className="flex items-center justify-center bg-gray-100 p-4 h-full">
              <img
                src={imageData.data.source.secureUrl}
                alt={imageData.data.metadata.title || 'Image'}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          </div>
        </div>

        {/* Metadata panel - right side */}
        <MetadataPanel imageData={imageData.data} />
      </div>
    </div>
  )
}
