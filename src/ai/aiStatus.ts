export type AiReadingState = 'template' | 'loading' | 'ready' | 'error';

export interface AiReadingStatus {
  state: AiReadingState;
  message: string;
}

export const TEMPLATE_READING_STATUS: AiReadingStatus = {
  state: 'template',
  message: '当前使用传统模板解读；填写自己的 API Key 后可启用 AI 解卦。'
};
