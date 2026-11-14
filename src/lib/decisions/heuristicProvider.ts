import { MODERATION_RECOMMENDED_ACTIONS } from './chatModerationQuestions';
import {
  type ChoiceQuestion,
  type DecisionAnswer,
  type DecisionAnswers,
  type DecisionProvider,
  type DecisionQuestion,
  type DecisionRequest,
  type DecisionResult,
  type DecisionState,
  type ScoreQuestion,
} from './types';

interface Pattern {
  readonly pattern: RegExp;
  readonly weight: number;
}

/** Insults and pressure to leave; each hit raises the harassment score. */
const HOSTILE_PATTERNS: readonly Pattern[] = [
  {
    pattern:
      /\b(worthless|pathetic|useless|idiot|moron|stupid|loser|trash|garbage|scum|clown)\b/i,
    weight: 0.45,
  },
  {
    pattern: /\b(nobody|no one) (wants|likes|needs|cares about) (you|u)\b/i,
    weight: 0.5,
  },
  {
    pattern: /\b(quit|leave|delete|uninstall) (the |this )?(game|account)\b/i,
    weight: 0.3,
  },
  { pattern: /\b(shut up|shut it|get lost|go away)\b/i, weight: 0.35 },
  {
    pattern: /\b(you|u|ur|you're|youre) (suck|are bad|are trash)\b/i,
    weight: 0.4,
  },
];

/** Threats and encouragement of self-harm: severe on their own. */
const SEVERE_PATTERNS: readonly Pattern[] = [
  { pattern: /\b(kill yourself|kys|go die|hope you die)\b/i, weight: 0.95 },
  {
    pattern:
      /\bi(?:'ll| will| am going to|'m going to) (hurt|find|kill|hunt) you\b/i,
    weight: 0.9,
  },
];

const SECOND_PERSON = /\b(you|u|ur|your|you're|youre)\b/i;
const LINK = /(https?:\/\/|www\.)\S+/gi;

const combine = (weights: number[]) =>
  1 - weights.reduce((rest, weight) => rest * (1 - weight), 1);

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export interface TextSignals {
  /** 0-1 probability the message harasses someone. */
  harassment: number;
  /** 0-1 probability the message is spam. */
  spam: number;
  /** 0-3 mean severity level (harmless .. severe abuse). */
  severity: number;
  severe: boolean;
}

/** Deterministic text analysis shared by every heuristic answer. */
export function analyzeModerationText(text: string): TextSignals {
  const hostile = HOSTILE_PATTERNS.filter(({ pattern }) => pattern.test(text));
  const severeHits = SEVERE_PATTERNS.filter(({ pattern }) =>
    pattern.test(text),
  );
  const directed = SECOND_PERSON.test(text) ? 1 : 0.6;
  const harassment = clamp01(
    combine([
      ...hostile.map(({ weight }) => weight * directed),
      ...severeHits.map(({ weight }) => weight),
    ]),
  );
  const severe = severeHits.length > 0;

  const letters = text.replace(/[^A-Za-z]/g, '');
  const upperShare =
    letters.length >= 12
      ? letters.replace(/[^A-Z]/g, '').length / letters.length
      : 0;
  const repeatedChars = /(.)\1{7,}/.test(text) ? 0.5 : 0;
  const linkCount = (text.match(LINK) ?? []).length;
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const distinct = new Set(words).size;
  const repeatedWords =
    words.length >= 6 && distinct / words.length < 0.4 ? 0.5 : 0;
  const spam = clamp01(
    combine([
      upperShare > 0.8 ? 0.4 : 0,
      repeatedChars,
      linkCount >= 2 ? 0.7 : linkCount === 1 ? 0.25 : 0,
      repeatedWords,
    ]),
  );

  const severity = severe
    ? Math.max(2.6, Math.min(3, harassment * 3))
    : Math.min(2.4, harassment * 2.4);
  return { harassment, spam, severity, severe };
}

const textOf = (state: DecisionState): string =>
  typeof state === 'string'
    ? state
    : state !== null && typeof state === 'object' && !Array.isArray(state)
      ? typeof state.message === 'string'
        ? state.message
        : JSON.stringify(state)
      : String(state);

function recommendedFrom(signals: TextSignals): {
  choice: string;
  probabilities: Record<string, number>;
} {
  const { harassment, severity, spam } = signals;
  const probabilities = { allow: 0, flag: 0, hide: 0 };
  if ((severity >= 2.5 && harassment >= 0.9) || spam >= 0.9) {
    probabilities.hide = Math.max(harassment, spam);
    probabilities.flag = 1 - probabilities.hide;
    return { choice: 'hide', probabilities };
  }
  if (harassment >= 0.5 || severity >= 1.2 || spam >= 0.6) {
    probabilities.flag = Math.max(harassment, spam, 0.6);
    probabilities.allow = 1 - probabilities.flag;
    return { choice: 'flag', probabilities };
  }
  probabilities.allow = 1 - Math.max(harassment, spam);
  probabilities.flag = 1 - probabilities.allow;
  return { choice: 'allow', probabilities };
}

function scoreAnswer(question: ScoreQuestion, value: number): DecisionAnswer {
  const top = question.criteria.length - 1;
  const score = Math.max(0, Math.min(top, value));
  return { type: 'score', score, confidence: 0.5 };
}

function choiceAnswer(
  id: string,
  question: ChoiceQuestion,
  signals: TextSignals,
): DecisionAnswer {
  const options = Object.keys(question.criteria);
  if (id === 'recommended_action') {
    const known = MODERATION_RECOMMENDED_ACTIONS.every((o) =>
      options.includes(o),
    );
    if (known) {
      const { choice, probabilities } = recommendedFrom(signals);
      return {
        type: 'choice',
        choice,
        confidence: probabilities[choice],
        probabilities,
      };
    }
  }
  return { type: 'choice', choice: options[0] };
}

export type HeuristicScorer = (
  id: string,
  question: DecisionQuestion,
  state: DecisionState,
) => DecisionAnswer | undefined;

/**
 * Offline baseline: no network, fully deterministic. Answers the chat
 * moderation question ids (`harassment`, `severity`, `recommended_action`,
 * `spam`) with a keyword/pattern scorer. Other noul questions answer 0, other
 * scores 0, other choices the first option, unless a `scorer` is supplied.
 */
export class HeuristicProvider implements DecisionProvider {
  readonly name = 'heuristic';

  readonly model = 'heuristic-v1';

  private readonly scorer?: HeuristicScorer;

  constructor(scorer?: HeuristicScorer) {
    this.scorer = scorer;
  }

  async decide(request: DecisionRequest): Promise<DecisionResult> {
    const started = Date.now();
    const signals = analyzeModerationText(textOf(request.state));
    const answers: DecisionAnswers = {};
    for (const [id, question] of Object.entries(request.questions)) {
      const custom = this.scorer?.(id, question, request.state);
      if (custom) {
        answers[id] = custom;
        continue;
      }
      if (question.type === 'noul') {
        const noul =
          id === 'harassment'
            ? signals.harassment
            : id === 'spam'
              ? signals.spam
              : 0;
        answers[id] = { type: 'noul', noul };
      } else if (question.type === 'score') {
        answers[id] = scoreAnswer(
          question,
          id === 'severity' ? signals.severity : 0,
        );
      } else {
        answers[id] = choiceAnswer(id, question, signals);
      }
    }
    return {
      answers,
      provider: this.name,
      model: this.model,
      latencyMs: Date.now() - started,
    };
  }
}
