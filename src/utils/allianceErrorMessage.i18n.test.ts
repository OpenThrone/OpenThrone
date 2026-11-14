import { describe, expect, it, mock } from 'bun:test';
import { createInstance } from 'i18next';

import de from '../../public/locales/de/alliances.json';
import esIntel from '../../public/locales/es/allianceIntel.json';
import es from '../../public/locales/es/alliances.json';

// The app's instance comes from next-i18next (appWithTranslation), which never
// registers it with react-i18next; mirror that with a plain instance here.
const instance = createInstance();
instance.init({
  lng: 'de',
  fallbackLng: 'en',
  initImmediate: false,
  resources: {
    de: { alliances: de },
    es: { alliances: es, allianceIntel: esIntel },
  },
});
mock.module('next-i18next', () => ({ i18n: instance }));

const { allianceErrorText } = await import('@/utils/allianceErrorMessage');

describe('allianceErrorText in the app', () => {
  it('translates a refusal with the next-i18next instance and no t', () => {
    instance.changeLanguage('de');
    expect(
      allianceErrorText({
        code: 'ALLIANCE_DUES_NEED_GOLD',
        error: 'You need 25,000 gold on hand to pay these dues',
        params: { pay: 25000 },
      }),
    ).toBe(
      'Sie brauchen 25.000 Gold in der Hand, um diese Beiträge zu zahlen.',
    );
  });

  it('follows the page language, level names included', () => {
    instance.changeLanguage('es');
    expect(
      allianceErrorText({
        code: 'ALLIANCE_FULL',
        error: 'The alliance is full',
        params: { count: 10, max: 10, level: 0 },
      }),
    ).toBe(
      'La alianza está llena (10/10 miembros en Campamento). Mejora el Salón de la alianza para ampliar el límite.',
    );
  });

  it('names the call type in the page language', () => {
    instance.changeLanguage('es');
    expect(
      allianceErrorText({
        code: 'ALLIANCE_CALL_DUPLICATE',
        error: 'A hit call on Dev Guard is already open',
        params: { name: 'Dev Guard', callType: 'HIT' },
      }),
    ).toBe('Ya hay una orden de Ataque abierta sobre Dev Guard.');
  });
});
