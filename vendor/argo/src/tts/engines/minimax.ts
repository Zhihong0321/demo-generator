import type { TTSEngine, TTSEngineOptions, TTSEngineMetadata } from '../engine.js';

export interface MiniMaxEngineOptions {
  apiKey?: string;
  model?: string;
  /** Override the API host, e.g. 'https://api-uw.minimax.io' for lower time-to-first-audio. */
  baseUrl?: string;
  /** Only needed on legacy accounts; appended as a ?GroupId= query param when set. */
  groupId?: string;
  voiceId?: string;
  /** Steers pronunciation for non-English text, e.g. 'Chinese', 'English', 'auto'. */
  languageBoost?: string;
  volume?: number;
  pitch?: number;
  sampleRate?: number;
  bitrate?: number;
}

interface MiniMaxT2AResponse {
  data?: { audio?: string; status?: number };
  extra_info?: { audio_length?: number; audio_format?: string };
  base_resp?: { status_code?: number; status_msg?: string };
  trace_id?: string;
}

export class MiniMaxEngine implements TTSEngine {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private groupId: string;
  private voiceId: string;
  private languageBoost?: string;
  private volume: number;
  private pitch: number;
  private sampleRate: number;
  private bitrate: number;

  constructor(options?: MiniMaxEngineOptions) {
    this.apiKey = options?.apiKey ?? '';
    this.model = options?.model ?? 'speech-02-hd';
    this.baseUrl = (options?.baseUrl ?? 'https://api.minimax.io').replace(/\/+$/, '');
    this.groupId = options?.groupId ?? '';
    this.voiceId = options?.voiceId ?? 'English_expressive_narrator';
    this.languageBoost = options?.languageBoost;
    this.volume = options?.volume ?? 1;
    this.pitch = options?.pitch ?? 0;
    this.sampleRate = options?.sampleRate ?? 32000;
    this.bitrate = options?.bitrate ?? 128000;
  }

  private resolveApiKey(): string {
    const key = this.apiKey || process.env.MINIMAX_API_KEY || '';
    if (!key) {
      throw new Error(
        'MiniMax TTS engine requires an API key. ' +
        'Set MINIMAX_API_KEY environment variable or pass apiKey option.'
      );
    }
    return key;
  }

  private resolveGroupId(): string {
    return this.groupId || process.env.MINIMAX_GROUP_ID || '';
  }

  describe(): TTSEngineMetadata {
    return { engine: 'minimax', model: this.model, voiceId: this.voiceId };
  }

  async generate(text: string, options: TTSEngineOptions): Promise<Buffer> {
    if (!text?.trim()) throw new Error('TTS text must not be empty');

    // GroupId is not required on current api.minimax.io accounts, but legacy
    // accounts reject the request without it.
    const groupId = this.resolveGroupId();
    const url = `${this.baseUrl}/v1/t2a_v2${groupId ? `?GroupId=${encodeURIComponent(groupId)}` : ''}`;

    const body: Record<string, unknown> = {
      model: this.model,
      text,
      stream: false,
      output_format: 'hex',
      voice_setting: {
        voice_id: options.voice ?? this.voiceId,
        speed: options.speed ?? 1,
        vol: this.volume,
        pitch: this.pitch,
      },
      audio_setting: {
        sample_rate: this.sampleRate,
        bitrate: this.bitrate,
        format: 'mp3',
        channel: 1,
      },
    };

    const languageBoost = options.lang ?? this.languageBoost;
    if (languageBoost) body.language_boost = languageBoost;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.resolveApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`MiniMax TTS request failed: HTTP ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as MiniMaxT2AResponse;

    // MiniMax returns HTTP 200 with an error payload, so the status code in the
    // body is the real success signal.
    const statusCode = json.base_resp?.status_code;
    if (statusCode !== 0) {
      throw new Error(
        `MiniMax TTS failed (status_code ${statusCode}): ${json.base_resp?.status_msg ?? 'unknown error'}` +
        (json.trace_id ? ` [trace_id ${json.trace_id}]` : '')
      );
    }

    const hex = json.data?.audio;
    if (!hex) {
      throw new Error('MiniMax TTS returned no audio data');
    }

    const mp3Buffer = Buffer.from(hex, 'hex');
    if (mp3Buffer.length === 0) {
      throw new Error('MiniMax TTS returned an empty audio buffer');
    }

    const { convertToWav } = await import('../engine.js');
    return convertToWav(mp3Buffer);
  }
}
