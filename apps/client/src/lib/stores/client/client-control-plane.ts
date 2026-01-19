import { writable } from 'svelte/store';

export type TransferOffer = {
  offerId: string;
  fromActorId: string;
  groupIds: string[];
};

export const transferOffer = writable<TransferOffer | null>(null);
export const controlPlaneSafeMode = writable<boolean>(true);
