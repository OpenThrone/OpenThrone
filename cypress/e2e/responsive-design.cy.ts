/// <reference types="cypress" />

/**
 * E2E Tests for Responsive Design
 * 
 * Tests responsive behavior across all breakpoints:
 * - Mobile: 375px, 414px
 * - Tablet: 768px, 1024px
 * - Desktop: 1920px
 * 
 * Validates:
 * - Touch target sizes (WCAG 2.5.5: minimum 48px)
 * - Content overflow handling
 * - Navigation panel behavior
 * - Layout transformations
 */

describe('Responsive Design', () => {
  const viewports = {
    mobileSmall: { width: 375, height: 667, label: 'Mobile Small (375px)' },
    mobileLarge: { width: 414, height: 896, label: 'Mobile Large (414px)' },
    tabletPortrait: { width: 768, height: 1024, label: 'Tablet Portrait (768px)' },
    tabletLandscape: { width: 1024, height: 768, label: 'Tablet Landscape (1024px)' },
    desktop: { width: 1920, height: 1080, label: 'Desktop (1920px)' },
  };

  beforeEach(() => {
    cy.stubLayoutRequests();
    cy.viewport(1280, 720);
    cy.visitApp('/');
  });

  afterEach(() => {
    // Reset viewport after each test
    cy.viewport(1280, 720);
  });

  describe('Mobile Viewports (375px, 414px)', () => {
    it('should render correctly on 375px viewport', () => {
      cy.viewport(viewports.mobileSmall.width, viewports.mobileSmall.height);
      cy.captureScreenshot('mobile-375px-initial');
      
      // Verify page loads without horizontal scroll
      cy.get('body').should('have.css', 'overflow-x').and('equal', 'hidden');
      
      // Check navigation panel transforms to hamburger menu
      cy.get('[data-testid="mobile-menu-button"]').should('be.visible');
      cy.captureScreenshot('mobile-375px-navigation');
    });

    it('should render correctly on 414px viewport', () => {
      cy.viewport(viewports.mobileLarge.width, viewports.mobileLarge.height);
      cy.captureScreenshot('mobile-414px-initial');
      
      // Verify mobile navigation
      cy.get('[data-testid="mobile-menu-button"]').should('be.visible');
      
      // Test touch targets meet minimum 48px requirement
      cy.validateTouchTarget('[data-testid="mobile-menu-button"]', 48);
      cy.validateTouchTarget('[data-testid="nav-home-link"]', 48);
      cy.captureScreenshot('mobile-414px-touch-targets');
    });

    it('should handle content overflow on mobile', () => {
      cy.viewport(viewports.mobileSmall.width, viewports.mobileSmall.height);
      cy.visitApp('/battle/training');
      cy.captureScreenshot('mobile-375px-training-page');
      
      // Verify scrollable content areas
      cy.get('[data-testid="scrollable-content"]').should('have.css', 'overflow-y').and('equal', 'auto');
      
      // Ensure no horizontal scroll
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
      cy.captureScreenshot('mobile-414px-all-touch-targets');
    });

    it('should display mobile-specific navigation panel', () => {
      cy.viewport(viewports.mobileSmall.width, viewports.mobileSmall.height);
      
      // Mobile menu should be collapsed by default
      cy.get('[data-testid="mobile-menu-panel"]').should('not.be.visible');
      
      // Click to expand
      cy.get('[data-testid="mobile-menu-button"]').click();
      cy.wait(300); // Wait for animation
      cy.captureScreenshot('mobile-375px-menu-expanded');
      
      cy.get('[data-testid="mobile-menu-panel"]').should('be.visible');
      
      // Verify menu items are touch-friendly
      cy.validateTouchTarget('[data-testid="mobile-menu-item"]', 48);
    });
  });

  describe('Tablet Viewports (768px, 1024px)', () => {
    it('should render correctly on 768px portrait tablet', () => {
      cy.viewport(viewports.tabletPortrait.width, viewports.tabletPortrait.height);
      cy.captureScreenshot('tablet-768px-initial');
      
      // Tablet may show condensed navigation
      cy.get('[data-testid="navigation-panel"]').should('be.visible');
      
      // Content should use available width efficiently
      cy.get('[data-testid="main-content"]').should('be.visible');
      cy.captureScreenshot('tablet-768px-layout');
    });

    it('should render correctly on 1024px landscape tablet', () => {
      cy.viewport(viewports.tabletLandscape.width, viewports.tabletLandscape.height);
      cy.captureScreenshot('tablet-1024px-initial');
      
      // Landscape tablet may show desktop-like navigation
      cy.get('[data-testid="navigation-panel"]').should('be.visible');
      
      // Grid layouts should adjust
      cy.get('[data-testid="content-grid"]').should('be.visible');
      cy.captureScreenshot('tablet-1024px-grid-layout');
    });

    it('should validate touch targets on tablet', () => {
      cy.viewport(viewports.tabletPortrait.width, viewports.tabletPortrait.height);
      
      const touchTargets = [
        '[data-testid="nav-home-link"]',
        '[data-testid="nav-battle-link"]',
        '[data-testid="action-button"]',
      ];
      
      touchTargets.forEach((selector) => {
        cy.get(selector).then(($el) => {
          if ($el.length > 0) {
            cy.validateTouchTarget(selector, 44); // Slightly lower minimum for tablet
          }
        });
      });
      cy.captureScreenshot('tablet-768px-touch-targets');
    });

    it('should handle responsive grid layouts on tablet', () => {
      cy.viewport(viewports.tabletLandscape.width, viewports.tabletLandscape.height);
      cy.visitApp('/battle/users');
      cy.captureScreenshot('tablet-1024px-users-page');
      
      // Verify grid adapts to tablet width
      cy.get('[data-testid="warlord-table"]').should('be.visible');
      
      // Table should be horizontally scrollable if needed
      cy.get('[data-testid="table-container"]').should('have.css', 'overflow-x').and('match', /auto|scroll/);
    });
  });

  describe('Desktop Viewports (1920px)', () => {
    it('should render correctly on 1920px desktop', () => {
      cy.viewport(viewports.desktop.width, viewports.desktop.height);
      cy.captureScreenshot('desktop-1920px-initial');
      
      // Full navigation panel should be visible
      cy.get('[data-testid="navigation-panel"]').should('be.visible');
      
      // Content should use full width
      cy.get('[data-testid="main-content"]').should('be.visible');
      cy.captureScreenshot('desktop-1920px-layout');
    });

    it('should display all navigation elements on desktop', () => {
      cy.viewport(viewports.desktop.width, viewports.desktop.height);
      
      // Desktop navigation should show all links
      cy.get('[data-testid="nav-home-link"]').should('be.visible');
      cy.get('[data-testid="nav-battle-link"]').should('be.visible');
      cy.get('[data-testid="nav-community-link"]').should('be.visible');
      cy.get('[data-testid="nav-about-link"]').should('be.visible');
      cy.captureScreenshot('desktop-1920px-navigation');
    });

    it('should handle wide content layouts on desktop', () => {
      cy.viewport(viewports.desktop.width, viewports.desktop.height);
      cy.visitApp('/battle/training');
      cy.captureScreenshot('desktop-1920px-training');
      
      // Grid layouts should use available space
      cy.get('[data-testid="unit-grid"]').should('be.visible');
      
      // Multiple columns should be visible
      cy.get('[data-testid="unit-card"]').should('have.length.greaterThan', 1);
    });

    it('should maintain proper spacing on large screens', () => {
      cy.viewport(viewports.desktop.width, viewports.desktop.height);
      
      // Verify max-width containers for readability
      cy.get('[data-testid="content-container"]').then(($el) => {
        if ($el.length > 0) {
          const maxWidth = parseInt($el.css('max-width'));
          expect(maxWidth).to.be.at.most(1400); // Reasonable max width
        }
      });
      cy.captureScreenshot('desktop-1920px-spacing');
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
        cy.captureScreenshot(`consistency-${vp.width}px`);
        
        // Core content should be visible on all viewports
        cy.get('[data-testid="page-title"]').should('be.visible');
        cy.get('[data-testid="main-content"]').should('be.visible');
      });
    });

    it('should handle viewport resize gracefully', () => {
      // Start with desktop
      cy.viewport(viewports.desktop.width, viewports.desktop.height);
      cy.captureScreenshot('resize-desktop');
      
      // Resize to mobile
      cy.viewport(viewports.mobileSmall.width, viewports.mobileSmall.height);
      cy.wait(300); // Wait for layout adjustment
      cy.captureScreenshot('resize-mobile');
      
      // Verify mobile menu appears
      cy.get('[data-testid="mobile-menu-button"]').should('be.visible');
      
      // Resize back to desktop
      cy.viewport(viewports.desktop.width, viewports.desktop.height);
      cy.wait(300);
      cy.captureScreenshot('resize-back-desktop');
      
      // Verify full navigation returns
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
              const minSize = vp.width < 768 ? 48 : 44; // Stricter on mobile
              cy.validateTouchTarget(selector, minSize);
            }
          });
        });
        cy.captureScreenshot(`touch-targets-${vp.width}px`);
      });
    });
  });

  describe('Navigation Panel Behavior', () => {
    it('should collapse navigation on mobile, expand on desktop', () => {
      // Mobile - collapsed
      cy.viewport(viewports.mobileSmall.width, viewports.mobileSmall.height);
      cy.get('[data-testid="mobile-menu-button"]').should('be.visible');
      cy.get('[data-testid="desktop-nav"]').should('not.be.visible');
      cy.captureScreenshot('nav-mobile-collapsed');
      
      // Desktop - expanded
      cy.viewport(viewports.desktop.width, viewports.desktop.height);
      cy.get('[data-testid="desktop-nav"]').should('be.visible');
      cy.get('[data-testid="mobile-menu-button"]').should('not.be.visible');
      cy.captureScreenshot('nav-desktop-expanded');
    });

    it('should handle navigation panel toggle on mobile', () => {
      cy.viewport(viewports.mobileSmall.width, viewports.mobileSmall.height);
      
      // Initially collapsed
      cy.get('[data-testid="mobile-menu-panel"]').should('not.be.visible');
      
      // Open menu
      cy.get('[data-testid="mobile-menu-button"]').click();
      cy.wait(300);
      cy.captureScreenshot('nav-mobile-open');
      cy.get('[data-testid="mobile-menu-panel"]').should('be.visible');
      
      // Close menu
      cy.get('[data-testid="close-menu-button"]').click();
      cy.wait(300);
      cy.captureScreenshot('nav-mobile-closed');
      cy.get('[data-testid="mobile-menu-panel"]').should('not.be.visible');
    });

    it('should maintain navigation state during viewport changes', () => {
      // Start on desktop
      cy.viewport(viewports.desktop.width, viewports.desktop.height);
      cy.get('[data-testid="desktop-nav"]').should('be.visible');
      
      // Navigate to a page
      cy.visitApp('/battle/training');
      cy.captureScreenshot('nav-state-desktop');
      
      // Resize to mobile
      cy.viewport(viewports.mobileSmall.width, viewports.mobileSmall.height);
      cy.wait(300);
      cy.captureScreenshot('nav-state-mobile');
      
      // Current page should still be active
      cy.get('[data-testid="nav-battle-link"]').should('have.class', 'active');
    });
  });

  describe('Content Overflow Handling', () => {
    it('should prevent horizontal scroll on mobile', () => {
      cy.viewport(viewports.mobileSmall.width, viewports.mobileSmall.height);
      cy.visitApp('/battle/users');
      
      // Body should not have horizontal scroll
      cy.get('body').should('have.css', 'overflow-x').and('equal', 'hidden');
      
      // Table container should handle overflow
      cy.get('[data-testid="table-container"]').should('have.css', 'overflow-x').and('match', /auto|scroll/);
      cy.captureScreenshot('overflow-mobile-table');
    });

    it('should handle long text content gracefully', () => {
      cy.viewport(viewports.mobileSmall.width, viewports.mobileSmall.height);
      cy.visitApp('/community/news');
      
      // Text should wrap properly
      cy.get('[data-testid="news-content"]').should('have.css', 'word-wrap').and('equal', 'break-word');
      cy.captureScreenshot('overflow-mobile-text');
    });

    it('should handle images and media responsively', () => {
      cy.viewport(viewports.mobileSmall.width, viewports.mobileSmall.height);
      
      cy.get('img').then(($images) => {
        $images.each((_, img) => {
          cy.wrap(img).should('have.css', 'max-width').and('equal', '100%');
        });
      });
      cy.captureScreenshot('overflow-mobile-images');
    });
  });

  describe('Special Cases', () => {
    it('should handle ultra-wide screens (2560px)', () => {
      cy.viewport(2560, 1440);
      cy.captureScreenshot('ultrawide-2560px');
      
      // Content should still be centered and readable
      cy.get('[data-testid="content-container"]').should('be.visible');
      
      // No horizontal scroll should appear
      cy.get('body').should('have.css', 'overflow-x').and('equal', 'hidden');
    });

    it('should handle very small screens (320px)', () => {
      cy.viewport(320, 568);
      cy.captureScreenshot('small-320px');
      
      // Critical content should still be accessible
      cy.get('[data-testid="mobile-menu-button"]').should('be.visible');
      cy.get('[data-testid="main-content"]').should('be.visible');
    });

    it('should handle orientation changes', () => {
      // Portrait
      cy.viewport(375, 667);
      cy.captureScreenshot('orientation-portrait');
      
      // Landscape
      cy.viewport(667, 375);
      cy.wait(300);
      cy.captureScreenshot('orientation-landscape');
      
      // Content should adapt
      cy.get('[data-testid="main-content"]').should('be.visible');
    });
  });
});
