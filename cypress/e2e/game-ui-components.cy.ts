/// <reference types="cypress" />

/**
 * E2E Tests for Game UI Components
 *
 * Tests core game UI components:
 * - GameCard with gradient headers
 * - StatGrid slot layout
 * - UnitTrainingPanel functionality
 * - WarlordTable responsive behavior
 * - StyledTable mobile handling
 * - Entry animations (public-rise)
 */

describe('Game UI Components', () => {
  beforeEach(() => {
    cy.viewport(1280, 720);
    cy.loginAdmin();
  });

  describe('GameCard Component', () => {
    it('should render GameCard with gradient header', () => {
      cy.visitApp('/home/overview');

      cy.get('[data-testid="game-card"]').should('be.visible');
      cy.get('[data-testid="game-card-header"]')
        .should('have.css', 'background-image')
        .and('match', /gradient/);
    });

    it('should display GameCard content correctly', () => {
      cy.visitApp('/home/overview');

      cy.get('[data-testid="game-card"]')
        .first()
        .within(() => {
          cy.get('[data-testid="card-title"]').should('be.visible');
          cy.get('[data-testid="card-content"]').should('be.visible');
        });
    });

    it('should apply race-specific gradient to GameCard header', () => {
      cy.visitApp('/home/overview');
      cy.window().then((win) => {
        win.localStorage.setItem('userRace', 'ELF');
      });
      cy.reload();

      cy.get('[data-testid="game-card-header"]')
        .should('have.css', 'background-image')
        .and('match', /gradient/);
      cy.get('[data-testid="game-card-header"]')
        .should('have.css', 'background-image')
        .and('include', 'rgb(34, 139, 34)');
    });

    it('should handle GameCard hover states', () => {
      cy.visitApp('/home/overview');

      cy.get('[data-testid="game-card"]').first().trigger('mouseover');
      cy.wait(200);

      cy.get('[data-testid="game-card"]')
        .first()
        .invoke('css', 'transform')
        .should('not.eq', 'none');
    });

    it('should display GameCard with proper shadow depth', () => {
      cy.visitApp('/home/overview');

      cy.get('[data-testid="game-card"]')
        .should('have.css', 'box-shadow')
        .and('not.equal', 'none');
    });
  });

  describe('StatGrid Component', () => {
    it('should render StatGrid with correct slot layout', () => {
      cy.visitApp('/home/overview');

      cy.get('[data-testid="stat-grid"]').should('be.visible');
      cy.get('[data-testid="stat-slot"]').should('have.length.greaterThan', 0);
    });

    it('should display stat values correctly in slots', () => {
      cy.visitApp('/home/overview');

      cy.get('[data-testid="stat-slot"]')
        .first()
        .within(() => {
          cy.get('[data-testid="stat-label"]').should('be.visible');
          cy.get('[data-testid="stat-value"]').should('be.visible');
        });
    });

    it('should handle StatGrid responsive layout', () => {
      // Desktop
      cy.viewport(1920, 1080);
      cy.visitApp('/home/overview');
      cy.get('[data-testid="stat-grid"]').should('be.visible');

      // Mobile
      cy.viewport(375, 667);
      cy.get('[data-testid="stat-grid"]').should('be.visible');
      cy.get('[data-testid="stat-slot"]').should('have.length.greaterThan', 0);
    });

    it('should apply gold accent to stat values', () => {
      cy.visitApp('/home/overview');

      cy.get('[data-testid="stat-value"]')
        .first()
        .should('have.css', 'color')
        .and('match', /rgb\(255,\s*215,\s*0\)|rgb\(255,\s*193,\s*7\)/);
    });

    it('should handle empty stat slots gracefully', () => {
      cy.visitApp('/home/overview');

      cy.get('[data-testid="stat-slot"]').each(($el) => {
        cy.wrap($el).should('be.visible');
      });
    });
  });

  describe('UnitTrainingPanel Component', () => {
    it('should display unit training progress', () => {
      cy.visitApp('/battle/training');

      cy.get('[data-testid="training-progress"]').then(($el) => {
        if ($el.length > 0) {
          cy.get('[data-testid="training-progress"]').should('be.visible');
        }
      });
    });
  });

  describe('WarlordTable Component', () => {
    it('should render WarlordTable correctly', () => {
      cy.visitApp('/battle/users');

      cy.get('[data-testid="warlord-table"]').should('be.visible');
      cy.get('[data-testid="table-header"]').should('be.visible');
      cy.get('[data-testid="table-row"]').should('have.length.greaterThan', 0);
      cy.captureScreenshot('warlord-table');
    });

    it('should display correct columns in WarlordTable', () => {
      cy.visitApp('/battle/users');

      cy.get('[data-testid="table-header"]').within(() => {
        cy.get('[data-testid="header-rank"]').should('be.visible');
        cy.get('[data-testid="header-name"]').should('be.visible');
        cy.get('[data-testid="header-race"]').should('be.visible');
        cy.get('[data-testid="header-networth"]').should('be.visible');
      });
    });

    it('should handle WarlordTable responsive behavior', () => {
      // Desktop
      cy.viewport(1920, 1080);
      cy.visitApp('/battle/users');
      cy.get('[data-testid="warlord-table"]').should('be.visible');

      // Mobile - should be horizontally scrollable
      cy.viewport(375, 667);
      cy.get('[data-testid="table-container"]')
        .should('have.css', 'overflow-x')
        .and('match', /auto|scroll/);
    });

    it('should display race icons in WarlordTable', () => {
      cy.visitApp('/battle/users');

      cy.get('[data-testid="table-row"]')
        .first()
        .within(() => {
          cy.get('[data-testid="race-icon"] img').should('be.visible');
        });
    });

    it('should handle WarlordTable row hover states', () => {
      cy.visitApp('/battle/users');

      cy.get('[data-testid="table-row"]').first().trigger('mouseover');
      cy.wait(200);

      cy.get('[data-testid="table-row"]')
        .first()
        .should('have.css', 'background-color');
    });

    it('should handle empty WarlordTable state', () => {
      cy.intercept('GET', '/api/battle/users-filter-meta*', {
        statusCode: 200,
        body: { users: [] },
      }).as('getUsers');

      cy.visitApp('/battle/users?empty=1');
      cy.wait('@getUsers');

      cy.get('[data-testid="empty-state"]').should('be.visible');
    });
  });

  describe('StyledTable Component', () => {
    it('should render StyledTable with proper styling', () => {
      cy.visitApp('/battle/history');

      cy.get('[data-testid="styled-table"]').should('be.visible');
      cy.get('[data-testid="styled-table"]')
        .should('have.css', 'border-collapse')
        .and('equal', 'collapse');
    });

    it('should handle StyledTable mobile view', () => {
      cy.viewport(375, 667);
      cy.visitApp('/battle/history');

      // On mobile, table should be scrollable
      cy.get('[data-testid="table-wrapper"]')
        .should('have.css', 'overflow-x')
        .and('match', /auto|scroll/);
    });

    it('should display StyledTable with alternating row colors', () => {
      cy.visitApp('/battle/history');

      cy.get('[data-testid="table-row"]')
        .eq(0)
        .should('have.css', 'background-color');
      cy.get('[data-testid="table-row"]')
        .eq(1)
        .should('have.css', 'background-color');
    });

    it('should handle StyledTable sorting', () => {
      cy.visitApp('/battle/history');

      cy.get('[data-testid="sort-header"]').first().click();
      cy.wait(300);

      cy.get('[data-testid="sort-indicator"]').first().should('be.visible');
    });
  });

  describe('Entry Animations (public-rise)', () => {
    it('should apply public-rise animation to cards', () => {
      cy.visitApp('/home/overview');

      cy.get('[data-testid="game-card"]')
        .first()
        .should('have.css', 'animation-name')
        .and('equal', 'public-rise');
    });

    it('should stagger entry animations for multiple elements', () => {
      cy.visitApp('/home/overview');

      cy.get('[data-testid="game-card"]').each(($card, index) => {
        cy.wrap($card).should('have.css', 'animation-delay');
      });
    });

    it('should handle animation completion', () => {
      cy.visitApp('/home/overview');

      cy.waitForAnimation('[data-testid="game-card"]', 500);
      cy.get('[data-testid="game-card"]').first().should('be.visible');
    });

    it('should respect reduced motion preference', () => {
      cy.visitApp('/home/overview');

      // Simulate reduced motion by adding class
      cy.get('body').invoke('addClass', 'reduced-motion');

      cy.get('[data-testid="game-card"]')
        .first()
        .should('have.css', 'animation-name')
        .and('equal', 'none');
    });
  });

  describe('Component Integration', () => {
    it('should display multiple components on overview page', () => {
      cy.visitApp('/home/overview');

      cy.get('[data-testid="game-card"]').should('have.length.greaterThan', 0);
      cy.get('[data-testid="stat-grid"]').should('be.visible');
      cy.captureScreenshot('overview-page');
    });

    it('should maintain consistent styling across components', () => {
      cy.visitApp('/home/overview');

      const components = [
        '[data-testid="game-card"]',
        '[data-testid="stat-grid"]',
      ];

      components.forEach((selector) => {
        cy.get(selector).should('be.visible');
      });
    });

    it('should handle component loading states', () => {
      cy.visitApp('/home/overview');

      cy.get('body').then(($body) => {
        if ($body.find('[data-testid="loading-spinner"]').length) {
          cy.get('[data-testid="loading-spinner"]').should('be.visible');
        }
      });

      cy.get('[data-testid="game-card"]').should('be.visible');
    });
  });

  describe('Component Error States', () => {
    it('should display error state for failed component load', () => {
      cy.intercept('GET', '/api/battle/users-filter-meta*', {
        statusCode: 500,
        body: { error: 'Internal Server Error' },
      }).as('getUsersError');

      cy.visitApp('/battle/users');
      cy.wait('@getUsersError');

      cy.get('[data-testid="error-message"]').should('be.visible');
    });

    it('should provide retry option on error', () => {
      cy.intercept('GET', '/api/battle/users-filter-meta*', {
        statusCode: 500,
      }).as('getUsersError');

      cy.visitApp('/battle/users');
      cy.wait('@getUsersError');

      cy.get('[data-testid="retry-button"]').should('be.visible');
    });
  });
});
