import { useState } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { useBatchUpdate } from '@/hooks/useBatchUpdate';
import { useFieldUpdateStatus } from '@/hooks/useFieldUpdateStatus';

interface MetadataItemProps {
  label: string;
  value: Array<string | undefined | null>;
  fieldKey?: string;
  imageIds: Array<string>;
  editable?: boolean;
}

export default function MetadataItem({
  label,
  value,
  fieldKey,
  imageIds,
  editable = false,
}: MetadataItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isHovered, setIsHovered] = useState(false);

  const { execute } = useBatchUpdate();
  const { isUpdating: isSaving, error: updateError } = useFieldUpdateStatus(
    imageIds,
    fieldKey ?? '',
  );

  const firstValue = value[0];
  const allValuesMatch = value.every((v) => v === firstValue);

  const handleEdit = () => {
    setEditValue(
      typeof firstValue === 'string' && allValuesMatch ? firstValue : '',
    );
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue('');
  };

  const handleSave = () => {
    if (!fieldKey || imageIds.length === 0) return;
    execute(`metadata.${fieldKey}`, fieldKey, imageIds, editValue);
    setIsEditing(false);
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
        <div className="flex items-center gap-1 mb-1">
          <div className="text-xs font-semibold text-gray-500 uppercase">
            {label}
          </div>
          {isSaving && (
            <Loader2 size={12} className="animate-spin text-blue-500" />
          )}
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
            {editable && isHovered && !isSaving && (
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
        {updateError && (
          <div className="text-xs text-red-500 mt-1">{updateError}</div>
        )}
      </div>
    );
  }

  // If all values are the same, show that value
  if (allValuesMatch) {
    return (
      <div
        className="mb-4 group relative"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="flex items-center gap-1 mb-1">
          <div className="text-xs font-semibold text-gray-500 uppercase">
            {label}
          </div>
          {isSaving && (
            <Loader2 size={12} className="animate-spin text-blue-500" />
          )}
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
            {editable && isHovered && !isSaving && (
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
        {updateError && (
          <div className="text-xs text-red-500 mt-1">{updateError}</div>
        )}
      </div>
    );
  }

  // If values differ, show "Multiple <label>s"
  return (
    <div
      className="mb-4 group relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center gap-1 mb-1">
        <div className="text-xs font-semibold text-gray-500 uppercase">
          {label}
        </div>
        {isSaving && (
          <Loader2 size={12} className="animate-spin text-blue-500" />
        )}
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
          <div className="text-sm text-gray-600 italic">
            Multiple {label.toLowerCase()}s
          </div>
          {editable && isHovered && !isSaving && (
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
      {updateError && (
        <div className="text-xs text-red-500 mt-1">{updateError}</div>
      )}
    </div>
  );
}
