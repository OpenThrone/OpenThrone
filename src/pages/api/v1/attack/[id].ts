import legacyHandler from '../../attack/[id]';

/** Handles v1 attack ID API requests. */
export default function handler(req, res) {
  return legacyHandler(req, res);
}
