export const RUNLANE_PRODUCT_NAME = 'Runlane Core' as const;

export type RunlaneServiceName = 'api' | 'worker';

export interface RunlaneServiceDescriptor {
  product: typeof RUNLANE_PRODUCT_NAME;
  service: RunlaneServiceName;
}
