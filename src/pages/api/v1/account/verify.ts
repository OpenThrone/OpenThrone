import legacyHandler from '../../account/verify';

/** Handles v1 account verify API requests. */
export default function handler(req, res) {
  return legacyHandler(req, res);
}
