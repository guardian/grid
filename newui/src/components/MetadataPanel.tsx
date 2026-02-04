import type { ImageData } from '@/types/api';
import MetadataItem from './MetadataItem';
import { LeasesDisplay } from './LeaseDisplay';

interface MetadataPanelProps {
  imageData: ImageData | ImageData[];
}

export default function MetadataPanel({ imageData }: MetadataPanelProps) {
  const imageDatas = Array.isArray(imageData) ? imageData : [imageData];
  const imageId = imageDatas[0]?.id;

  return (
    <div className="lg:w-[300px] flex-shrink-0 overflow-y-auto overflow-x-hidden">
      <div className="bg-white shadow-lg p-6">
        <h2 className="text-lg font-bold mb-6 pb-4 border-b border-gray-200">
          Image Details
        </h2>

        {/* Leases section */}
        <LeasesDisplay imageDatas={imageDatas} />

        <MetadataItem
          label="Title"
          value={imageDatas.map((img) => img.metadata.title)}
          fieldKey="title"
          imageId={imageId}
          editable
        />

        <MetadataItem
          label="Description"
          value={imageDatas.map((img) => img.metadata.description)}
          fieldKey="description"
          imageId={imageId}
          editable
        />

        <MetadataItem
          label="Special Instructions"
          value={imageDatas.map((img) => img.metadata.specialInstructions)}
          fieldKey="specialInstructions"
          imageId={imageId}
          editable
        />

        <MetadataItem
          label="Date Taken"
          value={imageDatas.map((img) =>
            img.metadata.dateTaken
              ? new Date(img.metadata.dateTaken).toLocaleString()
              : undefined,
          )}
        />

        <MetadataItem
          label="Byline"
          value={imageDatas.map((img) => img.metadata.byline)}
          fieldKey="byline"
          imageId={imageId}
          editable
        />

        <MetadataItem
          label="Credit"
          value={imageDatas.map((img) => img.metadata.credit)}
          fieldKey="credit"
          imageId={imageId}
          editable
        />

        <MetadataItem
          label="Location"
          value={imageDatas.map((img) =>
            img.metadata.city && img.metadata.country
              ? `${img.metadata.city}, ${img.metadata.country}`
              : img.metadata.city || img.metadata.country,
          )}
        />

        <MetadataItem
          label="Copyright"
          value={imageDatas.map((img) => img.metadata.copyright)}
          fieldKey="copyright"
          imageId={imageId}
          editable
        />

        <MetadataItem
          label="Date Uploaded"
          value={imageDatas.map((img) =>
            img.uploadTime
              ? new Date(img.uploadTime).toLocaleString()
              : undefined,
          )}
        />

        <MetadataItem
          label="Uploader"
          value={imageDatas.map((img) => img.uploadedBy)}
        />

        <MetadataItem
          label="Filename"
          value={imageDatas.map((img) => img.uploadInfo.filename)}
        />

        <MetadataItem
          label="Subjects"
          value={imageDatas.map((img) =>
            img.metadata.subjects && img.metadata.subjects.length > 0
              ? img.metadata.subjects.join(', ')
              : undefined,
          )}
        />
      </div>
    </div>
  );
}
