import legacyHandler from '../../../alliances/bank/withdraw';

/** Handles v1 alliances bank withdraw API requests. */
export default function handler(req, res) {
  return legacyHandler(req, res);
}
