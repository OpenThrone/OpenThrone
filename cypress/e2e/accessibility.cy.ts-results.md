29 passing (4m)
  12 failing

  1) Accessibility Compliance
       WCAG AA Color Contrast
         should validate contrast for error messages:
     AssertionError: Timed out retrying after 4000ms: Expected to find element: `[data-testid="error-message"]`, but never found it. Queried from:

              > cy.get(body)
      at Context.eval (webpack://openthrone/./cypress/e2e/accessibility.cy.ts:59:0)

  2) Accessibility Compliance
       Focus Management
         should trap focus within modals:
     AssertionError: Timed out retrying after 4000ms: Expected to find element: `[data-testid="modal-trigger"]`, but never found it. Queried from:

              > cy.get(body)
      at Context.eval (webpack://openthrone/./cypress/e2e/accessibility.cy.ts:219:0)

  3) Accessibility Compliance
       Focus Management
         should return focus to trigger after modal close:
     AssertionError: Timed out retrying after 4000ms: Expected to find element: `[data-testid="modal-trigger"]`, but never found it. Queried from:

              > cy.get(body)
      at Context.eval (webpack://openthrone/./cypress/e2e/accessibility.cy.ts:231:0)

  4) Accessibility Compliance
       Focus Management
         should manage focus during form validation:
     AssertionError: Timed out retrying after 4000ms: Expected to find element: `[data-testid="error-message"]`, but never found it. Queried from:

              > cy.get(body)
      at Context.eval (webpack://openthrone/./cypress/e2e/accessibility.cy.ts:247:0)

  5) Accessibility Compliance
       Screen Reader Compatibility
         should have aria-describedby for form field descriptions:
     AssertionError: Timed out retrying after 4000ms: expected '<input#password.m_f2d85dd2.mantine-PasswordInput-innerInput>' to have attribute 'aria-describedby'
      at Context.eval (webpack://openthrone/./cypress/e2e/accessibility.cy.ts:282:0)

  6) Accessibility Compliance
       Touch Target Sizes (WCAG 2.5.5)
         should have minimum 48px touch targets on mobile:
     AssertionError: Touch target width 0px is below minimum 48px: expected 0 to be at least 48
      at Context.eval (webpack://openthrone/./cypress/support/e2e.ts:54:0)

  7) Accessibility Compliance
       Touch Target Sizes (WCAG 2.5.5)
         should have minimum 48px touch targets for form inputs:

      Touch target height 46px is below minimum 48px
      + expected - actual

      -46
      +48
      
      at Context.eval (webpack://openthrone/./cypress/support/e2e.ts:55:0)

  8) Accessibility Compliance
       Touch Target Sizes (WCAG 2.5.5)
         should have adequate spacing between touch targets:
     AssertionError: Timed out retrying after 4000ms: Expected to find element: `[data-testid="train-button"]`, but never found it.
      at Context.eval (webpack://openthrone/./cypress/e2e/accessibility.cy.ts:326:0)

  9) Accessibility Compliance
       Skip Links
         should focus on main content when skip link is activated:
     AssertionError: Timed out retrying after 4000ms: expected '<a.skip-link>' to have attribute 'id'
      at Context.eval (webpack://openthrone/./cypress/e2e/accessibility.cy.ts:348:0)

  10) Accessibility Compliance
       Error Handling
         should announce errors with aria-live:
     AssertionError: Timed out retrying after 4000ms: Expected to find element: `[data-testid="error-message"]`, but never found it.
      at Context.eval (webpack://openthrone/./cypress/e2e/accessibility.cy.ts:357:0)

  11) Accessibility Compliance
       Error Handling
         should associate error messages with form fields:
     AssertionError: Timed out retrying after 4000ms: Expected to find element: `[data-testid="error-message"]`, but never found it.
      at Context.eval (webpack://openthrone/./cypress/e2e/accessibility.cy.ts:364:0)

  12) Accessibility Compliance
       Accessibility Across Viewports
         should maintain accessibility during viewport resize:
     AssertionError: Timed out retrying after 4000ms: Expected to find element: `focused`, but never found it.
      at Context.eval (webpack://openthrone/./cypress/e2e/accessibility.cy.ts:394:0)




  (Results)

  ┌────────────────────────────────────────────────────────────────────────────────────────────────┐
  │ Tests:        41                                                                               │
  │ Passing:      29                                                                               │
  │ Failing:      12                                                                               │
  │ Pending:      0                                                                                │
  │ Skipped:      0                                                                                │
  │ Screenshots:  58                                                                               │
  │ Video:        false                                                                            │
  │ Duration:     3 minutes, 44 seconds                                                            │
  │ Spec Ran:     accessibility.cy.ts                                                              │
  └────────────────────────────────────