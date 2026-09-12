import { useEffect, useState } from 'react';
import { Landing } from './ui/Landing';
import { Workspace } from './ui/Workspace';

type Route = { page: 'landing' } | { page: 'demo'; share?: string; section?: string };

function parse(hash: string): Route {
  const h = hash.replace(/^#/, '');
  if (h.startsWith('/demo')) {
    const qs = h.split('?')[1] ?? '';
    const params = new URLSearchParams(qs);
    return { page: 'demo', share: params.get('g') ?? undefined, section: params.get('section') ?? undefined };
  }
  return { page: 'landing' };
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    document.title = route.page === 'demo' ? 'Graphsmith demo workspace' : 'Graphsmith';
  }, [route.page]);
  if (route.page === 'demo') return <Workspace shareToken={route.share} key={route.share ?? 'local'} />;
  return <Landing />;
}
