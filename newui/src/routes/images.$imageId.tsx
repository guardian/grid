import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import type { ImageResponse } from '@/types/api'
import { ArrowLeft } from 'lucide-react'
import MetadataItem from '@/components/MetadataItem'
import { useAppSelector } from '@/store/hooks'

export const Route = createFileRoute('/images/$imageId')({
  component: ImageDetail,
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
        const response = await fetch(
          `https://api.media.local.dev-gutools.co.uk/images/${imageId}`,
          { credentials: 'include' }
        )
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const data: ImageResponse = await response.json()
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
        <div className="lg:w-[300px] flex-shrink-0 overflow-y-auto">
          <div className="bg-white shadow-lg p-6">
            <h2 className="text-lg font-bold mb-6 pb-4 border-b border-gray-200">
              Image Details
            </h2>

            <MetadataItem label="Title" value={imageData.data.metadata.title} />

            <MetadataItem label="Description" value={imageData.data.metadata.description} />

            <MetadataItem
              label="Special Instructions"
              value={imageData.data.metadata.specialInstructions}
            />

            <MetadataItem
              label="Date Taken"
              value={
                imageData.data.metadata.dateTaken
                  ? new Date(imageData.data.metadata.dateTaken).toLocaleString()
                  : undefined
              }
            />

            <MetadataItem label="Byline" value={imageData.data.metadata.byline} />

            <MetadataItem label="Credit" value={imageData.data.metadata.credit} />

            <MetadataItem
              label="Location"
              value={
                imageData.data.metadata.city && imageData.data.metadata.country
                  ? `${imageData.data.metadata.city}, ${imageData.data.metadata.country}`
                  : imageData.data.metadata.city || imageData.data.metadata.country
              }
            />

            <MetadataItem label="Copyright" value={imageData.data.metadata.copyright} />

            <MetadataItem
              label="Date Uploaded"
              value={
                imageData.data.uploadTime
                  ? new Date(imageData.data.uploadTime).toLocaleString()
                  : undefined
              }
            />

            <MetadataItem label="Uploader" value={imageData.data.uploadedBy} />

            <MetadataItem label="Filename" value={imageData.data.uploadInfo.filename} />

            <MetadataItem
              label="Subjects"
              value={
                imageData.data.metadata.subjects && imageData.data.metadata.subjects.length > 0
                  ? imageData.data.metadata.subjects.join(', ')
                  : undefined
              }
            />
          </div>
        </div>
      </div>
    </div>
  )
}
