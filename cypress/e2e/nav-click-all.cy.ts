/// <reference types="cypress" />

describe('Nav - Visit all internal nav links', () => {
  before(() => {
    cy.loginAdmin();
  });

  it('collects internal nav links, visits each, and screenshots', () => {
    cy.stubLayoutRequests();
    cy.visitApp('/home/overview');

    cy.get('header').find('a[href]').then(($els) => {
      const hrefs = new Set<string>();

      // Collect unique internal hrefs
      Array.from($els).forEach((el) => {
        const a = el as HTMLAnchorElement;
        if (!a.href) return;

        try {
          const url = new URL(a.href);
          // Skip API endpoints and mailto/external targets
          if (url.pathname.startsWith('/api')) return;
          if (url.origin !== window.location.origin) return;

          const path = url.pathname + url.search + url.hash;
          // Only include pages (start with `/`)
          if (path && path.startsWith('/')) hrefs.add(path.replace(/\/+$/, ''));
        } catch (e) {
          // ignore malformed URLs
        }
      });

      const list = Array.from(hrefs);
      cy.log(`Found ${list.length} internal nav links`);

      // Visit each link and take a screenshot
      list.forEach((p) => {
        const name = p === '/' ? 'root' : p.replace(/\//g, '_').replace(/^_/, '');
        cy.stubLayoutRequests();
        cy.visitApp(p);
        cy.get('body', { timeout: 10000 }).should('exist');
        cy.screenshot(`nav${name ? `-${name}` : ''}`);
      });
    });
  });
});
