// Optional question entry: a small overlay on the table, never a blocker.
// Casting works fully without a question.

import { useState } from 'react';
import type { QuestionType } from '../domain/types';

interface QuestionEntryProps {
  question: string;
  questionType: QuestionType;
  onSetQuestion: (question: string, questionType: QuestionType) => void;
}

const QUESTION_TYPE_OPTIONS: Array<{ value: QuestionType; label: string }> = [
  { value: 'general', label: '综合' },
  { value: 'career', label: '事业' },
  { value: 'relationship', label: '感情' },
  { value: 'wealth', label: '财运' },
  { value: 'decision', label: '抉择' }
];

export default function QuestionEntry({
  question,
  questionType,
  onSetQuestion
}: QuestionEntryProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(question);
  const [draftType, setDraftType] = useState<QuestionType>(questionType);

  const openPanel = () => {
    setDraft(question);
    setDraftType(questionType);
    setOpen(true);
  };

  const submit = () => {
    onSetQuestion(draft, draftType);
    setOpen(false);
  };

  return (
    <div className="questionEntry">
      {open ? (
        <div className="questionPanel" role="dialog" aria-label="填写所问（可选）">
          <label className="questionField" htmlFor="question-text">
            <span>所问何事（可不填）</span>
            <textarea
              id="question-text"
              rows={2}
              value={draft}
              placeholder="默念或写下你想问的事…"
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <label className="questionField" htmlFor="question-type">
            <span>类别</span>
            <select
              id="question-type"
              value={draftType}
              onChange={(event) => setDraftType(event.target.value as QuestionType)}
            >
              {QUESTION_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="questionActions">
            <button type="button" className="ghostButton" onClick={() => setOpen(false)}>
              取消
            </button>
            <button type="button" className="primaryButton" onClick={submit}>
              记下
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="ghostButton questionButton" onClick={openPanel}>
          {question ? `所问：${question.slice(0, 12)}${question.length > 12 ? '…' : ''}` : '问事（可选）'}
        </button>
      )}
    </div>
  );
}
