/// <reference types="cypress" />

describe('Simple E2E', () => {
  beforeEach(() => {
    cy.viewport(1280, 720);
  });

  it('loads the site and has a body', () => {
    const appUrl = Cypress.env('APP_URL') || 'http://localhost:3001';
    cy.visit(appUrl);
    cy.location('hostname').should((hostname) => {
      expect(hostname).to.eq(new URL(appUrl).hostname);
    });
    cy.get('body').should('exist');
  });

  it('navigates to /account/login and signs in', () => {
    const appUrl = Cypress.env('APP_URL') || 'http://localhost:3001';
    const base = appUrl.replace(/\/+$/, '');
    cy.visit(`${base}/account/login`);

    cy.get('input#email', { timeout: 5000 }).as('email').should('exist').and('be.visible');
    cy.get('input#password', { timeout: 5000 }).as('password').should('exist').and('be.visible');

    const randomEmail = `test-${Date.now()}@example.com`;
    const randomPassword = `pw-${Date.now()}-bad`;

    cy.get('@email').clear().type(randomEmail);
    cy.get('@password').clear().type(randomPassword);
    cy.get('#submit-button').click();

    cy.get('div.bg-red-500', { timeout: 8000 })
      .should('be.visible')
      .and(($el) => {
        expect($el.text().trim()).to.not.equal('');
      });

    cy.get('@email').clear().type('testing@test.com');
    cy.get('@password').clear().type('testAccount');
    cy.get('#submit-button').click();

    cy.location('pathname', { timeout: 10000 }).should('eq', '/home/overview');
  });
});
