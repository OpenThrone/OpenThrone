/// <reference types="cypress" />

describe('Responsive Design', () => {
  const viewports = {
    mobileSmall: { width: 375, height: 667, label: 'Mobile Small (375px)' },
    mobileLarge: { width: 414, height: 896, label: 'Mobile Large (414px)' },
    tabletPortrait: {
      width: 768,
      height: 1024,
      label: 'Tablet Portrait (768px)',
    },
    tabletLandscape: {
      width: 1024,
      height: 768,
      label: 'Tablet Landscape (1024px)',
    },
    desktop: { width: 1920, height: 1080, label: 'Desktop (1920px)' },
  };

  beforeEach(() => {
    cy.stubLayoutRequests();
    cy.viewport(1280, 720);
    cy.visitApp('/');
  });

  afterEach(() => {
    cy.viewport(1280, 720);
  });

  describe('Mobile Viewports (375px, 414px)', () => {
    it('should render correctly on 375px viewport', () => {
      cy.viewport(viewports.mobileSmall.width, viewports.mobileSmall.height);
      cy.captureScreenshot('mobile-375px');

      cy.get('body').should('have.css', 'overflow-x').and('equal', 'hidden');
      cy.get('[data-testid="mobile-menu-button"]').should('be.visible');
    });

    it('should render correctly on 414px viewport', () => {
      cy.viewport(viewports.mobileLarge.width, viewports.mobileLarge.height);

      cy.get('[data-testid="mobile-menu-button"]').should('be.visible');
      cy.validateTouchTarget('[data-testid="mobile-menu-button"]', 48);
      cy.validateTouchTarget('[data-testid="nav-home-link"]', 48);
    });

    it('should handle content overflow on mobile', () => {
      cy.viewport(viewports.mobileSmall.width, viewports.mobileSmall.height);
      cy.visitApp('/battle/training');

      cy.get('[data-testid="scrollable-content"]')
        .should('have.css', 'overflow-y')
        .and('equal', 'auto');
      cy.get('body').should('have.css', 'overflow-x').and('equal', 'hidden');
    });

    it('should validate all interactive touch targets on mobile', () => {
      cy.viewport(viewports.mobileLarge.width, viewports.mobileLarge.height);

      const touchTargets = [
        '[data-testid="mobile-menu-button"]',
        '[data-testid="nav-home-link"]',
        '[data-testid="nav-battle-link"]',
        '[data-testid="nav-community-link"]',
        '[data-testid="primary-action-button"]',
      ];

      touchTargets.forEach((selector) => {
        cy.get(selector).then(($el) => {
          if ($el.length > 0) {
            cy.validateTouchTarget(selector, 48);
          }
        });
      });
    });

    it('should display mobile-specific navigation panel', () => {
      cy.viewport(viewports.mobileSmall.width, viewports.mobileSmall.height);

      cy.get('[data-testid="mobile-menu-panel"]').should('not.be.visible');
      cy.get('[data-testid="mobile-menu-button"]').click();
      cy.wait(300);
      cy.get('[data-testid="mobile-menu-panel"]').should('be.visible');
      cy.validateTouchTarget('[data-testid="mobile-menu-item"]', 48);
    });
  });

  describe('Tablet Viewports (768px, 1024px)', () => {
    it('should render correctly on 768px portrait tablet', () => {
      cy.viewport(
        viewports.tabletPortrait.width,
        viewports.tabletPortrait.height,
      );
      cy.captureScreenshot('tablet-768px');

      cy.get('[data-testid="navigation-panel"]').should('be.visible');
      cy.get('[data-testid="main-content"]').should('be.visible');
    });

    it('should render correctly on 1024px landscape tablet', () => {
      cy.viewport(
        viewports.tabletLandscape.width,
        viewports.tabletLandscape.height,
      );

      cy.get('[data-testid="navigation-panel"]').should('be.visible');
      cy.get('[data-testid="content-grid"]').should('be.visible');
    });

    it('should validate touch targets on tablet', () => {
      cy.viewport(
        viewports.tabletPortrait.width,
        viewports.tabletPortrait.height,
      );

      const touchTargets = [
        '[data-testid="nav-home-link"]',
        '[data-testid="nav-battle-link"]',
        '[data-testid="action-button"]',
      ];

      touchTargets.forEach((selector) => {
        cy.get(selector).then(($el) => {
          if ($el.length > 0) {
            cy.validateTouchTarget(selector, 44);
          }
        });
      });
    });

    it('should handle responsive grid layouts on tablet', () => {
      cy.viewport(
        viewports.tabletLandscape.width,
        viewports.tabletLandscape.height,
      );
      cy.visitApp('/battle/users');
      cy.captureScreenshot('tablet-1024px-users');

      cy.get('[data-testid="warlord-table"]').should('be.visible');
      cy.get('[data-testid="table-container"]')
        .should('have.css', 'overflow-x')
        .and('match', /auto|scroll/);
    });
  });

  describe('Desktop Viewports (1920px)', () => {
    it('should render correctly on 1920px desktop', () => {
      cy.viewport(viewports.desktop.width, viewports.desktop.height);
      cy.captureScreenshot('desktop-1920px');

      cy.get('[data-testid="navigation-panel"]').should('be.visible');
      cy.get('[data-testid="main-content"]').should('be.visible');
    });

    it('should display all navigation elements on desktop', () => {
      cy.viewport(viewports.desktop.width, viewports.desktop.height);

      cy.get('[data-testid="nav-home-link"]').should('be.visible');
      cy.get('[data-testid="nav-battle-link"]').should('be.visible');
      cy.get('[data-testid="nav-community-link"]').should('be.visible');
      cy.get('[data-testid="nav-about-link"]').should('be.visible');
    });

    it('should handle wide content layouts on desktop', () => {
      cy.viewport(viewports.desktop.width, viewports.desktop.height);
      cy.visitApp('/battle/training');

      cy.get('[data-testid="unit-grid"]').should('be.visible');
      cy.get('[data-testid="unit-card"]').should('have.length.greaterThan', 1);
    });

    it('should maintain proper spacing on large screens', () => {
      cy.viewport(viewports.desktop.width, viewports.desktop.height);

      cy.get('[data-testid="content-container"]').then(($el) => {
        if ($el.length > 0) {
          const maxWidth = parseInt($el.css('max-width'));
          expect(maxWidth).to.be.at.most(1400);
        }
      });
    });
  });

  describe('Cross-Viewport Consistency', () => {
    it('should maintain content consistency across viewports', () => {
      const testViewports = [
        viewports.mobileSmall,
        viewports.tabletPortrait,
        viewports.desktop,
      ];

      testViewports.forEach((vp) => {
        cy.viewport(vp.width, vp.height);
        cy.visitApp('/home/overview');

        cy.get('[data-testid="page-title"]').should('be.visible');
        cy.get('[data-testid="main-content"]').should('be.visible');
      });
    });

    it('should handle viewport resize gracefully', () => {
      cy.viewport(viewports.desktop.width, viewports.desktop.height);

      cy.viewport(viewports.mobileSmall.width, viewports.mobileSmall.height);
      cy.wait(300);

      cy.get('[data-testid="mobile-menu-button"]').should('be.visible');

      cy.viewport(viewports.desktop.width, viewports.desktop.height);
      cy.wait(300);

      cy.get('[data-testid="navigation-panel"]').should('be.visible');
    });

    it('should validate critical touch targets across all viewports', () => {
      const criticalTargets = [
        '[data-testid="primary-action-button"]',
        '[data-testid="submit-button"]',
        '[data-testid="nav-home-link"]',
      ];

      Object.values(viewports).forEach((vp) => {
        cy.viewport(vp.width, vp.height);
        cy.visitApp('/');

        criticalTargets.forEach((selector) => {
          cy.get(selector).then(($el) => {
            if ($el.length > 0) {
              const minSize = vp.width < 768 ? 48 : 44;
              cy.validateTouchTarget(selector, minSize);
            }
          });
        });
      });
    });
  });

  describe('Navigation Panel Behavior', () => {
    it('should collapse navigation on mobile, expand on desktop', () => {
      cy.viewport(viewports.mobileSmall.width, viewports.mobileSmall.height);
      cy.get('[data-testid="mobile-menu-button"]').should('be.visible');
      cy.get('[data-testid="desktop-nav"]').should('not.be.visible');

      cy.viewport(viewports.desktop.width, viewports.desktop.height);
      cy.get('[data-testid="desktop-nav"]').should('be.visible');
      cy.get('[data-testid="mobile-menu-button"]').should('not.be.visible');
    });

    it('should handle navigation panel toggle on mobile', () => {
      cy.viewport(viewports.mobileSmall.width, viewports.mobileSmall.height);

      cy.get('[data-testid="mobile-menu-panel"]').should('not.be.visible');
      cy.get('[data-testid="mobile-menu-button"]').click();
      cy.wait(300);
      cy.get('[data-testid="mobile-menu-panel"]').should('be.visible');

      cy.get('[data-testid="close-menu-button"]').click();
      cy.wait(300);
      cy.get('[data-testid="mobile-menu-panel"]').should('not.be.visible');
    });

    it('should maintain navigation state during viewport changes', () => {
      cy.viewport(viewports.desktop.width, viewports.desktop.height);
      cy.get('[data-testid="desktop-nav"]').should('be.visible');
      cy.visitApp('/battle/training');

      cy.viewport(viewports.mobileSmall.width, viewports.mobileSmall.height);
      cy.wait(300);

      cy.get('[data-testid="nav-battle-link"]').should('have.class', 'active');
    });
  });

  describe('Content Overflow Handling', () => {
    it('should prevent horizontal scroll on mobile', () => {
      cy.viewport(viewports.mobileSmall.width, viewports.mobileSmall.height);
      cy.visitApp('/battle/users');

      cy.get('body').should('have.css', 'overflow-x').and('equal', 'hidden');
      cy.get('[data-testid="table-container"]')
        .should('have.css', 'overflow-x')
        .and('match', /auto|scroll/);
    });

    it('should handle long text content gracefully', () => {
      cy.viewport(viewports.mobileSmall.width, viewports.mobileSmall.height);
      cy.visitApp('/community/news');

      cy.get('[data-testid="news-content"]')
        .should('have.css', 'word-wrap')
        .and('equal', 'break-word');
    });

    it('should handle images and media responsively', () => {
      cy.viewport(viewports.mobileSmall.width, viewports.mobileSmall.height);

      cy.get('img').then(($images) => {
        $images.each((_, img) => {
          cy.wrap(img).should('have.css', 'max-width').and('equal', '100%');
        });
      });
    });
  });

  describe('Special Cases', () => {
    it('should handle ultra-wide screens (2560px)', () => {
      cy.viewport(2560, 1440);
      cy.captureScreenshot('ultrawide-2560px');

      cy.get('[data-testid="content-container"]').should('be.visible');
      cy.get('body').should('have.css', 'overflow-x').and('equal', 'hidden');
    });

    it('should handle very small screens (320px)', () => {
      cy.viewport(320, 568);

      cy.get('[data-testid="mobile-menu-button"]').should('be.visible');
      cy.get('[data-testid="main-content"]').should('be.visible');
    });

    it('should handle orientation changes', () => {
      cy.viewport(375, 667);
      cy.viewport(667, 375);
      cy.wait(300);

      cy.get('[data-testid="main-content"]').should('be.visible');
    });
  });
});
