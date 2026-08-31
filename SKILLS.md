# PreachSync — SKILLS.md

## Project Purpose

PreachSync is an offline-first church presentation control system.

Its primary use case is:

A preacher uses a phone, tablet, or another browser-capable device to remotely control a presentation running on a separate presentation computer over the same local network.

The MVP must work without internet access.

The presentation computer is always the authoritative host and source of truth.

---

## MVP Goal

Build the smallest usable demo that proves this interaction:

1. Presentation computer opens PreachSync Host.
2. Host displays a presentation with several hardcoded slides.
3. A controller device connects over the same local network.
4. Controller can press:

   * Previous
   * Next
5. The presentation computer changes slides immediately.
6. All connected controllers receive the updated presentation state.
7. Keyboard controls on the host also update all connected controllers.

Do not build features outside this MVP unless explicitly requested.

---

# Core Product Principle

The Host owns presentation state.

Controllers send commands.

Controllers must never be treated as the authoritative source of presentation state.

Correct flow:

Controller
→ command
→ Host
→ Presentation Engine
→ updated state
→ broadcast state
→ all clients

Example:

Controller emits:

NEXT

Host processes:

currentSlideIndex += 1

Host broadcasts:

PRESENTATION_STATE

All connected clients update themselves from that state.

---

# Technology Stack

Use:

* TypeScript
* React
* Next.js App Router
* Tailwind CSS
* Socket.IO
* npm workspaces
* Turborepo monorepo

For the MVP, do NOT use:

* Electron
* Tauri
* PostgreSQL
* Prisma
* Docker
* AWS
* Redis
* Authentication
* User accounts
* External APIs
* Cloud services

These may be added later.

---

# Repository Structure

Use this structure:

preachsync/
├── apps/
│   ├── host/
│   └── controller/
│
├── packages/
│   └── shared/
│
├── package.json
├── turbo.json
└── tsconfig.json

## apps/host

The presentation computer application.

Responsibilities:

* Render the current presentation slide.
* Own presentation state.
* Provide keyboard navigation.
* Run or connect to the Socket.IO host server.
* Process controller commands.
* Broadcast presentation state.
* Show basic connection status.

## apps/controller

The preacher/controller application.

Responsibilities:

* Connect to the PreachSync host over LAN.
* Display connection state.
* Display current slide information.
* Send presentation commands.
* Update when host state changes.

## packages/shared

Shared contracts only.

Examples:

* Slide types
* Presentation types
* Socket event names
* Command payloads
* Presentation state payloads
* Demo slide data if appropriate

Do not put React components in `shared`.

---

# Domain Model

Use a simple domain model.

```ts
export interface Slide {
  id: string;
  title: string;
  body: string;
  notes?: string;
}

export interface Presentation {
  id: string;
  title: string;
  slides: Slide[];
}

export interface PresentationState {
  presentationId: string;
  currentSlideIndex: number;
  totalSlides: number;
  currentSlide: Slide;
}
```

For the MVP, use one hardcoded presentation.

Example slides:

1. Welcome
2. John 3:16
3. Faith
4. Prayer
5. Thank You

---

# Presentation Engine

Presentation logic must not be tightly coupled to React UI.

Create a small presentation engine or equivalent pure logic layer.

It must support:

```ts
next()
previous()
goTo(index)
getState()
```

Rules:

* `next()` must never exceed the final slide.
* `previous()` must never go below index 0.
* `goTo(index)` must validate the index.
* The host remains the source of truth.
* Every successful state change must result in a state broadcast.

Prefer predictable, testable functions over complex state abstractions.

---

# Socket.IO Protocol

Create strongly typed shared event contracts.

Use explicit event names.

Recommended events:

Controller → Host

```ts
"presentation:next"
"presentation:previous"
"presentation:goto"
"presentation:request-state"
```

Host → Controller

```ts
"presentation:state"
"session:connected"
"session:error"
```

Do not use generic event names such as:

```ts
"message"
"update"
"action"
```

unless specifically justified.

---

# Socket Payloads

Example command:

```ts
socket.emit("presentation:next");
```

Example state:

```ts
{
  presentationId: "demo-presentation",
  currentSlideIndex: 1,
  totalSlides: 5,
  currentSlide: {
    id: "slide-2",
    title: "John 3:16",
    body: "For God so loved the world..."
  }
}
```

Controllers must update from `presentation:state`.

Do not have controllers calculate what the next state should be.

---

# Network Requirements

The MVP must support LAN usage.

Example:

Host PC:

192.168.1.25

Controller:

http://192.168.1.25:3001

Socket:

http://192.168.1.25:4000

The apps must not assume localhost when a configurable host address is required.

Use environment variables where appropriate.

Examples:

Host:

```env
SOCKET_PORT=4000
```

Controller:

```env
NEXT_PUBLIC_PREACHSYNC_HOST=http://192.168.1.25:4000
```

During development, localhost defaults are acceptable.

---

# Host Application Requirements

The host interface should prioritize presentation readability.

Required UI:

* PreachSync title or small indicator
* Current slide
* Slide title
* Slide body
* Slide number, e.g. `2 / 5`
* Connected controller count
* Socket server status

Keyboard controls:

* ArrowRight → next
* PageDown → next
* Space → next
* ArrowLeft → previous
* PageUp → previous

Prevent slide index overflow.

When keyboard navigation changes the slide:

* Update host UI.
* Broadcast new presentation state to controllers.

---

# Controller Application Requirements

Design mobile-first.

Required UI:

* PreachSync
* Connection indicator
* Current slide number
* Current slide title
* Optional current slide preview/body
* Large Previous button
* Large Next button

Buttons must be large enough for stage use.

The Next button should be visually dominant.

Controller behavior:

1. Connect to host.
2. Request current presentation state.
3. Render received state.
4. Send commands only.
5. Receive updated state from host.

Show a clear disconnected state.

Do not crash if the host is unavailable.

---

# Visual Design

For the MVP:

* Dark UI
* High contrast
* Minimal distractions
* Large typography
* Large touch targets
* Responsive layout
* Accessible button labels
* Avoid unnecessary animation

Presentation host should feel clean on a projector.

Controller should be usable one-handed on a phone.

Do not spend excessive implementation time on visual polish.

Functionality and reliability are higher priority.

---

# State Management

Avoid adding Redux, Zustand, MobX, or other state-management libraries for the MVP.

Use:

* React state
* React hooks
* Small shared utilities

Only add a state library later if complexity genuinely requires it.

---

# Error Handling

Handle at minimum:

* Socket connection failed.
* Socket disconnected.
* Host unavailable.
* Invalid `goTo` index.
* Commands received while no presentation exists.
* Controller requests state immediately after connecting.

Do not expose raw stack traces in the UI.

Log useful development errors to the console.

---

# Reliability Rules

Presentation commands must be idempotent where reasonable.

Repeated `next` commands at the last slide must leave the application on the last slide.

Repeated `previous` commands at slide zero must leave it at slide zero.

A newly connected controller must receive the current host state immediately.

Multiple connected controllers must stay synchronized.

Example:

Controller A presses Next.

Host changes from slide 2 → 3.

Host broadcasts slide 3.

Controller A shows slide 3.

Controller B also shows slide 3.

---

# Coding Standards

Use strict TypeScript.

Avoid `any`.

Prefer:

```ts
unknown
```

with narrowing when the incoming data is uncertain.

Use named exports unless framework conventions require otherwise.

Prefer small focused modules.

Avoid giant components.

Avoid premature abstraction.

Avoid duplicated socket event strings.

Define event names/contracts in `packages/shared`.

Use descriptive names.

Bad:

```ts
const data = ...
const doIt = ...
```

Good:

```ts
const presentationState = ...
const advancePresentation = ...
```

---

# Component Guidelines

Components should have a clear responsibility.

Examples:

Host:

```text
PresentationStage
ConnectionStatus
SlideCounter
```

Controller:

```text
ControllerHeader
ConnectionBadge
CurrentSlideCard
PresentationControls
```

Do not create components for trivial single-line markup.

---

# Security Scope

This is a local-network MVP.

Do not implement full authentication yet.

However:

* Do not execute arbitrary controller-provided code.
* Validate numeric slide indexes.
* Do not expose filesystem access through sockets.
* Do not trust arbitrary payloads.

Session PIN/QR pairing belongs to the next milestone.

---

# Testing

At minimum, test the presentation engine.

Test:

* starts at slide zero
* next
* previous
* final slide boundary
* first slide boundary
* valid goTo
* invalid goTo

If practical, also test socket event behavior.

Do not introduce an unnecessarily large test framework.

---

# MVP Acceptance Criteria

The MVP is complete when all of the following work:

## Host

* Runs locally.
* Shows five hardcoded slides.
* Keyboard navigation works.
* Cannot navigate outside slide bounds.
* Socket server accepts controller connections.
* Shows connected controller count.

## Controller

* Opens on a phone connected to the same Wi-Fi.
* Connects to host.
* Clearly indicates connection state.
* Shows current slide number/title.
* Previous works.
* Next works.

## Synchronization

* Phone Next changes host slide.
* Phone Previous changes host slide.
* Host keyboard navigation changes controller state.
* Two controller browser tabs stay synchronized.
* Refreshing the controller restores current host state.
* Joining mid-presentation shows the current slide rather than slide 1.

---

# Explicitly Out of Scope

Do not implement:

* PowerPoint import
* PPTX rendering
* PDF import
* Bible search
* Song database
* QR pairing
* PIN pairing
* Login
* Accounts
* Church organizations
* Cloud sync
* Database
* Presenter notes editor
* Presentation editor
* OBS
* Livestream
* Scheduling
* Analytics
* AI
* Mobile native application
* Electron packaging

These are future milestones.

---

# Future Architecture Awareness

Avoid decisions that prevent these features later:

* Electron/Tauri desktop host
* PPTX import
* PDF import
* Bible slides
* Song lyrics
* Multiple presentation displays
* Confidence monitor
* OBS output
* QR pairing
* Session PINs
* Cloud sync
* Multiple churches
* Multiple presenters

However, do not implement abstractions solely for hypothetical future requirements.

Keep the MVP simple.

---

# Cursor Working Rules

When implementing this project:

1. Inspect the existing repository before making changes.
2. Preserve working project conventions unless they conflict with this document.
3. Do not install unnecessary dependencies.
4. Do not rewrite unrelated files.
5. Keep changes focused on the requested milestone.
6. Run TypeScript checks after implementation.
7. Run linting after implementation.
8. Run tests where available.
9. Fix errors introduced by your changes.
10. Clearly summarize modified files and how to run the result.

If a design choice is ambiguous, prefer the simplest solution that satisfies the MVP and preserves the Host-as-source-of-truth architecture.

---

# Definition of Done

Do not claim completion simply because the code compiles.

The task is complete only when the full interaction works:

Controller device
→ Next
→ Socket command
→ Host changes presentation
→ Host broadcasts authoritative state
→ Controller receives state
→ UI stays synchronized

That interaction is the core of PreachSync.
