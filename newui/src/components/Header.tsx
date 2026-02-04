import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { Home, Menu, X, Search } from 'lucide-react'
import { useAppDispatch } from '@/store/hooks'
import { fetchImages } from '@/store/imagesSlice'

export default function Header() {
  const [isOpen, setIsOpen] = useState(false)
  const navigate = useNavigate()
  const urlSearch = useSearch({ from: '/' })
  const [searchQuery, setSearchQuery] = useState(urlSearch.query || '')
  const dispatch = useAppDispatch()
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isInitialMount = useRef(true)

  // Initialize search from URL on mount
  useEffect(() => {
    if (urlSearch.query && isInitialMount.current) {
      setSearchQuery(urlSearch.query)
      dispatch(fetchImages({ query: urlSearch.query, offset: 0, length: 10 }))
    }
    isInitialMount.current = false
  }, [])

  // Debounced search handler with URL update
  useEffect(() => {
    if (isInitialMount.current) return

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      // Update URL with query parameter
      navigate({
        to: '/',
        search: { query: searchQuery || undefined },
      })

      // Trigger search with query at offset 0
      dispatch(fetchImages({ query: searchQuery, offset: 0, length: 10 }))
      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 300)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [searchQuery, dispatch, navigate])

  return (
    <>
      <header className="p-4 flex items-center gap-4 bg-gray-800 text-white shadow-lg">
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
          aria-label="Open menu"
        >
          <Menu size={24} />
        </button>
        <Link to="/" className="flex-shrink-0">
          <div className="text-xl font-semibold">#</div>
        </Link>
        <div className="flex-1 flex items-center bg-gray-700 rounded-lg px-3 py-2">
          <Search size={20} className="text-gray-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search images..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ml-2 flex-1 bg-transparent outline-none text-white placeholder-gray-400"
          />
        </div>
      </header>

      <aside
        className={`fixed top-0 left-0 h-full w-80 bg-gray-900 text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold">Navigation</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <Link
            to="/"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2',
            }}
          >
            <Home size={20} />
            <span className="font-medium">Home</span>
          </Link>

          {/* Demo Links Start */}

          {/* Demo Links End */}
        </nav>
      </aside>
    </>
  )
}
