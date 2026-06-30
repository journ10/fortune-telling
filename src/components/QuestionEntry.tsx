import { useState } from 'react';
import type { QuestionType } from '../domain/types';

const QUICK_QUESTIONS: Array<{ label: string; question: string; type: QuestionType }> = [
  { label: '今日运势', question: '今日运势', type: 'general' },
  { label: '最近事业', question: '最近事业怎么推进？', type: 'career' },
  { label: '感情走向', question: '这段关系接下来如何相处？', type: 'relationship' },
  { label: '财运机会', question: '最近财运机会是否值得把握？', type: 'wealth' },
  { label: '决定可行', question: '这个决定现在是否可行？', type: 'decision' }
];

interface QuestionEntryProps {
  onStart: (question: string, questionType: QuestionType) => void;
}

export default function QuestionEntry({ onStart }: QuestionEntryProps) {
  const [question, setQuestion] = useState('');
  const [questionType, setQuestionType] = useState<QuestionType>('general');
  const trimmedQuestion = question.trim();

  return (
    <section className="questionPanel" aria-labelledby="question-title">
      <p className="eyebrow">摄像头手势六爻</p>
      <h1 id="question-title">三钱成卦</h1>
      <p className="intro">输入所问之事，以六次掷钱完成一卦。</p>

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

      <label className="questionLabel" htmlFor="question-input">
        所问之事
      </label>
      <textarea
        className="questionInput"
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

      <button
        className="primaryButton"
        type="button"
        disabled={!trimmedQuestion}
        onClick={() => onStart(trimmedQuestion, questionType)}
      >
        开始起卦
      </button>
    </section>
  );
}
