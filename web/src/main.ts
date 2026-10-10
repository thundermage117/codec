import { mount } from 'svelte';
import App from './App.svelte';
import { installHoverHints } from './lib/hover-hint.js';
import './app.css';

mount(App, { target: document.body });
installHoverHints();
