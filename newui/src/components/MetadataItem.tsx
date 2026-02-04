interface MetadataItemProps {
  label: string;
  value: (string | undefined | null)[] | string | undefined | null;
}

export default function MetadataItem({ label, value }: MetadataItemProps) {
  // If value is an array, handle multiple values
  if (Array.isArray(value)) {
    // Filter out undefined/null values
    const validValues = value.filter(
      (v): v is string => v !== undefined && v !== null,
    );

    // If no valid values, show Unknown
    if (validValues.length === 0) {
      return (
        <div className="mb-4">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
            {label}
          </div>
          <div className="text-sm text-gray-400 italic">Unknown</div>
        </div>
      );
    }

    // If all values are the same, show that value
    const firstValue = value[0];
    if (value.every((v) => v === firstValue)) {
      return (
        <div className="mb-4">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
            {label}
          </div>
          <div className="text-sm text-gray-900">{firstValue}</div>
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

  // Single value handling (for backward compatibility)
  return (
    <div className="mb-4">
      <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
        {label}
      </div>
      <div
        className={`text-sm ${value ? 'text-gray-900' : 'text-gray-400 italic'}`}
      >
        {value || 'Unknown'}
      </div>
    </div>
  );
}
