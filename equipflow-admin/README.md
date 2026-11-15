# EquipFlow Admin

The website for **administrators only**: sign in, see how things stand, approve or reject sign-ups, and look
after people and their ID cards. It is a separate site from the borrower site (`equipflow`) and talks to the same
EquipFlow API. Built with React (JSX), Vite and React Router. It is deliberately **not a PWA** (nothing
installable, no service worker); only the borrower site is.

## Run it

You need Node.js 18 or newer, and the EquipFlow API running (by default on `http://localhost:8000`).

```bash
npm install
npm run dev            # opens on http://localhost:3001
```

If the API is somewhere else, copy `.env.example` to `.env` and change `VITE_API_URL`. The API only accepts browsers
coming from the addresses in its `CORS_ORIGINS` setting (`http://localhost:3001` is already allowed).

**Try it with demo data** (in the backend folder, on an empty database):

```bash
python -m scripts.seed_demo
uvicorn app.main:app --port 8000
```

Sign in with `admin` / `password123`. The demo has a teacher waiting for approval, students in different
departments and programs, and one overdue book. (For a real installation, create your admin with
`python -m scripts.create_admin` instead and use your own password.)

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server with instant reload on port 3001 |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serves the production build on port 3001 |
| `npm test` | Runs the tests (no backend needed) |
| `EQUIPFLOW_E2E=1 npm test` | Also runs the end-to-end tests (`e2e.test.jsx`, `e2e.catalog.test.jsx`) against the real running API + demo data |

## What is in it

| Page | What an admin does there |
|---|---|
| **Sign in** | Own login page and endpoint. Student, teacher and staff accounts are refused, with the same message as a wrong password. There is no "register" link; admins are created with the backend script. |
| **Dashboard** | What needs attention (waiting sign-ups, overdue items, unpaid fines), equipment and people numbers, and the overdue list. |
| **Approvals** | Teachers and staff who signed up and chose their role. **Approve** lets them link their ID card; **Reject** asks for an optional reason (emailed if the server has email set up) and removes the request, so they can sign up again. The side menu shows how many are waiting. |
| **Users** | Everyone, with chips to browse by **department** and then **program** (with counts), plus search, role, status and year level. For lost cards: **Deactivate card** (stops working at once) and **Reissue card** (unlinks it so a new one can be linked at the kiosk). |

| **Equipment** | Three tabs. **Items**: search and filter (type, category, status), add, edit and delete; genres appear only for books. **Categories**: loan days and fine per day; the type is locked once a category has items. **Genres**: add, rename, delete (books move to another genre, or are left without one). |
| **Loans** | **Loans** tab: the borrowing history with search, state and date filters, and **Mark lost** / **Mark damaged** (which charge the borrower). **Fines** tab: unpaid fines first, with the total owed; **Mark paid**, **Waive** (with a note) and **Set unpaid** to fix a mistake. |
| **Reports** | Two tabs, each with a date range, **Download CSV** and **Print / Save as PDF** (a clean light page, without the menu and buttons, that says which report, which dates and who made it). **Usage**: summary numbers, most borrowed, often returned late, by category, busiest weekdays and hours, items that may need maintenance. **Fines paid**: who paid each fine and the date and time, newest first, with the total collected and number of people; switch to *Waived fines* to see forgiven ones. |
| **Programs** | The degree programs students choose when they sign up, grouped by department: add, rename, delete. A program that students use cannot be deleted until you choose where they move. |

## How the code is organised (a reading guide)

It follows the borrower site's structure, so what you learn there carries over.

| File | What it shows |
|---|---|
| `src/main.jsx`, `src/App.jsx` | Entry point and **routing**: which page appears at which address |
| `src/auth.jsx` | **Context**: who is signed in; admin-only checks (a second check besides the API's) |
| `src/api.js` | The only file that talks to the API (own token key `equipflow-admin.token`) |
| `src/hooks/useApi.js`, `useDebounce.js` | Custom hooks: loading/error/retry, and waiting for typing to pause |
| `src/components/Layout.jsx` | The side menu (a top bar on phones), the "waiting" count, theme and sign-out buttons |
| `src/components/Modal.jsx`, `ConfirmDialog.jsx` | An accessible pop-up: focus, Escape, click outside |
| `src/events.js` | How one page tells another something changed (approvals -> the menu count) |
| `src/pages/Approvals.jsx` | Actions with confirmation, busy states, messages and errors |
| `src/components/FormDialog.jsx`, `Tabs.jsx`, `Pager.jsx` | The three small pieces the newer pages share: a dialog with a form, tabs, and page buttons |
| `src/pages/Equipment.jsx`, `pages/equipment/*` | Tabs with an add/edit form in a dialog; one small file per tab |
| `src/pages/Transactions.jsx`, `pages/transactions/*` | Loans and fines; actions that ask first and say what happened |
| `src/pages/Reports.jsx`, `pages/reports/*`, `src/utils/csv.js`, `components/PrintMeta.jsx` | Reports with a date range, bars drawn with plain `div`s, a CSV download, and a print layout (`@media print` at the end of `styles.css`) |
| `src/pages/Programs.jsx` | Lists that are added to, renamed and deleted (with "move them first") |
| `src/pages/Users.jsx` | Filters that reset paging, chips, a table that becomes cards on a phone, pagination |
| `src/theme.jsx` | Light / dark / system, saved on the device |
| `src/noPwa.test.js` | A guard that fails if anyone adds PWA pieces to this site |
| `src/*.test.*`, `src/pages/*.test.jsx`, `src/test/` | How each part is tested; `helpers.jsx` fakes the API, `e2e.test.jsx` uses the real one |

## Good to know

- **Two sites, one API.** Each site keeps its own saved login and theme (different addresses never share
  browser storage). The API checks the role on every request, so the admin pages are protected by the server,
  not only by this site.
- **Sessions** last as long as the API's token lifetime (`ACCESS_TOKEN_MINUTES`, 8 hours by default); an expired
  login sends you back to the sign-in page.
- **Light and dark mode** follow the computer by default; the button at the bottom of the side menu switches.
  Colours are variables at the top of `src/styles.css`, and the design uses solid colours only.
- **Hover effects** apply only with a mouse, never on touch screens.

## Putting it online

`npm run build` produces static files in `dist/`; any static host works. Because the site uses addresses like
`/users`, configure the host to serve `index.html` for unknown paths. Add the site's address to the API's
`CORS_ORIGINS`, set `VITE_API_URL` before building, and consider restricting the site to the school network.
