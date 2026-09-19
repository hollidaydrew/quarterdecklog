/* global __APP_VERSION__, __CHANGELOG__ */
// __APP_VERSION__ and __CHANGELOG__ are injected at build time by vite.config.js.
import { parseChangelog } from './changelog.js';

export const APP_VERSION = __APP_VERSION__;
export const RELEASES = parseChangelog(__CHANGELOG__);
export const CURRENT_RELEASE = RELEASES.find((r) => r.version === APP_VERSION) || null;
