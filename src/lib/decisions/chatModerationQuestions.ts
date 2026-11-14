import type { DecisionQuestions } from './types';

export const CHAT_ROOM_TYPES = ['alliance', 'private', 'public'] as const;
export type ChatRoomType = (typeof CHAT_ROOM_TYPES)[number];

export const MODERATION_RECOMMENDED_ACTIONS = [
  'allow',
  'flag',
  'hide',
] as const;
export type ModerationRecommendedAction =
  (typeof MODERATION_RECOMMENDED_ACTIONS)[number];

/** Lowest to highest; the score answer is the mean level index. */
export const SEVERITY_LEVELS = [
  'harmless',
  'mildly hostile',
  'harassment',
  'severe abuse',
] as const;

/** Chat message text is capped before it leaves the process. */
export const MODERATION_TEXT_MAX_LENGTH = 2000;

export const CHAT_MODERATION_QUESTIONS: DecisionQuestions = {
  harassment: {
    type: 'noul',
    instructions:
      'Is this chat message harassment: insults, threats, or pressure aimed at another player?',
    criteria: {
      true: 'The message targets another player with insults, threats or pressure to leave.',
      false:
        'Ordinary game chat, including banter and strong opinions about the game.',
    },
  },
  severity: {
    type: 'score',
    instructions: 'How severe is the message for a fantasy strategy game chat?',
    criteria: [...SEVERITY_LEVELS],
  },
  recommended_action: {
    type: 'choice',
    instructions: 'What should chat moderation do with this message?',
    criteria: {
      allow: 'Leave the message alone.',
      flag: 'Queue it for a human moderator.',
      hide: 'Hide it until a human moderator reviews it.',
    },
  },
  spam: {
    type: 'noul',
    instructions:
      'Is this message spam: repeated text, advertising, link dumps or shouting?',
  },
};

/**
 * Builds the provider state. Only the message text and the room type go out:
 * no names, ids, emails or timestamps.
 */
export function buildModerationState(
  text: string,
  roomType: ChatRoomType,
): { message: string; context: string } {
  return {
    message: text.slice(0, MODERATION_TEXT_MAX_LENGTH),
    context: `${roomType} chat in a fantasy strategy game`,
  };
}
