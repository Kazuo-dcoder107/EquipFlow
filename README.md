# EquipFlow (borrower site)

The website for **students, teachers and staff**: see what you have borrowed and when it is due,
check fines, get recommendations, and browse the equipment and books. Built with React (JSX), Vite
and React Router, and it is an installable **PWA**. Admins use a separate site (`equipflow-admin`).

## Run it

You need Node.js 18 or newer, and the EquipFlow API running (by default on `http://localhost:8000`).

```bash
npm install
npm run dev            # opens on http://localhost:3000
```

If the API is somewhere else, copy `.env.example` to `.env` and change `VITE_API_URL`.
The API only accepts browsers coming from the addresses in its `CORS_ORIGINS` setting
(`http://localhost:3000` is already allowed).

**Try it with demo data** (in the backend folder, on an empty database):

```bash
python -m scripts.seed_demo
uvicorn app.main:app --port 8000
```

Then sign in with `24-0001` / `password123` (Juan: loans, an overdue book, an unpaid fine) or
`24-0002` (Maria). `T-002` is a teacher waiting for approval, `24-0003` a student who still has to
link an ID card.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server with instant reload on port 3000 |
| `npm run build` | Production build into `dist/` (also generates the PWA files) |
| `npm run preview` | Serves the production build on port 3000 (use this to try the PWA) |
| `npm test` | Runs the tests (no backend needed) |
| `EQUIPFLOW_E2E=1 npm test` | Also runs the end-to-end tests against the real running API + demo data |

## How the code is organised (a reading guide)

Read in this order; each file builds on the one before.

| File | What it shows |
|---|---|
| `src/main.jsx` | The entry point: wraps the app in the router and the login provider |
| `src/App.jsx` | **Routing**: which page appears at which address; protected vs public pages |
| `src/auth.jsx` | **Context**: sharing "who is logged in" with every component; login/logout |
| `src/api.js` | The only file that talks to the API: token, errors, one function per endpoint |
| `src/hooks/useApi.js` | A **custom hook**: loading, error and retry for any API call, in one place |
| `src/pages/Login.jsx` | **State and forms**: controlled inputs, submitting, showing errors |
| `src/components/ProtectedRoute.jsx`, `Layout.jsx` | Guarding pages, and a shared frame with `<Outlet />` |
| `src/pages/Home.jsx` | Several independent data sections on one screen |
| `src/pages/MyLoans.jsx` | Deriving lists from one response; tabs |
| `src/pages/Browse.jsx` | Filters, debounced search (`hooks/useDebounce.js`), "show more" paging |
| `src/components/*Card.jsx`, `FineTicket.jsx` | Small presentational components that only receive props |
| `src/theme.jsx` | **Context again**: the light/dark preference, saved on the device and applied to `<html data-theme>` |
| `src/utils/format.js` | Plain functions (dates, "due in 2 days", pesos), easy to test |
| `src/*.test.*`, `src/pages/*.test.jsx` | How each part is tested; `src/test/helpers.jsx` fakes the API |

The flow for any screen is the same: **page** calls `useApi(() => api.something())` ->
`api.js` sends the request with the saved token -> the page draws `loading`, `error` or `data`.

## Screens

Sign in, Register (students, teachers and staff pick their role; teacher and staff accounts wait for
an admin's approval), Home, My loans (current and history, with days left), Fines (tickets with a QR
reference for the counter), For you (recommendations with the reason for each), Browse (search,
category, genre, available only) and Profile (account, ID card status, install, sign out).

## Light and dark mode

Profile -> Appearance offers **System** (follows the phone, the default), **Light** and **Dark**; the
sun/moon button in the top bar flips between light and dark quickly. The choice is saved in the
browser (`equipflow.theme`). A small script in `index.html` applies it before the page first draws, so
there is no white flash, and `src/theme.jsx` keeps it in sync afterwards (including the address-bar colour).

All colours are variables at the top of `src/styles.css`, defined once for light and once for dark, and
the design uses solid colours only. To change the look, edit those values.

## The PWA

Only this site is a PWA (`vite-plugin-pwa`, configured in `vite.config.js`).

- It generates the manifest and a service worker **only in the production build**, so use
  `npm run build && npm run preview` to try it. In Chrome on `localhost` an install icon appears.
- The service worker caches the app itself (HTML, JS, CSS, icons) so it opens quickly and shows a
  friendly message when offline. **API calls are never cached**, so loans and fines are always live.
- Phones only offer "Install" over **HTTPS** (or `localhost`). A plain `http://192.168.x.x` address
  will load the site but will not install. For a real deployment, serve the site over HTTPS.
- A new version of the site updates itself the next time the app is opened.

## Putting it online

`npm run build` produces static files in `dist/`; any static host works. Because the app uses
addresses like `/loans`, configure the host to serve `index.html` for unknown paths (a "single-page
app fallback"). Add the site's address to the API's `CORS_ORIGINS`, and set `VITE_API_URL` before
building so the site knows where the API is.

## Known limits

- My loans and Home read up to the latest 200 loans, and Fines up to 100 tickets.
- The fine QR code holds the ticket reference (e.g. `EQUIPFLOW-FINE-000012`). Paying is done at the
  counter by an admin; there is no online payment.
- Borrowing itself happens at the kiosk (tap your ID, scan the item), not on this site.
