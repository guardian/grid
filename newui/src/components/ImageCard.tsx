import { Link } from '@tanstack/react-router'
import type { Image } from '@/types/api'

interface ImageCardProps {
  image: Image
  isSelected?: boolean
  onSelect?: () => void
}

export default function ImageCard({ image, isSelected = false, onSelect }: ImageCardProps) {
  return (
    <div className="relative">
      <Link
        to="/images/$imageId"
        params={{ imageId: image.data.id }}
        className={`block bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-all ${
          isSelected ? 'border-4 border-blue-500' : ''
        }`}
      >
        <div className="bg-gray-100 flex items-center justify-center">
          <img
            src={image.data.thumbnail.secureUrl}
            alt={image.data.metadata.title || 'Image thumbnail'}
            className="w-full h-auto"
            loading="lazy"
          />
        </div>
        <div className="p-4">
          {image.data.metadata.title && (
            <h3 className="font-semibold text-sm mb-2 line-clamp-2">
              {image.data.metadata.title}
            </h3>
          )}
          {image.data.metadata.byline && (
            <p className="text-xs text-gray-600 mb-1">By {image.data.metadata.byline}</p>
          )}
          {image.data.metadata.credit && (
            <p className="text-xs text-gray-500">{image.data.metadata.credit}</p>
          )}
        </div>
      </Link>

      {/* Floating checkbox button */}
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onSelect?.()
        }}
        className="absolute top-2 left-2 p-2 bg-white rounded-lg shadow-md hover:bg-gray-100 transition-colors"
        aria-label="Select image"
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => {}}
          className="w-4 h-4 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            onSelect?.()
          }}
        />
      </button>
    </div>
  )
}
