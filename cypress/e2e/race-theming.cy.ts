/// <reference types="cypress" />

/**
 * E2E Tests for Race-Specific Theming
 *
 * Tests visual themes for each race:
 * - ELF: Green/gold palette with nature-inspired tones
 * - GOBLIN: Red/brown palette with earthy tones
 * - HUMAN: Blue/gray palette with neutral tones
 * - UNDEAD: Gray/black palette with dark tones
 *
 * Validates:
 * - Color scheme consistency
 * - WCAG AA color contrast ratios (minimum 4.5:1)
 * - Gold accent text rendering
 * - Theme-specific visual elements
 */

describe('Race-Specific Theming', () => {
  const raceThemes = {
    ELF: {
      name: 'Elf',
      primaryColors: [
        'rgb(34, 139, 34)',
        'rgb(0, 128, 0)',
        '#228b22',
        '#008000',
      ],
      accentColors: [
        'rgb(255, 215, 0)',
        'rgb(255, 193, 7)',
        '#ffd700',
        '#ffc107',
      ],
      backgroundTones: ['rgb(240, 255, 240)', 'rgb(245, 255, 245)'],
      description: 'Nature-inspired green with gold accents',
    },
    GOBLIN: {
      name: 'Goblin',
      primaryColors: [
        'rgb(139, 69, 19)',
        'rgb(160, 82, 45)',
        '#8b4513',
        '#a0522d',
      ],
      accentColors: [
        'rgb(205, 92, 92)',
        'rgb(178, 34, 34)',
        '#cd5c5c',
        '#b22222',
      ],
      backgroundTones: ['rgb(245, 235, 220)', 'rgb(250, 240, 230)'],
      description: 'Earthy brown with red accents',
    },
    HUMAN: {
      name: 'Human',
      primaryColors: [
        'rgb(70, 130, 180)',
        'rgb(100, 149, 237)',
        '#4682b4',
        '#6495ed',
      ],
      accentColors: [
        'rgb(255, 215, 0)',
        'rgb(192, 192, 192)',
        '#ffd700',
        '#c0c0c0',
      ],
      backgroundTones: ['rgb(245, 247, 250)', 'rgb(248, 250, 252)'],
      description: 'Royal blue with silver accents',
    },
    UNDEAD: {
      name: 'Undead',
      primaryColors: [
        'rgb(64, 64, 64)',
        'rgb(32, 32, 32)',
        '#404040',
        '#202020',
      ],
      accentColors: [
        'rgb(128, 128, 128)',
        'rgb(169, 169, 169)',
        '#808080',
        '#a9a9a9',
      ],
      backgroundTones: ['rgb(20, 20, 20)', 'rgb(30, 30, 30)'],
      description: 'Dark gray with silver accents',
    },
  };

  beforeEach(() => {
    cy.stubLayoutRequests();
    cy.viewport(1280, 720);
  });

  describe('ELF Theme', () => {
    it('should apply ELF green/gold color palette', () => {
      cy.visitApp('/home/overview');

      // Simulate ELF theme selection
      cy.window().then((win) => {
        win.localStorage.setItem('userRace', 'ELF');
      });
      cy.reload();
      cy.wait(500);

      // Validate primary green colors
      cy.get('[data-testid="race-header"]')
        .should('have.css', 'background-color')
        .and('match', /rgb\(34,\s*139,\s*34\)|rgb\(0,\s*128,\s*0\)/);

      // Validate gold accents
      cy.validateGoldText('[data-testid="gold-accent"]');
    });

    it('should display ELF-specific shield icon', () => {
      cy.visitApp('/home/overview');
      cy.window().then((win) => {
        win.localStorage.setItem('userRace', 'ELF');
      });
      cy.reload();

      cy.get('[data-testid="race-shield"] img')
        .should('have.attr', 'src')
        .and('include', 'ELF');
    });

    it('should maintain ELF theme across navigation', () => {
      cy.visitApp('/home/overview');
      cy.window().then((win) => {
        win.localStorage.setItem('userRace', 'ELF');
      });
      cy.reload();

      const pages = ['/battle/training', '/battle/users', '/community/news'];

      pages.forEach((page) => {
        cy.visitApp(page);
        cy.wait(300);

        // Theme should persist
        cy.get('[data-testid="race-header"]')
          .should('have.css', 'background-color')
          .and('match', /rgb\(34,\s*139,\s*34\)|rgb\(0,\s*128,\s*0\)/);
      });
    });

    it('should validate ELF theme color contrast ratios', () => {
      cy.visitApp('/home/overview');
      cy.window().then((win) => {
        win.localStorage.setItem('userRace', 'ELF');
      });
      cy.reload();

      // Validate contrast for key elements
      cy.validateContrast('[data-testid="page-title"]', 4.5);
      cy.validateContrast('[data-testid="nav-link"]', 4.5);
      cy.validateContrast('[data-testid="content-text"]', 4.5);
    });
  });

  describe('GOBLIN Theme', () => {
    it('should apply GOBLIN red/brown color palette', () => {
      cy.visitApp('/home/overview');
      cy.window().then((win) => {
        win.localStorage.setItem('userRace', 'GOBLIN');
      });
      cy.reload();
      cy.wait(500);

      // Validate primary brown colors
      cy.get('[data-testid="race-header"]')
        .should('have.css', 'background-color')
        .and('match', /rgb\(139,\s*69,\s*19\)|rgb\(160,\s*82,\s*45\)/);

      // Validate red accents
      cy.get('[data-testid="accent-element"]')
        .should('have.css', 'color')
        .and('match', /rgb\(205,\s*92,\s*92\)|rgb\(178,\s*34,\s*34\)/);
    });

    it('should display GOBLIN-specific shield icon', () => {
      cy.visitApp('/home/overview');
      cy.window().then((win) => {
        win.localStorage.setItem('userRace', 'GOBLIN');
      });
      cy.reload();

      cy.get('[data-testid="race-shield"] img')
        .should('have.attr', 'src')
        .and('include', 'GOBLIN');
    });

    it('should maintain GOBLIN theme across navigation', () => {
      cy.visitApp('/home/overview');
      cy.window().then((win) => {
        win.localStorage.setItem('userRace', 'GOBLIN');
      });
      cy.reload();

      const pages = ['/battle/training', '/battle/users', '/community/news'];

      pages.forEach((page) => {
        cy.visitApp(page);
        cy.wait(300);

        cy.get('[data-testid="race-header"]')
          .should('have.css', 'background-color')
          .and('match', /rgb\(139,\s*69,\s*19\)|rgb\(160,\s*82,\s*45\)/);
      });
    });

    it('should validate GOBLIN theme color contrast ratios', () => {
      cy.visitApp('/home/overview');
      cy.window().then((win) => {
        win.localStorage.setItem('userRace', 'GOBLIN');
      });
      cy.reload();

      cy.validateContrast('[data-testid="page-title"]', 4.5);
      cy.validateContrast('[data-testid="nav-link"]', 4.5);
      cy.validateContrast('[data-testid="content-text"]', 4.5);
    });
  });

  describe('HUMAN Theme', () => {
    it('should apply HUMAN blue/gray color palette', () => {
      cy.visitApp('/home/overview');
      cy.window().then((win) => {
        win.localStorage.setItem('userRace', 'HUMAN');
      });
      cy.reload();
      cy.wait(500);

      // Validate primary blue colors
      cy.get('[data-testid="race-header"]')
        .should('have.css', 'background-color')
        .and('match', /rgb\(70,\s*130,\s*180\)|rgb\(100,\s*149,\s*237\)/);

      // Validate silver/gray accents
      cy.get('[data-testid="accent-element"]')
        .should('have.css', 'color')
        .and('match', /rgb\(192,\s*192,\s*192\)|rgb\(169,\s*169,\s*169\)/);
    });

    it('should display HUMAN-specific shield icon', () => {
      cy.visitApp('/home/overview');
      cy.window().then((win) => {
        win.localStorage.setItem('userRace', 'HUMAN');
      });
      cy.reload();

      cy.get('[data-testid="race-shield"] img')
        .should('have.attr', 'src')
        .and('include', 'HUMAN');
    });

    it('should maintain HUMAN theme across navigation', () => {
      cy.visitApp('/home/overview');
      cy.window().then((win) => {
        win.localStorage.setItem('userRace', 'HUMAN');
      });
      cy.reload();

      const pages = ['/battle/training', '/battle/users', '/community/news'];

      pages.forEach((page) => {
        cy.visitApp(page);
        cy.wait(300);

        cy.get('[data-testid="race-header"]')
          .should('have.css', 'background-color')
          .and('match', /rgb\(70,\s*130,\s*180\)|rgb\(100,\s*149,\s*237\)/);
      });
    });

    it('should validate HUMAN theme color contrast ratios', () => {
      cy.visitApp('/home/overview');
      cy.window().then((win) => {
        win.localStorage.setItem('userRace', 'HUMAN');
      });
      cy.reload();

      cy.validateContrast('[data-testid="page-title"]', 4.5);
      cy.validateContrast('[data-testid="nav-link"]', 4.5);
      cy.validateContrast('[data-testid="content-text"]', 4.5);
    });
  });

  describe('UNDEAD Theme', () => {
    it('should apply UNDEAD gray/black color palette', () => {
      cy.visitApp('/home/overview');
      cy.window().then((win) => {
        win.localStorage.setItem('userRace', 'UNDEAD');
      });
      cy.reload();
      cy.wait(500);

      // Validate primary dark gray colors
      cy.get('[data-testid="race-header"]')
        .should('have.css', 'background-color')
        .and('match', /rgb\(64,\s*64,\s*64\)|rgb\(32,\s*32,\s*32\)/);

      // Validate silver accents
      cy.get('[data-testid="accent-element"]')
        .should('have.css', 'color')
        .and('match', /rgb\(128,\s*128,\s*128\)|rgb\(169,\s*169,\s*169\)/);
    });

    it('should display UNDEAD-specific shield icon', () => {
      cy.visitApp('/home/overview');
      cy.window().then((win) => {
        win.localStorage.setItem('userRace', 'UNDEAD');
      });
      cy.reload();

      cy.get('[data-testid="race-shield"] img')
        .should('have.attr', 'src')
        .and('include', 'UNDEAD');
    });

    it('should maintain UNDEAD theme across navigation', () => {
      cy.visitApp('/home/overview');
      cy.window().then((win) => {
        win.localStorage.setItem('userRace', 'UNDEAD');
      });
      cy.reload();

      const pages = ['/battle/training', '/battle/users', '/community/news'];

      pages.forEach((page) => {
        cy.visitApp(page);
        cy.wait(300);

        cy.get('[data-testid="race-header"]')
          .should('have.css', 'background-color')
          .and('match', /rgb\(64,\s*64,\s*64\)|rgb\(32,\s*32,\s*32\)/);
      });
    });

    it('should validate UNDEAD theme color contrast ratios', () => {
      cy.visitApp('/home/overview');
      cy.window().then((win) => {
        win.localStorage.setItem('userRace', 'UNDEAD');
      });
      cy.reload();

      cy.validateContrast('[data-testid="page-title"]', 4.5);
      cy.validateContrast('[data-testid="nav-link"]', 4.5);
      cy.validateContrast('[data-testid="content-text"]', 4.5);
    });
  });

  describe('Theme Switching', () => {
    it('should switch between race themes correctly', () => {
      const races: Array<'ELF' | 'GOBLIN' | 'HUMAN' | 'UNDEAD'> = [
        'ELF',
        'GOBLIN',
        'HUMAN',
        'UNDEAD',
      ];

      races.forEach((race) => {
        cy.visitApp('/home/overview');
        cy.window().then((win) => {
          win.localStorage.setItem('userRace', race);
        });
        cy.reload();
        cy.wait(500);

        const theme = raceThemes[race];
        cy.get('[data-testid="race-header"]').should(
          'have.css',
          'background-color',
        );
        cy.captureScreenshot(`theme-${race}`);
      });
    });

    it('should preserve theme after page reload', () => {
      cy.visitApp('/home/overview');
      cy.window().then((win) => {
        win.localStorage.setItem('userRace', 'ELF');
      });
      cy.reload();

      cy.get('[data-testid="race-header"]')
        .should('have.css', 'background-color')
        .and('match', /rgb\(34,\s*139,\s*34\)|rgb\(0,\s*128,\s*0\)/);

      cy.reload();
      cy.get('[data-testid="race-header"]')
        .should('have.css', 'background-color')
        .and('match', /rgb\(34,\s*139,\s*34\)|rgb\(0,\s*128,\s*0\)/);
    });
  });

  describe('Gold Accent Text', () => {
    it('should render gold accent text correctly for all races', () => {
      const races: Array<'ELF' | 'GOBLIN' | 'HUMAN' | 'UNDEAD'> = [
        'ELF',
        'GOBLIN',
        'HUMAN',
        'UNDEAD',
      ];

      races.forEach((race) => {
        cy.visitApp('/home/overview');
        cy.window().then((win) => {
          win.localStorage.setItem('userRace', race);
        });
        cy.reload();

        cy.get('[data-testid="gold-accent"]').then(($el) => {
          if ($el.length > 0) {
            cy.validateGoldText('[data-testid="gold-accent"]');
          }
        });
      });
    });

    it('should apply gold gradient to important text', () => {
      cy.visitApp('/home/overview');
      cy.window().then((win) => {
        win.localStorage.setItem('userRace', 'ELF');
      });
      cy.reload();

      cy.get('[data-testid="gold-gradient-text"]')
        .should('have.css', 'background-clip')
        .and('equal', 'text');
    });
  });

  describe('WCAG AA Contrast Validation', () => {
    it('should meet WCAG AA contrast for all race themes', () => {
      const races: Array<'ELF' | 'GOBLIN' | 'HUMAN' | 'UNDEAD'> = [
        'ELF',
        'GOBLIN',
        'HUMAN',
        'UNDEAD',
      ];

      races.forEach((race) => {
        cy.visitApp('/home/overview');
        cy.window().then((win) => {
          win.localStorage.setItem('userRace', race);
        });
        cy.reload();

        // Test key elements for contrast
        const contrastElements = [
          '[data-testid="page-title"]',
          '[data-testid="nav-link"]',
          '[data-testid="content-text"]',
          '[data-testid="button-text"]',
        ];

        contrastElements.forEach((selector) => {
          cy.get(selector).then(($el) => {
            if ($el.length > 0) {
              cy.validateContrast(selector, 4.5);
            }
          });
        });
      });
    });

    it('should validate large text contrast (3:1 minimum)', () => {
      cy.visitApp('/home/overview');
      cy.window().then((win) => {
        win.localStorage.setItem('userRace', 'HUMAN');
      });
      cy.reload();

      cy.get('[data-testid="large-heading"]').then(($el) => {
        if ($el.length > 0) {
          cy.validateContrast('[data-testid="large-heading"]', 3);
        }
      });
    });
  });

  describe('Visual Consistency', () => {
    it('should maintain consistent theme across all UI components', () => {
      cy.visitApp('/home/overview');
      cy.window().then((win) => {
        win.localStorage.setItem('userRace', 'ELF');
      });
      cy.reload();

      // Header
      cy.get('[data-testid="race-header"]').should(
        'have.css',
        'background-color',
      );

      // Buttons
      cy.get('[data-testid="primary-button"]').should(
        'have.css',
        'background-color',
      );

      // Cards
      cy.get('[data-testid="game-card"]').should('have.css', 'border-color');
    });

    it('should apply theme-specific textures and patterns', () => {
      const races: Array<'ELF' | 'GOBLIN' | 'HUMAN' | 'UNDEAD'> = [
        'ELF',
        'GOBLIN',
        'HUMAN',
        'UNDEAD',
      ];

      races.forEach((race) => {
        cy.visitApp('/home/overview');
        cy.window().then((win) => {
          win.localStorage.setItem('userRace', race);
        });
        cy.reload();

        cy.get('[data-testid="textured-background"]').should(
          'have.css',
          'background-image',
        );
      });
    });
  });
});
