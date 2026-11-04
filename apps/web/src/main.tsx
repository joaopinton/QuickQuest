import '@fontsource-variable/fredoka';
import '@fontsource-variable/nunito';
import '@quickquest/ui';
import { render } from 'preact';
import { App } from './app';
import './site.css';

const root = document.getElementById('app');
if (root) render(<App />, root);
