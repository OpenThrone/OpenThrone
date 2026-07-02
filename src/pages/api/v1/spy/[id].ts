import legacyHandler from '../../spy/[id]';

/** Handles v1 spy ID API requests. */
export default function handler(req, res) {
  return legacyHandler(req, res);
}
