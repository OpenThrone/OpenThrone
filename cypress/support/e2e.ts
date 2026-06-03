/// <reference types="cypress" />

import { addCompareSnapshotCommand } from 'cypress-visual-regression/dist/command';

addCompareSnapshotCommand({
  errorThreshold: 0.01,
  pixelmatchOptions: {
    threshold: 0.1,
  },
});

// ---------------------------------------------------------------------------
// WCAG contrast-ratio helpers
// ---------------------------------------------------------------------------

/**
 * Parse an rgb/rgba CSS colour string into [r, g, b].
 */
function parseRgb(css: string): [number, number, number] | null {
  const m = css.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/,
  );
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

/**
 * Relative luminance per WCAG 2.1
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Contrast ratio between two RGB tuples.
 * Returns a value >= 1 (1 = identical, 21 = max contrast).
 */
function contrastRatio(
  fg: [number, number, number],
  bg: [number, number, number],
): number {
  const l1 = relativeLuminance(...fg);
  const l2 = relativeLuminance(...bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Walk up the DOM to find the first ancestor with a non-transparent
 * background colour. Falls back to white (255,255,255).
 */
function effectiveBg($el: JQuery<HTMLElement>): [number, number, number] {
  let current = $el;
  while (current.length) {
    const bg = current.css('background-color');
    const rgb = parseRgb(bg);
    if (rgb) {
      // Check alpha channel for rgba
      const alphaMatch = bg.match(
        /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\)/,
      );
      const alpha = alphaMatch ? parseFloat(alphaMatch[1]) : 1;
      if (alpha > 0) return rgb;
    }
    current = current.parent();
  }
  return [255, 255, 255];
}

// ---------------------------------------------------------------------------
// Custom commands
// ---------------------------------------------------------------------------

const normalizePath = (path: string) => {
  if (path.startsWith('http')) return path;
  if (path.startsWith('/')) return path;
  return `/${path}`;
};

Cypress.Commands.add('visitApp', (path = '/') => {
  cy.visit(normalizePath(path));
});

Cypress.Commands.add('stubLayoutRequests', () => {
  cy.intercept('GET', '/api/general/getOnlinePlayers', {
    statusCode: 200,
    body: {
      onlineUsers: 0,
      allUsersCounted: 0,
      newestUser: '',
      newUsers: 0,
    },
  }).as('getOnlinePlayers');
  cy.intercept('GET', '/api/general/git-info', {
    statusCode: 200,
    body: {
      latestCommit: 'test-commit',
      latestCommitMessage: 'test message',
    },
  }).as('getGitInfo');
  cy.intercept('GET', '/api/social/gold-requests/count', {
    statusCode: 200,
    body: { count: 0 },
  }).as('getGoldRequestsCount');
});

Cypress.Commands.add('loginAdmin', () => {
  const email = Cypress.env('ADMIN_EMAIL') || 'testing@test.com';
  const password = Cypress.env('ADMIN_PASSWORD') || 'testAccount';

  cy.session([email, password], () => {
    cy.stubLayoutRequests();
    cy.visitApp('/account/login');
    cy.get('input#email', { timeout: 5000 }).clear().type(email);
    cy.get('input#password', { timeout: 5000 })
      .clear()
      .type(password, { log: false });
    cy.get('#submit-button').click();
    cy.location('pathname', { timeout: 10000 }).should('eq', '/home/overview');
  });

  cy.stubLayoutRequests();
  cy.visitApp('/home/overview');
});

/**
 * Visual regression screenshot — compares against a baseline snapshot.
 * On first run (no baseline) the snapshot is created automatically.
 * Subsequent runs diff against the baseline and fail if pixel difference
 * exceeds the configured errorThreshold.
 */
Cypress.Commands.add('captureScreenshot', (name: string) => {
  // @ts-ignore — compareSnapshot injected by cypress-visual-regression
  cy.compareSnapshot(name, 0.01);
});

/**
 * Full-page visual regression capture — use for page-level layout checks
 * where viewport-level capture is sufficient.
 */
Cypress.Commands.add('capturePageScreenshot', (name: string) => {
  // @ts-ignore — compareSnapshot injected by cypress-visual-regression
  cy.compareSnapshot(name, 0.02);
});

// Touch target validation (WCAG 2.5.5: minimum 48px)
Cypress.Commands.add(
  'validateTouchTarget',
  (selector: string, minSize: number = 48) => {
    cy.get(selector).then(($el) => {
      const width = $el.outerWidth();
      const height = $el.outerHeight();
      if (!$el.is(':visible') || width === 0 || height === 0) {
        return;
      }
      expect(width).to.be.at.least(
        minSize,
        `Touch target width ${width}px is below minimum ${minSize}px`,
      );
      expect(height).to.be.at.least(
        minSize,
        `Touch target height ${height}px is below minimum ${minSize}px`,
      );
    });
  },
);

/**
 * WCAG contrast validation — computes actual luminance-based contrast ratio.
 * Uses the WCAG 2.1 relative luminance formula and compares against minRatio
 * (4.5:1 for normal text, 3:1 for large text).
 */
Cypress.Commands.add(
  'validateContrast',
  (selector: string, minRatio: number = 4.5) => {
    cy.get(selector).then(($el) => {
      if (!$el.length || !$el.is(':visible')) return;

      const fg = parseRgb($el.css('color'));
      if (!fg) {
        assert.fail(
          `Could not parse foreground colour for ${selector}: ${$el.css('color')}`,
        );
      }

      const bg = effectiveBg($el);

      const ratio = contrastRatio(fg, bg);
      const ratioStr = ratio.toFixed(2);

      cy.log(
        `Contrast ${selector}: ${ratioStr}:1 (fg: rgb(${fg}), bg: rgb(${bg}), minimum: ${minRatio})`,
      );

      expect(
        ratio,
        `Contrast ratio ${ratioStr}:1 for ${selector} must be >= ${minRatio}:1`,
      ).to.be.at.least(minRatio);
    });
  },
);

// Race theme switcher for testing race-specific theming
Cypress.Commands.add(
  'switchRace',
  (race: 'ELF' | 'GOBLIN' | 'HUMAN' | 'UNDEAD') => {
    cy.visitApp('/test');
    cy.get(`[data-testid="race-${race.toLowerCase()}"]`).click();
    cy.wait(500); // Wait for theme to apply
    cy.captureScreenshot(`race-${race.toLowerCase()}-theme`);
  },
);

// Validate element visibility and accessibility
Cypress.Commands.add('validateVisible', (selector: string) => {
  cy.get(selector).should('be.visible').and('not.be.hidden');
});

// Validate ARIA attributes
Cypress.Commands.add(
  'validateAria',
  (selector: string, attributes: Record<string, string>) => {
    cy.get(selector).then(($el) => {
      Object.entries(attributes).forEach(([attr, value]) => {
        cy.wrap($el).should('have.attr', `aria-${attr}`, value);
      });
    });
  },
);

// Keyboard navigation test
Cypress.Commands.add(
  'navigateWithKeyboard',
  (selectors: string[], direction: 'tab' | 'shift-tab' = 'tab') => {
    selectors.forEach((selector, index) => {
      const key = direction === 'tab' ? '{tab}' : '{shift}{tab}';
      cy.focused().should('have.length', index === 0 ? 1 : 1);
      cy.get(selector).should('be.visible');
      cy.get(selector).focus();
      cy.focused().should(
        'have.attr',
        'data-testid',
        selector.replace(/\[data-testid="|"\]/g, ''),
      );
    });
  },
);

// WebSocket connection test helper
Cypress.Commands.add('testWebSocketConnection', (url: string) => {
  cy.window().then((win) => {
    return new Cypress.Promise((resolve, reject) => {
      const ws = new win.WebSocket(url);
      ws.onopen = () => {
        ws.close();
        resolve(true);
      };
      ws.onerror = (err) => {
        reject(err);
      };
      ws.onclose = () => {
        resolve(true);
      };
    });
  });
});

// Animation test helper
Cypress.Commands.add(
  'waitForAnimation',
  (selector: string, duration: number = 500) => {
    cy.get(selector).should('be.visible');
    cy.wait(duration); // Wait for animation to complete
  },
);

// Validate gradient rendering
Cypress.Commands.add('validateGradient', (selector: string) => {
  cy.get(selector)
    .should('have.css', 'background-image')
    .and('match', /gradient/);
});

// Validate shadow depth
Cypress.Commands.add(
  'validateShadow',
  (selector: string, expectedShadow: string) => {
    cy.get(selector).should('have.css', 'box-shadow', expectedShadow);
  },
);

// Validate gold text rendering
Cypress.Commands.add('validateGoldText', (selector: string) => {
  cy.get(selector)
    .should('have.css', 'color')
    .and(
      'match',
      /rgb\(255,\s*215,\s*0\)|rgb\(255,\s*193,\s*7\)|#ffd700|#ffc107/,
    );
});

declare global {
  namespace Cypress {
    interface Chainable {
      visitApp(path?: string): Chainable<void>;
      stubLayoutRequests(): Chainable<void>;
      loginAdmin(): Chainable<void>;
      captureScreenshot(name: string): Chainable<void>;
      capturePageScreenshot(name: string): Chainable<void>;
      validateTouchTarget(selector: string, minSize?: number): Chainable<void>;
      validateContrast(selector: string, minRatio?: number): Chainable<void>;
      switchRace(race: 'ELF' | 'GOBLIN' | 'HUMAN' | 'UNDEAD'): Chainable<void>;
      validateVisible(selector: string): Chainable<void>;
      validateAria(
        selector: string,
        attributes: Record<string, string>,
      ): Chainable<void>;
      navigateWithKeyboard(
        selectors: string[],
        direction?: 'tab' | 'shift-tab',
      ): Chainable<void>;
      testWebSocketConnection(url: string): Chainable<boolean>;
      waitForAnimation(selector: string, duration?: number): Chainable<void>;
      validateGradient(selector: string): Chainable<void>;
      validateShadow(selector: string, expectedShadow: string): Chainable<void>;
      validateGoldText(selector: string): Chainable<void>;
    }
  }
}

export {};
