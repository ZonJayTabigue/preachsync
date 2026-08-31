import {
  socketEvents,
  type ClientToServerEvents,
  type PresentationState,
  type ServerToClientEvents,
} from "@preachsync/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import {
  createPreachSyncServer,
  type PreachSyncServer,
} from "./preachsync-server";

type TestClient = Socket<ServerToClientEvents, ClientToServerEvents>;

describe("PreachSync socket server", () => {
  let server: PreachSyncServer;
  let serverUrl: string;
  const clients: TestClient[] = [];

  beforeEach(async () => {
    server = createPreachSyncServer();
    const port = await server.start(0, "127.0.0.1");
    serverUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    clients.forEach((client) => client.disconnect());
    await server.stop();
  });

  function makeClient(role: "host" | "controller"): TestClient {
    const client: TestClient = createClient(serverUrl, {
      auth: { role },
      autoConnect: false,
      transports: ["websocket"],
    });
    clients.push(client);
    return client;
  }

  it("keeps host and controllers synchronized from authoritative state", async () => {
    const host = makeClient("host");
    const hostInitialState = waitForState(host, (state) => {
      return state.currentSlideIndex === 0;
    });
    host.connect();
    await waitForConnection(host);
    expect((await hostInitialState).currentSlide.title).toBe("Welcome");

    const controllerA = makeClient("controller");
    const oneController = waitForCount(host, 1);
    const controllerAInitialState = waitForState(controllerA, (state) => {
      return state.currentSlideIndex === 0;
    });
    controllerA.connect();
    await waitForConnection(controllerA);
    await Promise.all([oneController, controllerAInitialState]);

    const hostSlideTwo = waitForState(host, (state) => {
      return state.currentSlideIndex === 1;
    });
    const controllerASlideTwo = waitForState(controllerA, (state) => {
      return state.currentSlideIndex === 1;
    });
    controllerA.emit(socketEvents.next);
    expect((await hostSlideTwo).currentSlide.title).toBe("John 3:16");
    await controllerASlideTwo;

    const controllerB = makeClient("controller");
    const twoControllers = waitForCount(host, 2);
    const joiningState = waitForState(controllerB, (state) => {
      return state.currentSlideIndex === 1;
    });
    controllerB.connect();
    await waitForConnection(controllerB);
    expect((await joiningState).currentSlide.title).toBe("John 3:16");
    await twoControllers;

    const previousStates = [
      waitForState(host, (state) => state.currentSlideIndex === 0),
      waitForState(controllerA, (state) => state.currentSlideIndex === 0),
      waitForState(controllerB, (state) => state.currentSlideIndex === 0),
    ];
    controllerB.emit(socketEvents.previous);
    await Promise.all(previousStates);

    const invalidIndexError = waitForSessionError(controllerA);
    controllerA.emit(socketEvents.goTo, 1.5);
    await expect(invalidIndexError).resolves.toMatch(/invalid/i);

    const resynchronizedState = waitForState(controllerA, (state) => {
      return state.currentSlideIndex === 0;
    });
    controllerA.emit(socketEvents.requestState);
    expect((await resynchronizedState).currentSlide.title).toBe("Welcome");
  });

  it("sends the host upload token only to the host", async () => {
    const host = makeClient("host");
    const controller = makeClient("controller");
    const hostToken = waitForHostToken(host);
    const controllerToken = waitForHostToken(controller);

    host.connect();
    controller.connect();
    await Promise.all([waitForConnection(host), waitForConnection(controller)]);

    await expect(hostToken).resolves.toMatch(/^[a-f0-9]{64}$/);
    await expect(controllerToken).rejects.toThrow(/timed out/i);
  });

  it("broadcasts a newly loaded presentation to every client", async () => {
    const host = makeClient("host");
    const controller = makeClient("controller");
    host.connect();
    controller.connect();
    await Promise.all([waitForConnection(host), waitForConnection(controller)]);

    const uploadedStates = [
      waitForState(host, (state) => state.presentationId === "uploaded-deck"),
      waitForState(
        controller,
        (state) => state.presentationId === "uploaded-deck",
      ),
    ];

    server.loadPresentation({
      id: "uploaded-deck",
      title: "Sunday PPTX",
      slides: [{ id: "u-1", title: "Opening", body: "Let us begin." }],
    });

    const [hostState, controllerState] = await Promise.all(uploadedStates);
    expect(hostState.currentSlide.title).toBe("Opening");
    expect(controllerState.currentSlide.title).toBe("Opening");
    expect(hostState.presentationTitle).toBe("Sunday PPTX");
  });
});

function waitForHostToken(client: TestClient): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Host token timed out.")),
      400,
    );
    client.once(socketEvents.hostToken, ({ token }) => {
      clearTimeout(timeout);
      resolve(token);
    });
  });
}

function waitForConnection(client: TestClient): Promise<void> {
  if (client.connected) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Socket connection timed out.")),
      2_000,
    );
    client.once("connect", () => {
      clearTimeout(timeout);
      resolve();
    });
    client.once("connect_error", reject);
  });
}

function waitForState(
  client: TestClient,
  predicate: (state: PresentationState) => boolean,
): Promise<PresentationState> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Presentation state timed out.")),
      2_000,
    );
    const listener = (state: PresentationState) => {
      if (predicate(state)) {
        clearTimeout(timeout);
        client.off(socketEvents.state, listener);
        resolve(state);
      }
    };
    client.on(socketEvents.state, listener);
  });
}

function waitForCount(client: TestClient, expected: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Controller count timed out.")),
      2_000,
    );
    const listener = (count: number) => {
      if (count === expected) {
        clearTimeout(timeout);
        client.off(socketEvents.controllerCount, listener);
        resolve(count);
      }
    };
    client.on(socketEvents.controllerCount, listener);
  });
}

function waitForSessionError(client: TestClient): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Session error timed out.")),
      2_000,
    );
    client.once(socketEvents.error, ({ message }) => {
      clearTimeout(timeout);
      resolve(message);
    });
  });
}
