import {registerRoot} from 'remotion';
import {RemotionRoot} from './Root';
import {loadPixelFont} from './theme/fonts';

// Load every Fusion Pixel segment before the first frame (delayRender inside).
loadPixelFont();

registerRoot(RemotionRoot);
