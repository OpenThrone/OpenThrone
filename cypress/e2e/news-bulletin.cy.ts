/// <reference types="cypress" />

describe('News bulletin', () => {
  beforeEach(() => {
    cy.stubLayoutRequests();
    cy.viewport(1280, 720);
  });

  it('renders and dismisses the bulletin when configured', function () {
    cy.visitApp('/home/overview');

    cy.get('body').then(($body) => {
      const banner = $body.find('[aria-label="Site announcement"]');
      if (!banner.length) {
        cy.log('News bulletin not configured; skipping assertions.');
        return;
      }

      cy.get('[aria-label="Site announcement"]').should('be.visible');
      cy.screenshot('news-bulletin-visible');
      cy.get('button[aria-label="Dismiss announcement"]').click();
      cy.get('[aria-label="Site announcement"]').should('not.exist');
      cy.screenshot('news-bulletin-dismissed');

      cy.reload();
      cy.get('[aria-label="Site announcement"]').should('not.exist');
    });
  });
});
