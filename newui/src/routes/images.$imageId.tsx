import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import MetadataPanel from '@/components/MetadataPanel';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchSingleImage } from '@/store/imagesSlice';

export const Route = createFileRoute('/images/$imageId')({
  component: ImageDetail,
  head: () => ({
    meta: [{ title: 'image | the Grid ' }],
  }),
});

function ImageDetail() {
  const { imageId } = Route.useParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  // Get images from Redux store
  const { images, loading, error } = useAppSelector((state) => state.images);
  const currentIndex = images.findIndex((img) => img.data.id === imageId);
  const imageData = currentIndex >= 0 ? images[currentIndex].data : null;
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < images.length - 1;

  useEffect(() => {
    if (!imageData && !loading && !error) {
      dispatch(fetchSingleImage(imageId));
    }
  }, []);
  // Keyboard navigation for slideshow
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' && hasPrevious) {
        const prevImage = images[currentIndex - 1];
        navigate({
          to: '/images/$imageId',
          params: { imageId: prevImage.data.id },
        });
      } else if (event.key === 'ArrowRight' && hasNext) {
        const nextImage = images[currentIndex + 1];
        navigate({
          to: '/images/$imageId',
          params: { imageId: nextImage.data.id },
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, images, hasPrevious, hasNext, navigate]);

  if (!imageData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="text-xl text-red-600">Image not found</div>
        <Link
          to="/"
          className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
        >
          <div className="flex items-center gap-2">
            <ArrowLeft size={20} />
            Back to Search
          </div>
        </Link>
      </div>
    );
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
                src={imageData.source.secureUrl}
                alt={imageData.metadata.title || 'Image'}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          </div>
        </div>

        {/* Metadata panel - right side */}
        <MetadataPanel imageData={imageData} />
      </div>
    </div>
  );
}
