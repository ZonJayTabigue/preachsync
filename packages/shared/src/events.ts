import type { PresentationState } from "./types";

export const socketEvents = {
  next: "presentation:next",
  previous: "presentation:previous",
  goTo: "presentation:goto",
  requestState: "presentation:request-state",
  state: "presentation:state",
  connected: "session:connected",
  error: "session:error",
  controllerCount: "session:controller-count",
  hostToken: "session:host-token",
} as const;

export interface ClientToServerEvents {
  [socketEvents.next]: () => void;
  [socketEvents.previous]: () => void;
  [socketEvents.goTo]: (index: number) => void;
  [socketEvents.requestState]: () => void;
}

export interface ServerToClientEvents {
  [socketEvents.state]: (state: PresentationState) => void;
  [socketEvents.connected]: (payload: { clientId: string }) => void;
  [socketEvents.error]: (payload: { message: string }) => void;
  [socketEvents.controllerCount]: (count: number) => void;
  [socketEvents.hostToken]: (payload: { token: string }) => void;
}
