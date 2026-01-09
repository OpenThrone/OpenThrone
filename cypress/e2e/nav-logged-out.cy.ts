/// <reference types="cypress" />

describe('NavLoggedOut', () => {
  beforeEach(() => {
    cy.stubLayoutRequests();
  });

  it('renders logged-out navigation links', () => {
    cy.visitApp('/');

    cy.contains('a', 'Home').should('be.visible');
    cy.contains('a', 'Login').should('be.visible');
    cy.contains('a', 'Signup').should('be.visible');
    cy.contains('a', 'News').should('be.visible');
    cy.screenshot('nav-logged-out-links');
  });

  it('highlights the active link for /account/login', () => {
    cy.visitApp('/account/login');
    cy.contains('a', 'Login').should('have.class', 'text-gradient-orange');
    cy.screenshot('nav-logged-out-login-active');
  });

  it('highlights the active link for /account/register', () => {
    cy.visitApp('/account/register');
    cy.contains('a', 'Signup').should('have.class', 'text-gradient-orange');
    cy.screenshot('nav-logged-out-signup-active');
  });
});
