/// <reference types="cypress" />

describe('Mobile navigation', () => {
  beforeEach(() => {
    cy.viewport('iphone-6');
    cy.stubLayoutRequests();
  });

  const waitForLoggedInNav = () => {
    cy.contains('button', 'Sign Out', { timeout: 10000 }).should('exist');
  };

  it('does not show the menu toggle when logged out', () => {
    cy.visitApp('/');
    cy.get('button[aria-label="Open menu"]').should('not.exist');
  });

  it('opens and closes the menu on mobile', () => {
    cy.loginAdmin();
    waitForLoggedInNav();
    cy.get('button[aria-label="Open menu"]').click();
    cy.get('[role="dialog"]').filter(':visible').as('mobileDialog');
    cy.get('@mobileDialog').should('be.visible');
    cy.get('@mobileDialog').contains('h2', 'Menu').should('be.visible');
    cy.screenshot('mobile-nav-logged-in-open');

    cy.get('[aria-label="Close navigation menu"]').click({ force: true });
    cy.get('[role="dialog"]').should('not.be.visible');
  });

  it('closes the menu with Escape', () => {
    cy.loginAdmin();
    waitForLoggedInNav();
    cy.get('button[aria-label="Open menu"]').click();
    cy.get('[role="dialog"]').filter(':visible').as('mobileDialog');
    cy.get('@mobileDialog').should('be.visible');
    cy.screenshot('mobile-nav-logged-in-before-escape');
    cy.get('body').type('{esc}');
    cy.get('[role="dialog"]').should('not.be.visible');
  });

  it('expands submenu items for logged-in users', () => {
    cy.loginAdmin();
    waitForLoggedInNav();
    cy.get('button[aria-label="Open menu"]').click();
    cy.get('[role="dialog"]').filter(':visible').as('mobileDialog');
    cy.get('@mobileDialog').should('be.visible');

    cy.get('@mobileDialog').within(() => {
      cy.contains('button', 'Battle').click();
      cy.contains('a', 'Attack').should('be.visible');
      cy.contains('a', 'War History').should('be.visible');
    });
    cy.screenshot('mobile-nav-logged-in-battle-submenu');
  });

  it('switches between menu and sidebar tabs', () => {
    cy.loginAdmin();
    waitForLoggedInNav();
    cy.get('button[aria-label="Open menu"]').click();
    cy.get('[role="dialog"]').filter(':visible').as('mobileDialog');
    cy.get('@mobileDialog').should('be.visible');

    cy.get('@mobileDialog').contains('h2', 'Menu').should('be.visible');
    cy.get('@mobileDialog').find('[data-testid="mobile-nav-segmented"]').should('be.visible');

    cy.get('@mobileDialog').find('[data-testid="mobile-nav-segmented"]').contains('Sidebar').click();
    cy.get('@mobileDialog').find('[data-testid="mobile-nav-segmented"]').contains('Sidebar').should('be.visible');
    cy.screenshot('mobile-nav-logged-in-sidebar-tab');

    cy.get('@mobileDialog').find('[data-testid="mobile-nav-segmented"]').contains('Menu').click();
    cy.get('@mobileDialog').within(() => {
      cy.contains('button', 'Battle').should('be.visible');
    });
  });

  it('captures menu placement at md viewport', () => {
    cy.viewport(768, 1024);
    cy.loginAdmin();
    waitForLoggedInNav();
    cy.get('button[aria-label="Open menu"]').click();
    cy.get('[role="dialog"]').filter(':visible').as('mobileDialog');
    cy.get('@mobileDialog').should('be.visible');
    cy.get('@mobileDialog').contains('h2', 'Menu').should('be.visible');
    cy.screenshot('mobile-nav-logged-in-md-open');

    cy.get('@mobileDialog').find('[data-testid="mobile-nav-segmented"]').contains('Sidebar').click();
    cy.get('@mobileDialog').find('[data-testid="mobile-nav-segmented"]').contains('Sidebar').should('be.visible');
    cy.screenshot('mobile-nav-logged-in md-open-in-sidebar-tab');
  });

  it('captures menu placement at sm viewport', () => {
    cy.viewport(640, 900);
    cy.loginAdmin();
    waitForLoggedInNav();
    cy.get('button[aria-label="Open menu"]').click();
    cy.get('[role="dialog"]').filter(':visible').as('mobileDialog');
    cy.get('@mobileDialog').should('be.visible');
    cy.get('@mobileDialog').contains('h2', 'Menu').should('be.visible');
    cy.screenshot('mobile-nav-logged-in-sm-open');
  });

  it('captures menu placement at xs viewport', () => {
    cy.viewport(375, 812);
    cy.loginAdmin();
    waitForLoggedInNav();
    cy.get('button[aria-label="Open menu"]').click();
    cy.get('[role="dialog"]').filter(':visible').as('mobileDialog');
    cy.get('@mobileDialog').should('be.visible');
    cy.get('@mobileDialog').contains('h2', 'Menu').should('be.visible');
    cy.screenshot('mobile-nav-logged-in-xs-open');
  });
});
