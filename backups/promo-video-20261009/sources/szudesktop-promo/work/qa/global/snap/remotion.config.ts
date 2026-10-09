// Remotion CLI config (used by `npx remotion studio|render|still`).
// The scripted renders in scripts/*.mjs pass the same values explicitly.
import {Config} from '@remotion/cli/config';

// Render with the locally installed Chrome 154 (no Chrome-for-Testing download).
// chrome-for-testing mode makes Remotion pass --headless=new, which the full
// Chrome binary supports; the default (headless-shell) would pass --headless=old.
Config.setBrowserExecutable('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
Config.setChromeMode('chrome-for-testing');
Config.setChromiumOpenGlRenderer('angle');

Config.setEntryPoint('src/index.ts');
// PNG frames: JPEG would smear the pixel art before x264 even sees it.
Config.setVideoImageFormat('png');
Config.setStillImageFormat('png');
Config.setCodec('h264');
Config.setPixelFormat('yuv420p');
Config.setCrf(14);
Config.setX264Preset('slow');
Config.setAudioCodec('aac');
Config.setAudioBitrate('256k');
Config.setEnforceAudioTrack(true);
Config.setConcurrency(8);
Config.setOverwriteOutput(true);
Config.setDelayRenderTimeoutInMilliseconds(60000);
// `npm run studio` must not pop a browser window on the user's screen; open the printed URL yourself.
Config.setShouldOpenBrowser(false);
