/// <reference types="cypress" />

describe('NavLoggedIn', () => {
  beforeEach(() => {
    cy.viewport(1280, 720);
    cy.loginAdmin();
  });

  it('renders parent navigation links', () => {
    const parentLinks = ['Home', 'Battle', 'Social', 'Structures', 'Community'];

    parentLinks.forEach((label) => {
      cy.contains('a', label).should('be.visible');
    });
    cy.screenshot('nav-logged-in-parent-links');
  });

  it('shows the admin submenu item for administrators', () => {
    cy.contains('a', 'Home').trigger('mouseover');
    cy.contains('a', 'Administration').should('be.visible');
    cy.screenshot('nav-logged-in-admin-submenu');
  });

  it('updates the submenu on hover', () => {
    cy.contains('a', 'Battle').trigger('mouseover');
    cy.contains('a', 'Attack').should('be.visible');
    cy.contains('a', 'Training').should('be.visible');
    cy.contains('a', 'Upgrades').should('be.visible');
    cy.contains('a', 'War History').should('be.visible');
    cy.screenshot('nav-logged-in-battle-submenu');
  });

  it('highlights the correct submenu item on Battle routes', () => {
    cy.visitApp('/battle/users');
    cy.contains('a', 'Attack').should('have.class', 'text-gradient-orange');
    cy.screenshot('nav-logged-in-attack-active');

    cy.visitApp('/battle/history');
    cy.contains('a', 'War History').should(
      'have.class',
      'text-gradient-orange',
    );
    cy.screenshot('nav-logged-in-war-history-active');
  });

  it('highlights the Auto Recruit submenu item', () => {
    cy.visitApp('/auto-recruit');
    cy.contains('a', 'Auto Recruit').should(
      'have.class',
      'text-gradient-orange',
    );
    cy.screenshot('nav-logged-in-auto-recruit-active');
  });
});
