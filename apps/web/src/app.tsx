import { ToastHost } from '@quickquest/ui';
import { ErrorBoundary, lazy, LocationProvider, Route, Router } from 'preact-iso';
import { Home } from './screen/pages/Home';

// La home è nel bundle iniziale; il resto si carica a richiesta.
// Il controller è un chunk a parte: il telefono non scarica le pagine dello schermo.
const HowTo = lazy(() => import('./screen/pages/HowTo').then((m) => m.HowTo));
const Games = lazy(() => import('./screen/pages/Games').then((m) => m.Games));
const Lobby = lazy(() => import('./screen/pages/Lobby').then((m) => m.Lobby));
const NotFound = lazy(() => import('./screen/pages/NotFound').then((m) => m.NotFound));
const Controller = lazy(() => import('./controller/ControllerApp').then((m) => m.ControllerApp));

export function App() {
  return (
    <LocationProvider>
      <ErrorBoundary>
        <Router onRouteChange={() => window.scrollTo({ top: 0 })}>
          <Route path="/" component={Home} />
          <Route path="/come-si-gioca" component={HowTo} />
          <Route path="/giochi" component={Games} />
          <Route path="/stanza" component={Lobby} />
          <Route path="/c" component={Controller} />
          <Route path="/c/:code" component={Controller} />
          <Route default component={NotFound} />
        </Router>
      </ErrorBoundary>
      <ToastHost />
    </LocationProvider>
  );
}
