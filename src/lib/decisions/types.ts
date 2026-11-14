import { z } from 'zod';

/**
 * Typed decision requests and answers ("System One" wire format).
 *
 * One request carries a `state` (what to judge) and a set of named questions
 * of three kinds. Providers answer every question or the call is an error:
 * a partial or malformed response is never treated as a verdict.
 */

export const QUESTION_ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

const probability = z.number().min(0).max(1);

export const NoulQuestionSchema = z.object({
  type: z.literal('noul'),
  instructions: z.string().max(4000).optional(),
  criteria: z
    .object({ true: z.string().optional(), false: z.string().optional() })
    .optional(),
});

export const ChoiceQuestionSchema = z.object({
  type: z.literal('choice'),
  instructions: z.string().max(4000).optional(),
  criteria: z
    .record(z.string().min(1).max(100), z.string().nullable())
    .refine((options) => {
      const count = Object.keys(options).length;
      return count >= 1 && count <= 255;
    }, 'choice needs 1-255 options'),
});

export const ScoreQuestionSchema = z.object({
  type: z.literal('score'),
  instructions: z.string().max(4000).optional(),
  criteria: z.array(z.string()).min(1).max(255),
});

export const DecisionQuestionSchema = z.discriminatedUnion('type', [
  NoulQuestionSchema,
  ChoiceQuestionSchema,
  ScoreQuestionSchema,
]);

export type NoulQuestion = z.infer<typeof NoulQuestionSchema>;
export type ChoiceQuestion = z.infer<typeof ChoiceQuestionSchema>;
export type ScoreQuestion = z.infer<typeof ScoreQuestionSchema>;
export type DecisionQuestion = z.infer<typeof DecisionQuestionSchema>;
export type DecisionQuestions = Record<string, DecisionQuestion>;

/** What to judge: free text, or structured data. Never include identities. */
export type DecisionState =
  | string
  | number
  | boolean
  | null
  | DecisionState[]
  | { [key: string]: DecisionState };

export const NoulAnswerSchema = z.object({
  type: z.literal('noul'),
  noul: probability,
});

export const ChoiceAnswerSchema = z.object({
  type: z.literal('choice'),
  choice: z.string().min(1),
  confidence: probability.optional(),
  probabilities: z.record(z.string(), probability).optional(),
});

export const ScoreAnswerSchema = z.object({
  type: z.literal('score'),
  score: z.number().min(0).max(255),
  confidence: probability.optional(),
  legend: z.record(z.string(), z.string()).optional(),
  probabilities: z.record(z.string(), probability).optional(),
});

export const DecisionAnswerSchema = z.discriminatedUnion('type', [
  NoulAnswerSchema,
  ChoiceAnswerSchema,
  ScoreAnswerSchema,
]);

export type NoulAnswer = z.infer<typeof NoulAnswerSchema>;
export type ChoiceAnswer = z.infer<typeof ChoiceAnswerSchema>;
export type ScoreAnswer = z.infer<typeof ScoreAnswerSchema>;
export type DecisionAnswer = z.infer<typeof DecisionAnswerSchema>;
export type DecisionAnswers = Record<string, DecisionAnswer>;

/** Body returned by `POST {baseUrl}/v1/systemone`. */
export const SystemOneResponseSchema = z.object({
  model: z.string().optional(),
  answers: z.record(z.string(), DecisionAnswerSchema),
  usage: z
    .object({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
    })
    .optional(),
  latency_ms: z.number().optional(),
});

export interface DecisionRequest {
  state: DecisionState;
  questions: DecisionQuestions;
}

export interface DecisionResult {
  answers: DecisionAnswers;
  provider: string;
  model: string;
  latencyMs: number;
}

export interface DecisionProvider {
  readonly name: string;
  /** Configured model id; recorded with every verdict. */
  readonly model: string;
  decide(request: DecisionRequest): Promise<DecisionResult>;
}

/** Failure of a provider call. The message never contains credentials. */
export class DecisionProviderError extends Error {
  constructor(
    message: string,
    readonly kind: 'http' | 'timeout' | 'network' | 'invalid-response',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'DecisionProviderError';
  }
}

/**
 * Checks that a validated response answers exactly the asked questions with
 * the asked kinds, and that choices/scores stay inside their criteria.
 * Throws `DecisionProviderError` otherwise.
 */
export function assertAnswersMatchQuestions(
  questions: DecisionQuestions,
  answers: DecisionAnswers,
): void {
  for (const [id, question] of Object.entries(questions)) {
    const answer = answers[id];
    if (!answer)
      throw new DecisionProviderError(
        `Missing answer for question "${id}"`,
        'invalid-response',
      );
    if (answer.type !== question.type)
      throw new DecisionProviderError(
        `Answer for "${id}" has the wrong type`,
        'invalid-response',
      );
    if (
      question.type === 'choice' &&
      answer.type === 'choice' &&
      !Object.prototype.hasOwnProperty.call(question.criteria, answer.choice)
    )
      throw new DecisionProviderError(
        `Answer for "${id}" is not one of the options`,
        'invalid-response',
      );
    if (
      question.type === 'score' &&
      answer.type === 'score' &&
      answer.score > question.criteria.length - 1
    )
      throw new DecisionProviderError(
        `Score for "${id}" is above the highest level`,
        'invalid-response',
      );
  }
}
