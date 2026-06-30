export type AiReadingState = 'loading' | 'ready' | 'error';

export interface AiReadingStatus {
  state: AiReadingState;
  message: string;
}
