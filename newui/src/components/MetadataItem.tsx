interface MetadataItemProps {
  label: string
  value: string | undefined | null
}

export default function MetadataItem({ label, value }: MetadataItemProps) {
  return (
    <div className="mb-4">
      <div className="text-xs font-semibold text-gray-500 uppercase mb-1">{label}</div>
      <div className={`text-sm ${value ? 'text-gray-900' : 'text-gray-400 italic'}`}>
        {value || 'Unknown'}
      </div>
    </div>
  )
}
