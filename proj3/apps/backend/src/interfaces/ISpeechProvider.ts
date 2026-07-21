export interface TranscriptSegment {
  text: string;
  start: number; // seconds
  end: number; // seconds
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptSegment[];
  language?: string;
  durationSeconds?: number;
}

/**
 * Abstraction over any speech-to-text provider (Groq Whisper today,
 * others pluggable later). Business logic must depend only on this
 * interface, never on a concrete provider or vendor SDK.
 */
export interface ISpeechProvider {
  /** Transcribes a single local audio file chunk. */
  transcribe(filePath: string, options?: { language?: string }): Promise<TranscriptionResult>;
}
