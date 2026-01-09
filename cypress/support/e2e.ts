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
    cy.get('input#password', { timeout: 5000 }).clear().type(password, { log: false });
    cy.get('#submit-button').click();
    cy.location('pathname', { timeout: 10000 }).should('eq', '/home/overview');
  });

  cy.stubLayoutRequests();
  cy.visitApp('/home/overview');
});

declare global {
  namespace Cypress {
    interface Chainable {
      visitApp(path?: string): Chainable<void>;
      stubLayoutRequests(): Chainable<void>;
      loginAdmin(): Chainable<void>;
    }
  }
}

export {};
