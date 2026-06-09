import legacyHandler from '../../bank/withdraw';

/** Handles v1 bank withdraw API requests. */
export default function handler(req, res) {
  return legacyHandler(req, res);
}
