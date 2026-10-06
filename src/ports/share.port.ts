import type { VoiceMeme } from '../core/models';
export interface SharePort { share(meme: VoiceMeme): Promise<'shared'|'downloaded'> }
