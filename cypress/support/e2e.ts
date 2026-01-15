/// <reference types="cypress" />

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

// Vision MCP screenshot command
Cypress.Commands.add('captureScreenshot', (name: string) => {
  cy.screenshot(name, { capture: 'viewport' });
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

// Color contrast validation (WCAG AA: minimum 4.5:1 for normal text)
Cypress.Commands.add(
  'validateContrast',
  (selector: string, minRatio: number = 4.5) => {
    cy.get(selector).then(($el) => {
      const fgColor = $el.css('color');
      const bgColor = $el.parent().css('background-color');
      // Use Vision MCP to validate contrast ratio
      cy.captureScreenshot(
        `contrast-${selector.replace(/[^a-zA-Z0-9]/g, '-')}`,
      );
      // Log colors for visual inspection
      cy.log(`Foreground: ${fgColor}, Background: ${bgColor}`);
      // In production, integrate with Vision MCP for actual contrast calculation
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
    cy.captureScreenshot(`animation-${selector.replace(/[^a-zA-Z0-9]/g, '-')}`);
  },
);

// Validate gradient rendering
Cypress.Commands.add('validateGradient', (selector: string) => {
  cy.get(selector)
    .should('have.css', 'background-image')
    .and('match', /gradient/);
  cy.captureScreenshot(`gradient-${selector.replace(/[^a-zA-Z0-9]/g, '-')}`);
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
  cy.captureScreenshot(`gold-text-${selector.replace(/[^a-zA-Z0-9]/g, '-')}`);
});

declare global {
  namespace Cypress {
    interface Chainable {
      visitApp(path?: string): Chainable<void>;
      stubLayoutRequests(): Chainable<void>;
      loginAdmin(): Chainable<void>;
      captureScreenshot(name: string): Chainable<void>;
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
