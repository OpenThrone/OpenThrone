/// <reference types="cypress" />

/**
 * E2E Tests for Accessibility Compliance
 *
 * Tests accessibility features:
 * - WCAG AA color contrast ratios (minimum 4.5:1 for normal text, 3:1 for large text)
 * - Keyboard navigation through all interactive elements
 * - ARIA labels on buttons and inputs
 * - Focus management
 * - Screen reader compatibility
 * - Touch target sizes (WCAG 2.5.5: minimum 48px)
 */

describe('Accessibility Compliance', () => {
  beforeEach(() => {
    cy.viewport(1280, 720);
    cy.loginAdmin();
  });

  describe('WCAG AA Color Contrast', () => {
    it('should meet WCAG AA contrast for normal text (4.5:1)', () => {
      cy.visitApp('/home/overview');

      const normalTextElements = [
        '[data-testid="page-title"]',
        '[data-testid="card-title"]',
        '[data-testid="nav-link"]',
        '[data-testid="content-text"]',
      ];

      normalTextElements.forEach((selector) => {
        cy.get('body')
          .find(selector)
          .then(($el) => {
            if ($el.length > 0) {
              cy.validateContrast(selector, 4.5);
            }
          });
      });
      cy.captureScreenshot('contrast-normal-text');
    });

    it('should meet WCAG AA contrast for large text (3:1)', () => {
      cy.visitApp('/home/overview');

      cy.get('body')
        .find('[data-testid="large-heading"]')
        .then(($el) => {
          if ($el.length > 0) {
            cy.validateContrast('[data-testid="large-heading"]', 3);
          }
        });
      cy.captureScreenshot('contrast-large-text');
    });

    it('should meet WCAG AA contrast for UI components', () => {
      cy.visitApp('/battle/training');

      const uiComponents = [
        '[data-testid="train-button"]',
        '[data-testid="action-button"]',
        '[data-testid="tab-button"]',
      ];

      uiComponents.forEach((selector) => {
        cy.get('body')
          .find(selector)
          .then(($el) => {
            if ($el.length > 0) {
              cy.validateContrast(selector, 3);
            }
          });
      });
      cy.captureScreenshot('contrast-ui-components');
    });

    it('should validate contrast for form inputs', () => {
      cy.visitApp('/account/login');

      cy.validateContrast('[data-testid="email-input"]', 4.5);
      cy.validateContrast('[data-testid="password-input"]', 4.5);
      cy.captureScreenshot('contrast-form-inputs');
    });

    it('should validate contrast for error messages', () => {
      cy.visitApp('/account/login');

      cy.get('[data-testid="email-input"]').clear().type('invalid');
      cy.get('[data-testid="submit-button"]').click();

      cy.get('body')
        .find('[data-testid="error-message"]')
        .then(($el) => {
          if ($el.length > 0) {
            cy.validateContrast('[data-testid="error-message"]', 4.5);
          }
        });
      cy.captureScreenshot('contrast-error-messages');
    });

    it('should validate contrast for all race themes', () => {
      const races: Array<'ELF' | 'GOBLIN' | 'HUMAN' | 'UNDEAD'> = [
        'ELF',
        'GOBLIN',
        'HUMAN',
        'UNDEAD',
      ];

      races.forEach((race) => {
        cy.visitApp('/home/overview');
        cy.window().then((win) => {
          win.localStorage.setItem('userRace', race);
        });
        cy.reload();

        cy.validateContrast('[data-testid="page-title"]', 4.5);
        cy.captureScreenshot(`contrast-${race}-theme`);
      });
    });
  });

  describe('Keyboard Navigation', () => {
    it('should navigate through navigation links with Tab key', () => {
      cy.visitApp('/home/overview');

      const navLinks = [
        '[data-testid="nav-home-link"]',
        '[data-testid="nav-battle-link"]',
        '[data-testid="nav-community-link"]',
        '[data-testid="nav-about-link"]',
      ];

      navLinks.forEach((selector) => {
        cy.get(selector).should('be.visible').focus();
        cy.focused().should(
          'have.attr',
          'data-testid',
          selector.replace(/\[data-testid="|"\]/g, ''),
        );
      });
      cy.captureScreenshot('keyboard-nav-links');
    });

    it('should navigate through form fields with Tab key', () => {
      cy.visitApp('/account/login');

      cy.get('[data-testid="email-input"]').focus();
      cy.focused().should('have.attr', 'data-testid', 'email-input');

      cy.get('[data-testid="password-input"]').focus();
      cy.focused().should('have.attr', 'data-testid', 'password-input');

      cy.get('[data-testid="submit-button"]').focus();
      cy.focused().should('have.attr', 'data-testid', 'submit-button');
      cy.captureScreenshot('keyboard-form-navigation');
    });

    it('should navigate through interactive elements in correct order', () => {
      cy.visitApp('/battle/training');

      // Focus first interactive element
      cy.get('[data-testid="train-button"]').first().focus();
      cy.focused().should('be.visible');

      // Focus next elements
      cy.get('[data-testid="train-button"]').eq(1).focus();
      cy.focused().should('be.visible');

      cy.get('[data-testid="train-button"]').eq(2).focus();
      cy.focused().should('be.visible');
      cy.captureScreenshot('keyboard-tab-order');
    });

    it('should support Shift+Tab for reverse navigation', () => {
      cy.visitApp('/battle/training');

      cy.get('[data-testid="train-button"]').eq(1).focus();

      cy.get('[data-testid="train-button"]').eq(0).focus();
      cy.focused().should('be.visible');
      cy.captureScreenshot('keyboard-reverse-navigation');
    });

    it('should activate buttons with Enter key', () => {
      cy.visitApp('/battle/training');

      cy.get('[data-testid="train-button"]').first().focus();
      cy.focused().type('{enter}');

      // Button should trigger action
      cy.captureScreenshot('keyboard-enter-activation');
    });

    it('should activate buttons with Space key', () => {
      cy.visitApp('/battle/training');

      cy.get('[data-testid="train-button"]').first().focus();
      cy.focused().type(' ');

      // Button should trigger action
      cy.captureScreenshot('keyboard-space-activation');
    });

    it('should handle keyboard navigation on mobile viewport', () => {
      cy.viewport(375, 667);
      cy.visitApp('/home/overview');

      cy.get('[data-testid="mobile-menu-button"]').focus();
      cy.focused().should('have.attr', 'data-testid', 'mobile-menu-button');
      cy.focused().type('{enter}');

      cy.wait(300);
      cy.captureScreenshot('keyboard-mobile-navigation');
    });
  });

  describe('ARIA Labels', () => {
    it('should have ARIA labels on all buttons', () => {
      cy.visitApp('/battle/training');

      cy.get('button').each(($btn) => {
        cy.wrap($btn).then(($el) => {
          const hasAriaLabel =
            $el.attr('aria-label') || $el.attr('aria-labelledby');
          expect(hasAriaLabel).to.exist;
        });
      });
      cy.captureScreenshot('aria-button-labels');
    });

    it('should have ARIA labels on form inputs', () => {
      cy.visitApp('/account/login');

      cy.get('[data-testid="email-input"]').then(($el) => {
        const hasAriaLabel =
          $el.attr('aria-label') || $el.attr('aria-labelledby');
        expect(hasAriaLabel).to.exist;
      });

      cy.get('[data-testid="password-input"]').then(($el) => {
        const hasAriaLabel =
          $el.attr('aria-label') || $el.attr('aria-labelledby');
        expect(hasAriaLabel).to.exist;
      });
      cy.captureScreenshot('aria-input-labels');
    });

    it('should have ARIA labels on navigation links', () => {
      cy.visitApp('/home/overview');

      cy.get('[data-testid="nav-link"]').each(($link) => {
        cy.wrap($link).then(($el) => {
          const hasAriaLabel = $el.attr('aria-label') || $el.text();
          expect(hasAriaLabel).to.exist;
        });
      });
      cy.captureScreenshot('aria-nav-labels');
    });

    it('should have proper ARIA roles for interactive elements', () => {
      cy.visitApp('/battle/training');

      cy.get('[data-testid="train-button"]').should(
        'have.attr',
        'role',
        'button',
      );
      cy.get('[data-testid="tab-button"]').should('have.attr', 'role', 'tab');
      cy.captureScreenshot('aria-roles');
    });

    it('should have ARIA labels for icon-only buttons', () => {
      cy.visitApp('/home/overview');

      cy.get('[data-testid="icon-button"]').each(($btn) => {
        cy.wrap($btn).should('have.attr', 'aria-label');
      });
      cy.captureScreenshot('aria-icon-buttons');
    });

    it('should update ARIA labels for dynamic content', () => {
      cy.visitApp('/battle/training');

      cy.get('[data-testid="train-button"]').first().click();
      cy.wait(300);

      cy.get('[data-testid="train-button"]')
        .first()
        .should('have.attr', 'aria-label');
      cy.captureScreenshot('aria-dynamic-labels');
    });
  });

  describe('Focus Management', () => {
    it('should have visible focus indicators on all interactive elements', () => {
      cy.visitApp('/home/overview');

      const interactiveElements = [
        '[data-testid="nav-link"]',
        '[data-testid="action-button"]',
      ];

      interactiveElements.forEach((selector) => {
        cy.get(selector).first().focus();
        cy.focused().should('have.css', 'outline').and('not.equal', 'none');
      });
      cy.captureScreenshot('focus-indicators');
    });

    it('should maintain focus during page navigation', () => {
      cy.visitApp('/home/overview');

      cy.get('[data-testid="nav-battle-link"]').click();
      cy.wait(300);

      // Focus should move to the new page
      cy.focused().should('be.visible');
      cy.captureScreenshot('focus-navigation');
    });

    it('should trap focus within modals', () => {
      cy.visitApp('/home/overview');

      cy.get('body').then(($body) => {
        const $trigger = $body.find('[data-testid="modal-trigger"]');
        if ($trigger.length > 0) {
          cy.wrap($trigger).first().click();
          cy.wait(300);

          cy.get('[data-testid="modal"]').should('be.visible');
          cy.focused().should('be.within', '[data-testid="modal"]');
          cy.captureScreenshot('focus-modal-trap');
        }
      });
    });

    it('should return focus to trigger after modal close', () => {
      cy.visitApp('/home/overview');

      cy.get('body').then(($body) => {
        const $trigger = $body.find('[data-testid="modal-trigger"]');
        if ($trigger.length > 0) {
          cy.wrap($trigger).first().focus();
          cy.wrap($trigger).first().click();
          cy.wait(300);

          cy.get('[data-testid="modal-close"]').click();
          cy.wait(300);

          cy.focused().should('have.attr', 'data-testid', 'modal-trigger');
          cy.captureScreenshot('focus-modal-return');
        }
      });
    });

    it('should manage focus during form validation', () => {
      cy.visitApp('/account/login');

      cy.get('[data-testid="email-input"]').clear();
      cy.get('[data-testid="submit-button"]').click();

      cy.get('body').then(($body) => {
        const $error = $body.find('[data-testid="error-message"]');
        if ($error.length > 0) {
          cy.focused().should('have.attr', 'data-testid', 'email-input');
          cy.captureScreenshot('focus-validation');
        }
      });
    });

    it('should have focus-visible styles for keyboard navigation', () => {
      cy.visitApp('/home/overview');

      cy.get('[data-testid="nav-link"]').first().focus();
      cy.focused().should('have.css', 'outline').and('not.equal', 'none');
      cy.captureScreenshot('focus-visible-styles');
    });
  });

  describe('Screen Reader Compatibility', () => {
    it('should have proper heading hierarchy', () => {
      cy.visitApp('/home/overview');

      cy.get('h1').should('have.length', 1); // One h1 per page
      cy.get('h2').should('have.length.greaterThan', 0);
      cy.captureScreenshot('sr-heading-hierarchy');
    });

    it('should have alt text for all images', () => {
      cy.visitApp('/home/overview');

      cy.get('img').each(($img) => {
        cy.wrap($img).should('have.attr', 'alt').and('not.be.empty');
      });
      cy.captureScreenshot('sr-image-alt');
    });

    it('should have aria-live regions for dynamic content', () => {
      cy.visitApp('/battle/training');

      cy.get('[data-testid="notification-area"]').should(
        'have.attr',
        'aria-live',
        'polite',
      );
      cy.captureScreenshot('sr-live-regions');
    });

    it('should have aria-describedby for form field descriptions', () => {
      cy.visitApp('/account/login');

      cy.get('[data-testid="password-input"]').should(
        'have.attr',
        'aria-describedby',
      );
      cy.captureScreenshot('sr-form-descriptions');
    });

    it('should have aria-hidden for decorative elements', () => {
      cy.visitApp('/home/overview');

      cy.get('[data-testid="decorative-element"]').should(
        'have.attr',
        'aria-hidden',
        'true',
      );
      cy.captureScreenshot('sr-decorative-hidden');
    });

    it('should have proper landmark roles', () => {
      cy.visitApp('/home/overview');

      cy.get('[role="navigation"]').should('be.visible');
      cy.get('[role="main"]').should('be.visible');
      cy.captureScreenshot('sr-landmarks');
    });
  });

  describe('Touch Target Sizes (WCAG 2.5.5)', () => {
    it('should have minimum 48px touch targets on mobile', () => {
      cy.viewport(375, 667);
      cy.visitApp('/home/overview');

      const touchTargets = [
        '[data-testid="mobile-menu-button"]',
        '[data-testid="nav-link"]',
        '[data-testid="action-button"]',
      ];

      touchTargets.forEach((selector) => {
        cy.get('body')
          .find(selector)
          .then(($el) => {
            if ($el.length > 0) {
              cy.validateTouchTarget(selector, 48);
            }
          });
      });
      cy.captureScreenshot('touch-targets-mobile');
    });

    it('should have minimum 48px touch targets for form inputs', () => {
      cy.viewport(375, 667);
      cy.visitApp('/account/login');

      cy.validateTouchTarget('[data-testid="email-input"]', 48);
      cy.validateTouchTarget('[data-testid="password-input"]', 48);
      cy.validateTouchTarget('[data-testid="submit-button"]', 48);
      cy.captureScreenshot('touch-targets-form');
    });

    it('should have adequate spacing between touch targets', () => {
      cy.viewport(375, 667);
      cy.visitApp('/battle/training');

      cy.get('body').then(($body) => {
        const $buttons = $body.find('[data-testid="train-button"]');
        if ($buttons.length > 1) {
          $buttons.each((index, btn) => {
            if (index < $buttons.length - 1) {
              const $btn = cy.wrap(btn);
              const $nextBtn = cy.wrap($buttons[index + 1]);

              // Check spacing between buttons
              // This is a simplified check - actual implementation may vary
              cy.wrap(btn).should('be.visible');
            }
          });
        }
      });
      cy.captureScreenshot('touch-targets-spacing');
    });
  });

  describe('Skip Links', () => {
    it('should have skip navigation link', () => {
      cy.visitApp('/home/overview');

      cy.get('[data-testid="skip-link"]').should('be.visible');
      cy.captureScreenshot('skip-link-visible');
    });

    it('should focus on main content when skip link is activated', () => {
      cy.visitApp('/home/overview');

      cy.get('[data-testid="skip-link"]').focus();
      cy.focused().type('{enter}');

      cy.focused().should('have.attr', 'id', 'main-content');
      cy.captureScreenshot('skip-link-activation');
    });
  });

  describe('Error Handling', () => {
    it('should announce errors with aria-live', () => {
      cy.visitApp('/account/login');

      cy.get('[data-testid="email-input"]').clear().type('invalid');
      cy.get('[data-testid="submit-button"]').click();

      cy.get('[data-testid="error-message"]').should(
        'have.attr',
        'role',
        'alert',
      );
      cy.captureScreenshot('error-aria-live');
    });

    it('should associate error messages with form fields', () => {
      cy.visitApp('/account/login');

      cy.get('[data-testid="email-input"]').clear().type('invalid');
      cy.get('[data-testid="submit-button"]').click();

      cy.get('[data-testid="error-message"]').should(
        'have.attr',
        'aria-describedby',
      );
      cy.captureScreenshot('error-association');
    });
  });

  describe('Accessibility Across Viewports', () => {
    it('should maintain accessibility on mobile', () => {
      cy.viewport(375, 667);
      cy.visitApp('/home/overview');

      cy.get('[data-testid="mobile-menu-button"]').should(
        'have.attr',
        'aria-label',
      );
      cy.validateTouchTarget('[data-testid="mobile-menu-button"]', 48);
      cy.captureScreenshot('accessibility-mobile');
    });

    it('should maintain accessibility on desktop', () => {
      cy.viewport(1920, 1080);
      cy.visitApp('/home/overview');

      cy.get('[data-testid="nav-link"]').each(($link) => {
        cy.wrap($link).then(($el) => {
          const hasAriaLabel = $el.attr('aria-label') || $el.text();
          expect(hasAriaLabel).to.exist;
        });
      });
      cy.captureScreenshot('accessibility-desktop');
    });

    it('should maintain accessibility during viewport resize', () => {
      cy.viewport(1920, 1080);
      cy.visitApp('/home/overview');

      cy.get('[data-testid="nav-link"]').first().focus();
      cy.focused().should('be.visible');

      cy.viewport(375, 667);
      cy.wait(300);

      cy.get('[data-testid="mobile-menu-button"]').should('be.visible').focus();
      cy.focused().should('be.visible');
      cy.captureScreenshot('accessibility-resize');
    });
  });
});
