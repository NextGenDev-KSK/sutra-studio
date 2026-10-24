import { useEffect, useState } from 'react';
import type { ViewKey } from '../domain/types';

// Hash routing keeps the app fully static (works from any host or sub-path).
//   #/e/<eventId>/<view>            workspace views
//   #/e/<eventId>/report/<kind>     print-ready reports
//   #/new                           event intake (optional ?template=<id>)

export type Route =
  | { name: 'view'; eventId: string; view: ViewKey }
  | { name: 'report'; eventId: string; kind: string }
  | { name: 'new'; templateId?: string }
  | { name: 'home' };

const VIEWS: ViewKey[] = ['overview', 'brief', 'budget', 'timeline', 'vendors', 'themes', 'guests', 'runofshow', 'team', 'exports'];

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const [path, query = ''] = clean.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'new') {
    const params = new URLSearchParams(query);
    return { name: 'new', templateId: params.get('template') ?? undefined };
  }
  if (parts[0] === 'e' && parts[1]) {
    if (parts[2] === 'report') return { name: 'report', eventId: parts[1], kind: parts[3] ?? 'brief' };
    const view = (VIEWS as string[]).includes(parts[2] ?? '') ? (parts[2] as ViewKey) : 'overview';
    return { name: 'view', eventId: parts[1], view };
  }
  return { name: 'home' };
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'view':
      return `#/e/${encodeURIComponent(route.eventId)}/${route.view}`;
    case 'report':
      return `#/e/${encodeURIComponent(route.eventId)}/report/${route.kind}`;
    case 'new':
      return route.templateId ? `#/new?template=${encodeURIComponent(route.templateId)}` : '#/new';
    default:
      return '#/';
  }
}

export function navigate(route: Route | string) {
  const href = typeof route === 'string' ? route : hrefFor(route);
  if (window.location.hash !== href) window.location.hash = href;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
