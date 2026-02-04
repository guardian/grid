import { useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { getMetadataEditorUrl } from '@/config/clientConfig';
import { fetchImageById } from '@/api/images';
import { useAppDispatch } from '@/store/hooks';
import { updateImageData } from '@/store/imagesSlice';

interface MetadataItemProps {
  label: string;
  value: (string | undefined | null)[];
  fieldKey?: string;
  imageId?: string;
  editable?: boolean;
}

export default function MetadataItem({
  label,
  value,
  fieldKey,
  imageId,
  editable = false,
}: MetadataItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isHovered, setIsHovered] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const dispatch = useAppDispatch();

  const handleEdit = () => {
    const currentValue = Array.isArray(value)
      ? value.find((v) => v !== undefined && v !== null) || ''
      : value || '';
    setEditValue(currentValue);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue('');
  };

  const handleSave = async () => {
    if (!fieldKey || !imageId) return;

    setIsSaving(true);
    try {
      const url = getMetadataEditorUrl(`/metadata/${imageId}/metadata`);

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          data: {
            [fieldKey]: editValue,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Poll the API until the updated value is returned
      const maxAttempts = 10;
      const pollInterval = 500; // 500ms between polls
      let attempts = 0;
      let updated = false;

      while (attempts < maxAttempts && !updated) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        try {
          const imageResponse = await fetchImageById(imageId);
          const currentValue = imageResponse.data.metadata[fieldKey as keyof typeof imageResponse.data.metadata];
          
          if (currentValue === editValue) {
            // Value has been updated, update the store
            dispatch(updateImageData({
              imageId,
              data: imageResponse.data,
            }));
            updated = true;
          }
        } catch (pollError) {
          console.error('Polling error:', pollError);
        }
        
        attempts++;
      }

      if (!updated) {
        console.warn('Metadata update polling timed out, but changes may still be processing');
      }

      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save metadata:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };
    // Filter out undefined/null values
    const validValues = value.filter(
      (v): v is string => v !== undefined && v !== null,
    );

    // If no valid values, show Unknown
    if (validValues.length === 0) {
      return (
        <div
          className="mb-4 group relative"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
            {label}
          </div>
          {isEditing ? (
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="flex-1 text-sm border border-gray-300 rounded px-2 py-1"
                autoFocus
              />
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="p-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                title="Save"
              >
                <Check size={16} />
              </button>
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="p-1 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
                title="Cancel"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <>
              <div className="text-sm text-gray-400 italic">Unknown</div>
              {editable && isHovered && (
                <button
                  onClick={handleEdit}
                  className="absolute right-0 top-0 p-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
              )}
            </>
          )}
        </div>
      );
    }

    // If all values are the same, show that value
    const firstValue = value[0];
    if (value.every((v) => v === firstValue)) {
      return (
        <div
          className="mb-4 group relative"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
            {label}
          </div>
          {isEditing ? (
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="flex-1 text-sm border border-gray-300 rounded px-2 py-1"
                autoFocus
              />
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="p-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                title="Save"
              >
                <Check size={16} />
              </button>
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="p-1 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
                title="Cancel"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <>
              <div className="text-sm text-gray-900">{firstValue}</div>
              {editable && isHovered && (
                <button
                  onClick={handleEdit}
                  className="absolute right-0 top-0 p-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
              )}
            </>
          )}
        </div>
      );
    }

    // If values differ, show "Multiple <label>s"
    return (
      <div className="mb-4">
        <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
          {label}
        </div>
        <div className="text-sm text-gray-600 italic">
          Multiple {label.toLowerCase()}s
        </div>
      </div>
    );
}
