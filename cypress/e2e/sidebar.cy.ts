/// <reference types="cypress" />

describe('Sidebar', () => {
  beforeEach(() => {
    cy.viewport(1280, 720);
    cy.loginAdmin();
  });

  it('renders core stats and timers', () => {
    cy.get('#gold').invoke('text').should('not.be.empty');
    cy.get('#citizens').invoke('text').should('not.be.empty');
    cy.get('#level').invoke('text').should('not.be.empty');
    cy.get('#experience').invoke('text').should('not.be.empty');
    cy.get('#turns').invoke('text').should('not.be.empty');

    cy.get('#nextTurnTimestamp')
      .invoke('text')
      .should('match', /\d{2}:\d{2}/);
    cy.get('#otTime')
      .invoke('text')
      .should('match', /\d{1,2}:\d{2}/);
    cy.screenshot('sidebar-stats');
  });

  it('accepts search input and triggers the lookup', () => {
    cy.intercept('POST', '/api/general/searchUsers', {
      statusCode: 200,
      body: [],
    }).as('searchUsers');

    cy.get('input[placeholder="Type to search..."]').clear().type('test');
    cy.wait('@searchUsers');
    cy.contains('button', 'Search').click();
    cy.screenshot('sidebar-search');
  });
});
