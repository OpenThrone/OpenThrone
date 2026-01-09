/// <reference types="cypress" />

describe('Auth', () => {
  const adminEmail = Cypress.env('ADMIN_EMAIL') || 'testing@test.com';
  const adminPassword = Cypress.env('ADMIN_PASSWORD') || 'testAccount';

  beforeEach(() => {
    cy.stubLayoutRequests();
  });

  it('shows an error for invalid credentials', () => {
    cy.visitApp('/account/login');

    const randomEmail = `test-${Date.now()}@example.com`;
    const randomPassword = `pw-${Date.now()}-bad`;

    cy.get('input#email', { timeout: 5000 }).clear().type(randomEmail);
    cy.get('input#password', { timeout: 5000 }).clear().type(randomPassword);
    cy.get('#submit-button').click();

    cy.get('div.bg-red-500', { timeout: 8000 })
      .should('be.visible')
      .and(($el) => {
        expect($el.text().trim()).to.not.equal('');
      });
    cy.screenshot('auth-invalid-credentials');
  });

  it('signs in with admin credentials', () => {
    cy.visitApp('/account/login');

    cy.get('input#email', { timeout: 5000 }).clear().type(adminEmail);
    cy.get('input#password', { timeout: 5000 }).clear().type(adminPassword, { log: false });
    cy.get('#submit-button').click();

    cy.location('pathname', { timeout: 10000 }).should('eq', '/home/overview');
    cy.contains('button', 'Sign Out').should('be.visible');
    cy.screenshot('auth-signed-in');
  });

  it('signs out from the logged-in nav', () => {
    cy.loginAdmin();

    cy.contains('button', 'Sign Out').click();
    cy.location('pathname', { timeout: 10000 }).should('eq', '/');
    cy.contains('a', 'Login').should('be.visible');
    cy.screenshot('auth-signed-out');
  });
});
