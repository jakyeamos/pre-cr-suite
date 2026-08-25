/**
 * Explicit opt-in surface for legacy Pre-CR tools.
 *
 * These modules are not part of the stable beta package entrypoint. They remain
 * available for the experimental VS Code/server integration through the
 * `@pre-cr/core/experimental` subpath until they are removed or promoted.
 */

export * from './checklist';
export * from './docgen';
export * from './review';
export * from './context';
export * from './debug';
export * from './contributionProof';
