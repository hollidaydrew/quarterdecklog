/* global __APP_VERSION__, __CHANGELOG__, __CREDITS__ */
// __APP_VERSION__, __CHANGELOG__ and __CREDITS__ are injected at build time by
// vite.config.js from package.json, CHANGELOG.md and CREDITS.md.
import { parseChangelog } from './changelog.js';
import { parseCredits } from './credits.js';

export const APP_VERSION = __APP_VERSION__;
export const RELEASES = parseChangelog(__CHANGELOG__);
export const CURRENT_RELEASE = RELEASES.find((r) => r.version === APP_VERSION) || null;
export const CREDITS = parseCredits(__CREDITS__);
