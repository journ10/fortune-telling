import { getHexagramEntry } from '../data/hexagramCatalog';
import { getChangedPattern, getHexagramByLines, getMovingLinePositions, getOriginalPattern } from './hexagrams';
import type { Casting, Interpretation, QuestionType } from './types';

const QUESTION_CONTEXT: Record<QuestionType, string> = {
  general: '放在整体运势里看',
  career: '放在事业推进里看',
  relationship: '放在关系互动里看',
  wealth: '放在财务机会里看',
  decision: '放在决策取舍里看'
};

const TAG_ADVICE: Record<string, string> = {
  蓄势: '动爻提示还在蓄势，先补足准备再推进。',
  守中: '动爻提示守住中线，先校准关系、资源和承诺。',
  转折: '动爻提示正处转折，先确认事实变化再调整方向。',
  进退: '动爻提示权衡进退，保留可回撤的选择。',
  成局: '动爻提示条件正在成局，适合整合资源但不宜冒进。',
  收束: '动爻提示及时收束，把结果、边界和后续责任说清楚。',
  阳爻: '动爻偏阳，行动要主动但保留边界。',
  阴爻: '动爻偏阴，先承接现状再寻找发力点。'
};

const TAG_PRIORITY = ['蓄势', '守中', '转折', '进退', '成局', '收束', '阳爻', '阴爻'];

export function createInterpretation(casting: Casting): Interpretation {
  const originalRef = getHexagramByLines(getOriginalPattern(casting.lines));
  const changedRef = getHexagramByLines(getChangedPattern(casting.lines));
  const originalHexagram = getHexagramEntry(originalRef.id);
  const movingPositions = getMovingLinePositions(casting.lines);
  const movingLines = movingPositions.map((position) => {
    const line = originalHexagram.lines.find((candidate) => candidate.position === position);

    if (!line) {
      throw new Error(`Missing line ${position} for hexagram ${originalHexagram.id}`);
    }

    return line;
  });
  const changedHexagram = movingLines.length > 0 ? getHexagramEntry(changedRef.id) : null;
  const context = QUESTION_CONTEXT[casting.questionType];
  const movingText =
    movingLines.length > 0
      ? `动爻落在${movingLines.map((line) => line.title).join('、')}，变化关键是${movingLines
          .map((line) => line.summary)
          .join('；')}。`
      : '本卦无动爻，以本卦卦辞和整体卦意为主。';
  const changedText = changedHexagram
    ? `变卦为「${changedHexagram.name}」，趋势会转向：${changedHexagram.summary}`
    : '';

  return {
    question: casting.question,
    questionType: casting.questionType,
    originalHexagram,
    changedHexagram,
    movingLines,
    headline: buildHeadline(casting.questionType, originalHexagram.keywords, movingLines.length),
    plainText: [
      `${context}，本卦为「${originalHexagram.name}」：${originalHexagram.summary}`,
      movingText,
      changedText
    ]
      .filter(Boolean)
      .join('\n'),
    advice: buildAdvice(casting.questionType, originalHexagram.keywords, movingLines.flatMap((line) => line.tags)),
    basis: buildBasis(originalHexagram, movingLines, changedHexagram)
  };
}

function buildHeadline(questionType: QuestionType, keywords: string[], movingCount: number): string {
  const prefix: Record<QuestionType, string> = {
    general: '整体宜看清节奏',
    career: '事业宜稳中推进',
    relationship: '关系宜先稳住互动',
    wealth: '财务宜重视风险边界',
    decision: '决策宜先定原则'
  };

  return `${prefix[questionType]}：${keywords.slice(0, 2).join('、')}，${movingCount > 0 ? '局势有变化点' : '局势偏稳定'}`;
}

function buildAdvice(questionType: QuestionType, keywords: string[], tags: string[]): string[] {
  const shared = [
    `围绕「${keywords.slice(0, 2).join('、')}」调整行动，不做绝对化判断。`,
    buildTagAdvice(tags)
  ];

  const contextual: Record<QuestionType, string> = {
    general: '今天适合把注意力放在可控事项上。',
    career: '事业上先明确资源、责任和下一步交付。',
    relationship: '关系里优先观察对方反馈，少用猜测代替沟通。',
    wealth: '财务上先守住本金和现金流，再看机会。',
    decision: '决策前列出不可接受的代价，再比较收益。'
  };

  return [...shared, contextual[questionType]];
}

function buildTagAdvice(tags: string[]): string {
  const tag = TAG_PRIORITY.find((candidate) => tags.includes(candidate));

  return tag ? TAG_ADVICE[tag] : '本卦无动爻，先做小步验证，再扩大投入。';
}

function buildBasis(
  originalHexagram: Interpretation['originalHexagram'],
  movingLines: Interpretation['movingLines'],
  changedHexagram: Interpretation['changedHexagram']
): string[] {
  return [
    `本卦卦辞：${originalHexagram.judgment}`,
    `本卦象辞：${originalHexagram.image}`,
    ...movingLines.map((line) => `动爻爻辞：${line.title}，${line.original}`),
    changedHexagram ? `变卦卦辞：${changedHexagram.judgment}` : '本卦无动爻：不另取变卦'
  ];
}
