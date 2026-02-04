import type { ImageData } from '@/types/api'
import MetadataItem from './MetadataItem'

interface MetadataPanelProps {
  imageData: ImageData
}

export default function MetadataPanel({ imageData }: MetadataPanelProps) {
  return (
    <div className="lg:w-[300px] flex-shrink-0 overflow-y-auto">
      <div className="bg-white shadow-lg p-6">
        <h2 className="text-lg font-bold mb-6 pb-4 border-b border-gray-200">
          Image Details
        </h2>

        <MetadataItem label="Title" value={imageData.metadata.title} />

        <MetadataItem label="Description" value={imageData.metadata.description} />

        <MetadataItem
          label="Special Instructions"
          value={imageData.metadata.specialInstructions}
        />

        <MetadataItem
          label="Date Taken"
          value={
            imageData.metadata.dateTaken
              ? new Date(imageData.metadata.dateTaken).toLocaleString()
              : undefined
          }
        />

        <MetadataItem label="Byline" value={imageData.metadata.byline} />

        <MetadataItem label="Credit" value={imageData.metadata.credit} />

        <MetadataItem
          label="Location"
          value={
            imageData.metadata.city && imageData.metadata.country
              ? `${imageData.metadata.city}, ${imageData.metadata.country}`
              : imageData.metadata.city || imageData.metadata.country
          }
        />

        <MetadataItem label="Copyright" value={imageData.metadata.copyright} />

        <MetadataItem
          label="Date Uploaded"
          value={imageData.uploadTime ? new Date(imageData.uploadTime).toLocaleString() : undefined}
        />

        <MetadataItem label="Uploader" value={imageData.uploadedBy} />

        <MetadataItem label="Filename" value={imageData.uploadInfo.filename} />

        <MetadataItem
          label="Subjects"
          value={
            imageData.metadata.subjects && imageData.metadata.subjects.length > 0
              ? imageData.metadata.subjects.join(', ')
              : undefined
          }
        />
      </div>
    </div>
  )
}
