# Supporter price changes apply to new purchases only

Date: 2026-10-29. Details: [Supporter memberships](../features/supporter-memberships.md).

## Decision

Changing a supporter price affects new purchases only. Existing monthly subscriptions keep the price accepted when they started, so subscription items are not updated when a public plan price rotates.

## What follows from it

- Monthly recurring revenue comes from recorded subscription charges, never from subscriber count multiplied by the current list price, because old subscribers may pay a different amount.
- Alliance sponsorship pool conversion stays separate and fixed. Editing a plan price must not change it.
