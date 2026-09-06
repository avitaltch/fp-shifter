// Facade for the data layer. Pages import from '../lib/api'; the
// implementation is split by domain so each module has one reason to change.
export * from './services';
export * from './booking';
export * from './eligibility';
export * from './availability';
export * from './shifts';
export * from './assignment';
export * from './dashboard';
export * from './team';
export * from './nest/client';
export * from './nest/publicScheduling';
export * from './nest/auth';
export * from './nest/operator';
export * from './nest/configuration';
export * from './nest/staffing';
