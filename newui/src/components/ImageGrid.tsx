import { useEffect, useRef, useState } from 'react';
import { useSearch } from '@tanstack/react-router';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchImages } from '@/store/imagesSlice';
import ImageCard from './ImageCard';
import MetadataPanel from './MetadataPanel';

export default function ImageGrid() {
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(
    new Set(),
  );
  const dispatch = useAppDispatch();
  const urlSearch = useSearch({ from: '/' });
  const { images, offset, total, query, loading, loadingMore, error } =
    useAppSelector((state) => state.images);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Get selected images data for metadata panel
  const selectedImages = Array.from(selectedImageIds)
    .map((id) => images.find((img) => img.data.id === id))
    .filter((img): img is (typeof images)[0] => img !== undefined)
    .map((img) => img.data);

  // Initial load - only if not already loaded by Header
  useEffect(() => {
    if (!loading && !error) {
      dispatch(fetchImages({ query: urlSearch.query, offset: 0, length: 10 }));
    }
  }, []);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          !loading &&
          !loadingMore &&
          offset < total
        ) {
          dispatch(fetchImages({ query, offset, length: 10 }));
        }
      },
      { threshold: 0.1 },
    );

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [query, offset, total, loading, loadingMore, dispatch]);

  if (loading && images.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading images...</div>
      </div>
    );
  }

  if (error && images.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-red-600">Error: {error}</div>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">No images found</div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main content area with grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto p-6">
          <div className="mb-6">
            <h1 className="text-3xl font-bold">Images</h1>
            <p className="text-gray-600">
              Showing {images.length} of {total} images
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {images.map((image) => (
              <ImageCard
                key={image.data.id}
                image={image}
                isSelected={selectedImageIds.has(image.data.id)}
                onSelect={() => {
                  const newSelected = new Set(selectedImageIds);
                  if (newSelected.has(image.data.id)) {
                    newSelected.delete(image.data.id);
                  } else {
                    newSelected.add(image.data.id);
                  }
                  setSelectedImageIds(newSelected);
                }}
              />
            ))}
          </div>

          {/* Sentinel element for infinite scroll */}
          <div ref={sentinelRef} className="mt-12 flex justify-center">
            {loadingMore && (
              <div className="text-gray-500">
                <div className="inline-block">
                  <div className="animate-spin h-6 w-6 border-2 border-gray-400 border-t-gray-600 rounded-full"></div>
                </div>
                <p className="mt-2">Loading more images...</p>
              </div>
            )}
            {!loadingMore && offset >= total && images.length > 0 && (
              <p className="text-gray-500">No more images to load</p>
            )}
          </div>
        </div>
      </div>

      {/* Metadata panel - always reserve space to prevent layout shift */}
      <div className="w-80 border-l border-gray-200 overflow-y-auto">
        {selectedImages.length > 0 && (
          <MetadataPanel imageData={selectedImages} />
        )}
      </div>
    </div>
  );
}
