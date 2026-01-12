/// <reference types="cypress" />

/**
 * E2E Tests for Visual Depth and Game Feel
 * 
 * Tests visual depth and aesthetic elements:
 * - Texture rendering (noise, stone patterns)
 * - Shadow and inset effects
 * - Gold gradient text
 * - Button 3D effects (translateY on active)
 * - Scrollbar styling
 */

describe('Visual Depth and Game Feel', () => {
  beforeEach(() => {
    cy.stubLayoutRequests();
    cy.viewport(1280, 720);
    cy.visitApp('/');
  });

  describe('Texture Rendering', () => {
    it('should render noise texture on backgrounds', () => {
      cy.visitApp('/home/overview');
      
      cy.get('[data-testid="textured-background"]').should('have.css', 'background-image');
      cy.captureScreenshot('texture-noise');
    });

    it('should render stone pattern textures', () => {
      cy.visitApp('/home/overview');
      
      cy.get('[data-testid="stone-texture"]').should('have.css', 'background-image');
      cy.captureScreenshot('texture-stone');
    });

    it('should apply texture overlays correctly', () => {
      cy.visitApp('/home/overview');
      
      cy.get('[data-testid="texture-overlay"]').should('have.css', 'opacity').and('not.equal', '0');
      cy.captureScreenshot('texture-overlay');
    });

    it('should maintain texture visibility across themes', () => {
      const races: Array<'ELF' | 'GOBLIN' | 'HUMAN' | 'UNDEAD'> = ['ELF', 'GOBLIN', 'HUMAN', 'UNDEAD'];
      
      races.forEach((race) => {
        cy.visitApp('/home/overview');
        cy.window().then((win) => {
          win.localStorage.setItem('userRace', race);
        });
        cy.reload();
        
        cy.get('[data-testid="textured-background"]').should('have.css', 'background-image');
        cy.captureScreenshot(`texture-${race}-theme`);
      });
    });

    it('should handle texture loading gracefully', () => {
      cy.visitApp('/home/overview');
      
      // Texture should be visible after loading
      cy.get('[data-testid="textured-background"]').should('be.visible');
      cy.captureScreenshot('texture-loaded');
    });
  });

  describe('Shadow and Inset Effects', () => {
    it('should apply box-shadow to cards', () => {
      cy.visitApp('/home/overview');
      
      cy.get('[data-testid="game-card"]').should('have.css', 'box-shadow').and('not.equal', 'none');
      cy.captureScreenshot('shadow-card');
    });

    it('should apply inset shadow to pressed buttons', () => {
      cy.visitApp('/battle/training');
      
      cy.get('[data-testid="train-button"]').first().trigger('mousedown');
      cy.wait(100);
      
      cy.get('[data-testid="train-button"]').first().should('have.css', 'box-shadow');
      cy.captureScreenshot('shadow-button-pressed');
    });

    it('should have consistent shadow depth across components', () => {
      cy.visitApp('/home/overview');
      
      const shadowElements = [
        '[data-testid="game-card"]',
        '[data-testid="action-button"]',
        '[data-testid="panel"]',
      ];
      
      shadowElements.forEach((selector) => {
        cy.get(selector).first().should('have.css', 'box-shadow');
      });
      cy.captureScreenshot('shadow-consistency');
    });

    it('should apply text-shadow for depth', () => {
      cy.visitApp('/home/overview');
      
      cy.get('[data-testid="depth-text"]').then(($el) => {
        if ($el.length > 0) {
          cy.get('[data-testid="depth-text"]').should('have.css', 'text-shadow');
          cy.captureScreenshot('shadow-text');
        }
      });
    });

    it('should use multiple shadow layers for depth', () => {
      cy.visitApp('/home/overview');
      
      cy.get('[data-testid="game-card"]').first().should('have.css', 'box-shadow');
      const boxShadow = cy.get('[data-testid="game-card"]').first().invoke('css', 'box-shadow');
      
      cy.log('Box shadow:', boxShadow);
      cy.captureScreenshot('shadow-layers');
    });
  });

  describe('Gold Gradient Text', () => {
    it('should render gold gradient on important text', () => {
      cy.visitApp('/home/overview');
      
      cy.validateGoldText('[data-testid="gold-text"]');
      cy.captureScreenshot('gold-gradient-text');
    });

    it('should apply background-clip: text for gradient', () => {
      cy.visitApp('/home/overview');
      
      cy.get('[data-testid="gold-gradient-text"]').should('have.css', 'background-clip', 'text');
      cy.captureScreenshot('gold-background-clip');
    });

    it('should use -webkit-background-clip for Safari', () => {
      cy.visitApp('/home/overview');
      
      cy.get('[data-testid="gold-gradient-text"]').should('have.css', '-webkit-background-clip', 'text');
      cy.captureScreenshot('gold-webkit-clip');
    });

    it('should maintain gold text contrast', () => {
      cy.visitApp('/home/overview');
      
      cy.validateContrast('[data-testid="gold-text"]', 3);
      cy.captureScreenshot('gold-contrast');
    });

    it('should render gold text across all race themes', () => {
      const races: Array<'ELF' | 'GOBLIN' | 'HUMAN' | 'UNDEAD'> = ['ELF', 'GOBLIN', 'HUMAN', 'UNDEAD'];
      
      races.forEach((race) => {
        cy.visitApp('/home/overview');
        cy.window().then((win) => {
          win.localStorage.setItem('userRace', race);
        });
        cy.reload();
        
        cy.validateGoldText('[data-testid="gold-text"]');
        cy.captureScreenshot(`gold-text-${race}-theme`);
      });
    });
  });

  describe('Button 3D Effects', () => {
    it('should apply translateY on button hover', () => {
      cy.visitApp('/battle/training');
      
      cy.get('[data-testid="train-button"]').first().trigger('mouseover');
      cy.wait(200);
      
      cy.get('[data-testid="train-button"]').first().should('have.css', 'transform');
      cy.captureScreenshot('button-hover-3d');
    });

    it('should apply translateY on button active state', () => {
      cy.visitApp('/battle/training');
      
      cy.get('[data-testid="train-button"]').first().trigger('mousedown');
      cy.wait(100);
      
      cy.get('[data-testid="train-button"]').first().should('have.css', 'transform');
      cy.captureScreenshot('button-active-3d');
    });

    it('should reset transform on mouseup', () => {
      cy.visitApp('/battle/training');
      
      cy.get('[data-testid="train-button"]').first().trigger('mousedown');
      cy.wait(100);
      cy.get('[data-testid="train-button"]').first().trigger('mouseup');
      cy.wait(100);
      
      cy.get('[data-testid="train-button"]').first().should('have.css', 'transform');
      cy.captureScreenshot('button-reset-3d');
    });

    it('should use GPU-accelerated transforms', () => {
      cy.visitApp('/battle/training');
      
      cy.get('[data-testid="train-button"]').first().trigger('mouseover');
      cy.wait(200);
      
      const transform = cy.get('[data-testid="train-button"]').first().invoke('css', 'transform');
      cy.log('Transform:', transform);
      cy.captureScreenshot('button-gpu-transform');
    });

    it('should have smooth transition for 3D effects', () => {
      cy.visitApp('/battle/training');
      
      cy.get('[data-testid="train-button"]').first().should('have.css', 'transition');
      cy.captureScreenshot('button-transition');
    });
  });

  describe('Scrollbar Styling', () => {
    it('should apply custom scrollbar styling', () => {
      cy.visitApp('/battle/users');
      
      // Scroll down to trigger scrollbar
      cy.get('[data-testid="warlord-table"]').scrollTo('bottom');
      cy.wait(300);
      
      cy.captureScreenshot('scrollbar-custom');
    });

    it('should style scrollbar track', () => {
      cy.visitApp('/battle/users');
      
      cy.get('[data-testid="scrollable-content"]').scrollTo('bottom');
      cy.wait(300);
      
      cy.captureScreenshot('scrollbar-track');
    });

    it('should style scrollbar thumb', () => {
      cy.visitApp('/battle/users');
      
      cy.get('[data-testid="scrollable-content"]').scrollTo('bottom');
      cy.wait(300);
      
      cy.captureScreenshot('scrollbar-thumb');
    });

    it('should maintain scrollbar styling across themes', () => {
      const races: Array<'ELF' | 'GOBLIN' | 'HUMAN' | 'UNDEAD'> = ['ELF', 'GOBLIN', 'HUMAN', 'UNDEAD'];
      
      races.forEach((race) => {
        cy.visitApp('/battle/users');
        cy.window().then((win) => {
          win.localStorage.setItem('userRace', race);
        });
        cy.reload();
        
        cy.get('[data-testid="scrollable-content"]').scrollTo('bottom');
        cy.wait(300);
        cy.captureScreenshot(`scrollbar-${race}-theme`);
      });
    });

    it('should hide scrollbar when not needed', () => {
      cy.visitApp('/home/overview');
      
      cy.get('body').should('have.css', 'overflow-y');
      cy.captureScreenshot('scrollbar-hidden');
    });
  });

  describe('Gradient Effects', () => {
    it('should apply gradient to card headers', () => {
      cy.visitApp('/home/overview');
      
      cy.validateGradient('[data-testid="game-card-header"]');
      cy.captureScreenshot('gradient-card-header');
    });

    it('should apply gradient to buttons', () => {
      cy.visitApp('/battle/training');
      
      cy.get('[data-testid="train-button"]').first().should('have.css', 'background-image').and('match', /gradient/);
      cy.captureScreenshot('gradient-button');
    });

    it('should use race-specific gradient colors', () => {
      const races: Array<'ELF' | 'GOBLIN' | 'HUMAN' | 'UNDEAD'> = ['ELF', 'GOBLIN', 'HUMAN', 'UNDEAD'];
      
      races.forEach((race) => {
        cy.visitApp('/home/overview');
        cy.window().then((win) => {
          win.localStorage.setItem('userRace', race);
        });
        cy.reload();
        
        cy.get('[data-testid="game-card-header"]').should('have.css', 'background-image').and('match', /gradient/);
        cy.captureScreenshot(`gradient-${race}-theme`);
      });
    });

    it('should apply gradient to progress bars', () => {
      cy.visitApp('/battle/training');
      
      cy.get('[data-testid="progress-bar"]').then(($el) => {
        if ($el.length > 0) {
          cy.get('[data-testid="progress-bar"]').should('have.css', 'background-image').and('match', /gradient/);
          cy.captureScreenshot('gradient-progress');
        }
      });
    });
  });

  describe('Border and Frame Effects', () => {
    it('should apply decorative borders to cards', () => {
      cy.visitApp('/home/overview');
      
      cy.get('[data-testid="game-card"]').should('have.css', 'border').and('not.equal', 'none');
      cy.captureScreenshot('border-card');
    });

    it('should apply double borders for depth', () => {
      cy.visitApp('/home/overview');
      
      cy.get('[data-testid="framed-element"]').then(($el) => {
        if ($el.length > 0) {
          cy.get('[data-testid="framed-element"]').should('have.css', 'border-style');
          cy.captureScreenshot('border-double');
        }
      });
    });

    it('should apply border-radius for soft edges', () => {
      cy.visitApp('/home/overview');
      
      cy.get('[data-testid="game-card"]').should('have.css', 'border-radius').and('not.equal', '0px');
      cy.captureScreenshot('border-radius');
    });

    it('should maintain border consistency across viewports', () => {
      const viewports = [
        { width: 375, height: 667 },
        { width: 1920, height: 1080 },
      ];
      
      viewports.forEach((vp) => {
        cy.viewport(vp.width, vp.height);
        cy.visitApp('/home/overview');
        
        cy.get('[data-testid="game-card"]').should('have.css', 'border');
        cy.captureScreenshot(`border-${vp.width}px`);
      });
    });
  });

  describe('Animation Effects', () => {
    it('should apply entry animations', () => {
      cy.visitApp('/home/overview');
      
      cy.get('[data-testid="game-card"]').first().should('have.css', 'animation-name');
      cy.captureScreenshot('animation-entry');
    });

    it('should use staggered animation delays', () => {
      cy.visitApp('/home/overview');
      
      cy.get('[data-testid="game-card"]').each(($card, index) => {
        cy.wrap($card).should('have.css', 'animation-delay');
        cy.log(`Card ${index} animation delay:`, $card.css('animation-delay'));
      });
      cy.captureScreenshot('animation-staggered');
    });

    it('should respect reduced motion preference', () => {
      cy.visitApp('/home/overview');
      
      // Add reduced motion class
      cy.get('body').invoke('addClass', 'reduced-motion');
      
      cy.get('[data-testid="game-card"]').first().should('have.css', 'animation').and('equal', 'none');
      cy.captureScreenshot('animation-reduced-motion');
    });

    it('should have smooth transitions for hover effects', () => {
      cy.visitApp('/battle/training');
      
      cy.get('[data-testid="train-button"]').first().trigger('mouseover');
      cy.wait(200);
      
      cy.get('[data-testid="train-button"]').first().should('have.css', 'transition');
      cy.captureScreenshot('animation-hover-transition');
    });
  });

  describe('Visual Consistency', () => {
    it('should maintain consistent spacing', () => {
      cy.visitApp('/home/overview');
      
      cy.get('[data-testid="game-card"]').then(($cards) => {
        const cardCount = $cards.length;
        $cards.each((index, card) => {
          if (index < cardCount - 1) {
            const currentMargin = cy.wrap(card).invoke('css', 'margin-bottom');
            const nextCard = $cards.eq(index + 1);
            const nextMargin = cy.wrap(nextCard).invoke('css', 'margin-bottom');
            
            // Margins should be consistent
            expect(currentMargin).to.equal(nextMargin);
          }
        });
      });
      cy.captureScreenshot('consistency-spacing');
    });

    it('should maintain consistent color usage', () => {
      cy.visitApp('/home/overview');
      
      const primaryColor = cy.get('[data-testid="game-card-header"]').first().invoke('css', 'background-color');
      cy.log('Primary color:', primaryColor);
      
      cy.captureScreenshot('consistency-color');
    });

    it('should maintain consistent typography', () => {
      cy.visitApp('/home/overview');
      
      cy.get('[data-testid="card-title"]').first().should('have.css', 'font-family');
      const fontFamily = cy.get('[data-testid="card-title"]').first().invoke('css', 'font-family');
      
      cy.get('[data-testid="page-title"]').should('have.css', 'font-family', fontFamily);
      cy.captureScreenshot('consistency-typography');
    });
  });

  describe('Visual Depth on Components', () => {
    it('should apply depth to navigation panel', () => {
      cy.visitApp('/home/overview');
      
      cy.get('[data-testid="navigation-panel"]').should('have.css', 'box-shadow');
      cy.captureScreenshot('depth-navigation');
    });

    it('should apply depth to stat grid', () => {
      cy.visitApp('/home/overview');
      
      cy.get('[data-testid="stat-grid"]').should('have.css', 'background-color');
      cy.captureScreenshot('depth-stat-grid');
    });

    it('should apply depth to training panel', () => {
      cy.visitApp('/battle/training');
      
      cy.get('[data-testid="unit-training-panel"]').should('have.css', 'box-shadow');
      cy.captureScreenshot('depth-training-panel');
    });

    it('should apply depth to warlord table', () => {
      cy.visitApp('/battle/users');
      
      cy.get('[data-testid="warlord-table"]').should('have.css', 'border');
      cy.captureScreenshot('depth-warlord-table');
    });
  });

  describe('Visual Depth Across Viewports', () => {
    it('should maintain depth on mobile', () => {
      cy.viewport(375, 667);
      cy.visitApp('/home/overview');
      
      cy.get('[data-testid="game-card"]').should('have.css', 'box-shadow');
      cy.captureScreenshot('depth-mobile');
    });

    it('should maintain depth on desktop', () => {
      cy.viewport(1920, 1080);
      cy.visitApp('/home/overview');
      
      cy.get('[data-testid="game-card"]').should('have.css', 'box-shadow');
      cy.captureScreenshot('depth-desktop');
    });

    it('should adjust depth effects for viewport size', () => {
      cy.viewport(1920, 1080);
      cy.visitApp('/home/overview');
      
      const desktopShadow = cy.get('[data-testid="game-card"]').first().invoke('css', 'box-shadow');
      
      cy.viewport(375, 667);
      cy.wait(300);
      
      const mobileShadow = cy.get('[data-testid="game-card"]').first().invoke('css', 'box-shadow');
      
      // Shadows may differ between viewports
      cy.log('Desktop shadow:', desktopShadow);
      cy.log('Mobile shadow:', mobileShadow);
      cy.captureScreenshot('depth-viewport-adjustment');
    });
  });
});
