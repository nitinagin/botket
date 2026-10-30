# BOTKET — Personal Robotics Platform

BOTKET is an early-stage personal robotics platform prototype. The public pages demonstrate a potential consumer journey; they are **not** a live marketplace, checkout, device-control service, or compatibility certification system.

## Consumer journey

Open [the consumer prototype](consumer.html) from the site or locally. Its five destinations are available in the bottom navigation on mobile:

| Step | What works in the prototype | What is **not** provided |
| --- | --- | --- |
| **Discover** | Browse and search illustrative robot concepts; add concepts to a demo cart or start a separate demo profile. | Live inventory, verified product listings, purchasing. |
| **Checkout** | Review a temporary demo cart and illustrative totals, optionally using a nickname; preview an order. | Order submission, reservations, payment collection, fulfillment. |
| **My Robots** | Create, search, and remove up to 30 local demo profiles with nickname, brand, and model. | Ownership verification, registration with manufacturers, hardware connections. |
| **Skills** | Explore generic skill concepts and choose a local demo profile for context. | Compatibility verification, installation, execution on a robot. |
| **Services** | Explore generic service previews and add them to the demo cart. | Eligibility verification, technician assignments, bookings, service requests. |

**Important:** Selecting a demo robot profile does not establish that any skill or service works with that robot. The illustrative prices are not offers to sell. The consumer prototype makes no real transactions or external robot connections.

## Local data and privacy

- Demo robot profiles are stored in the current browser using `localStorage` under `botket-demo-robots-v1`, when browser storage is available. If storage is unavailable, profiles may exist only until the page is closed or reloaded.
- Demo cart contents and checkout preview nickname are page-session state, not submitted orders.
- Use a nickname rather than personal information. Do not enter serial numbers, payment credentials, or sensitive data into the prototype.
- Clearing local profiles removes the browser's demo entries; it does not change a physical robot or a manufacturer's account.

## Pages and project layout

- `index.html` — landing page and navigation to the prototype and other concept pages.
- `consumer.html` — five-step consumer prototype (Discover → Checkout → My Robots → Skills → Services).
- `verify.html`, `community.html`, `intelligence.html`, `academy.html` — other exploratory pages.
- `tests/consumer-smoke.test.mjs` — Node.js smoke and regression checks.
- `tests/consumer-browser.test.mjs` — browser journeys using locally installed Chrome/Chromium.
- `.github/workflows/consumer-smoke.yml` and `.github/workflows/consumer-browser.yml` — corresponding CI jobs.

This is a static HTML/JavaScript prototype. No package installation is needed for the Node.js smoke tests.

## Run and test locally

Use Node.js 22 (the version used in CI). From the repository root:

```sh
node --test tests/consumer-smoke.test.mjs
```

For the browser journeys, install Google Chrome or Chromium and run:

```sh
node --test tests/consumer-browser.test.mjs
```

To browse the static pages locally, serve the repository directory with a local HTTP server, for example:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/consumer.html` in a browser. The browser test also requires a working Chrome/Chromium executable; a smoke-test pass alone does not establish browser behavior.

## Safe contribution checklist

1. Preserve all five destinations, keyboard navigation, accessible names/status messages, and mobile layouts.
2. Keep prototype boundaries explicit in visible copy and accessible descriptions: **demo only**, **no payment/order**, **no robot connection**, and **compatibility/eligibility unverified**.
3. Make the smallest practical change, add regression coverage when behavior changes, and run the relevant smoke and browser tests.
4. Check the actual diff and GitHub Actions results before merging. A successful Pages build does not, by itself, prove the public URL is reachable or visually correct.
5. Never add simulated payment success, fabricated integrations, fake vendor inventory, or unverified compatibility claims as if they were real.

## Deployment and status

The repository is configured for GitHub Pages. The [repository Actions page](https://github.com/nitinagin/botket/actions) is the source of record for individual CI and deployment runs. The public prototype is intended to be accessible via [GitHub Pages](https://nitinagin.github.io/botket/), subject to the repository's Pages and custom-domain configuration. Confirm actual URL reachability separately from a green deployment status.
