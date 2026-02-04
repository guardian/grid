import { Link } from '@tanstack/react-router'
import type { Image } from '@/types/api'

interface ImageCardProps {
  image: Image
}

export default function ImageCard({ image }: ImageCardProps) {
  return (
    <Link
      to="/images/$imageId"
      params={{ imageId: image.data.id }}
      className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow flex flex-col"
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
  )
}
