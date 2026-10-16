import legacyHandler from '../../../alliances/bank/deposit';

/** Handles v1 alliances bank deposit API requests. */
export default function handler(req, res) {
  return legacyHandler(req, res);
}
