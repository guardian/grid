import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useAppDispatch } from '@/store/hooks';
import { fetchImages } from '@/store/imagesSlice';

export default function Header() {
  const navigate = useNavigate();
  const routerState = useRouterState();
  const urlQuery =
    routerState.location.pathname === '/'
      ? (routerState.location.search as { query?: string })?.query
      : undefined;
  const [searchQuery, setSearchQuery] = useState(urlQuery || '');
  const dispatch = useAppDispatch();
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearchChange = (newQuery: string) => {
    setSearchQuery(newQuery);

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounced search
    debounceTimerRef.current = setTimeout(() => {
      // Update URL with query parameter
      navigate({
        to: '/',
        search: { query: newQuery || undefined },
      });

      // Trigger search with query at offset 0
      dispatch(fetchImages({ query: newQuery, offset: 0, length: 10 }));

      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 300);
  };

  return (
    <header className="p-4 flex items-center gap-4 bg-gray-800 text-white shadow-lg">
      <Link to="/" className="flex-shrink-0">
        <div className="text-xl font-semibold">Images</div>
      </Link>
      <div className="flex-1 flex items-center bg-gray-700 rounded-lg px-3 py-2">
        <Search size={20} className="text-gray-400 flex-shrink-0" />
        <input
          type="text"
          placeholder="Search images..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="ml-2 flex-1 bg-transparent outline-none text-white placeholder-gray-400"
        />
      </div>
    </header>
  );
}
