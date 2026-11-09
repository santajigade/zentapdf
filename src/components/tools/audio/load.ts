import { decodeFile, encodeWav, ext, type Pcm } from '../../../lib/audio/core';
import type { Status } from '../../../lib/audio/ffmpeg';

/** Decode a file and get a URL the browser can play (the original when possible, else a WAV copy). */
export async function loadAudio(file: File, status?: Status): Promise<{ pcm: Pcm; url: string }> {
  const pcm = await decodeFile(file, file.name, status);
  const a = document.createElement('audio');
  const type = file.type || ({ mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac', opus: 'audio/ogg', webm: 'audio/webm' } as Record<string, string>)[ext(file.name)] || '';
  const playable = type && a.canPlayType(type) !== '';
  const url = URL.createObjectURL(playable ? file : encodeWav(pcm));
  return { pcm, url };
}
