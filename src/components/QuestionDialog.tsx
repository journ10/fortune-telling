import { useState } from 'react';
import type { QuestionType } from '../domain/types';
import ModalLayer from './ModalLayer';

const QUICK_QUESTIONS: Array<{ label: string; question: string; type: QuestionType }> = [
  { label: '今日运势', question: '今日运势', type: 'general' },
  { label: '最近事业', question: '最近事业怎么推进？', type: 'career' },
  { label: '感情走向', question: '这段关系接下来如何相处？', type: 'relationship' },
  { label: '财运机会', question: '最近财运机会是否值得把握？', type: 'wealth' },
  { label: '决定可行', question: '这个决定现在是否可行？', type: 'decision' }
];

interface QuestionDialogProps {
  onStart: (question: string, questionType: QuestionType) => void;
}

export default function QuestionDialog({ onStart }: QuestionDialogProps) {
  const [question, setQuestion] = useState('');
  const [questionType, setQuestionType] = useState<QuestionType>('general');
  const trimmedQuestion = question.trim();

  return (
    <ModalLayer
      title="所问之事"
      footer={
        <button
          className="primaryButton"
          type="button"
          disabled={!trimmedQuestion}
          onClick={() => onStart(trimmedQuestion, questionType)}
        >
          开始起卦
        </button>
      }
    >
      <div className="quickGrid" aria-label="快速问题">
        {QUICK_QUESTIONS.map((quickQuestion) => (
          <button
            className="quickButton"
            key={quickQuestion.type}
            type="button"
            onClick={() => {
              setQuestion(quickQuestion.question);
              setQuestionType(quickQuestion.type);
            }}
          >
            {quickQuestion.label}
          </button>
        ))}
      </div>

      <label className="formField" htmlFor="question-input">
        <span>所问之事</span>
        <textarea
          id="question-input"
          rows={4}
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value);
            if (questionType !== 'general') {
              setQuestionType('general');
            }
          }}
          placeholder="写下一个清晰、具体的问题"
        />
      </label>
    </ModalLayer>
  );
}
