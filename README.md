# Plaza — API

Marketplace engine for Colombia. Many sellers, one square.

A listing belongs to a **person**, not to a shop. Anyone with an account can
sell under their own name; a shop is an optional brand you request, Plaza
reviews, and then trade under. That single decision explains most of the shape
of this codebase — `products.shopId` is nullable, and so is `suborders.shopId`.

No money moves through Plaza. An order is an agreement between two people who
then settle it on handover.

---

## Running it

```bash
npm install
cp .env.example .env      # fill it in, see below
npm run dev               # nodemon on PORT, default 4000
```

`npm start` runs it without the watcher.

Postgres has to be reachable and the database named in `DB_DATABASE` has to
exist. Everything inside it is created on boot: schemas, tables, missing
columns and indexes. There is no separate migration command.

### What the environment needs

The full list with comments is in [`.env.example`](.env.example). The ones
without a sensible default:

| Variable | Without it |
|---|---|
| `DB_*` | the server will not boot |
| `JWT_SECRET_SEED` | sessions cannot be signed |
| `CORS_ORIGINS` | defaults to `http://localhost:5173`, and credentials forbid a wildcard, so the list is explicit |
| `RESEND_API_KEY` | mail is skipped, every send reports false, the server still boots |
| `CLOUDINARY_*` | upload endpoints answer `503` rather than failing at 500 |

`CLOUDINARY_FOLDER` decides the root every upload is filed under, `plaza` by
default. One Cloudinary account usually serves every environment, so give each
one its own root and a photo uploaded while testing never lands beside a real
seller's.

---

## How it is laid out

```
app.js            express, cors, helmet, the router tree
server.js         boot: connect, sync, migrate, listen
routes/           auth · public · user · admin · webhook
controllers/      the same four groups
middlewares/      auth, and one per resource for validation and ownership
models/           sequelize definitions and their associations
database/         connection, schemas, and the migrations that run at boot
utils/            cloudinary, hashing, slugs, and the shared rules
mail/             templates and the Resend wrapper
seeders/          categories and geography
```

Five schemas, one per domain: `accounts`, `auth`, `app`, `geo`, `market`. Everything
about selling lives in `market`.

### Boot

`server.js` connects, runs `db.sync({ force: false })`, then
`ensureColumns()` and `ensureIndexes()` from `database/migrations.js`.

`sync` creates tables that do not exist and **never touches one that does**, so
a column added to a model after its table was created is silently absent. That
is what the migrations file is for: a list of `ADD COLUMN IF NOT EXISTS`, a list
of columns to make nullable, a list to drop, and a list of indexes. All of it is
idempotent and runs on every start.

Indexes are **attempted, not assumed**. A unique index cannot be built over data
that already breaks it, and refusing to boot over historical duplicates would
take the API down for something only a person can decide. It logs what is in the
way and applies itself once the way is clear.

---

## The API

Everything is under `/api/v1`. `GET /ping` answers `pong` outside it.

Sessions are a **httpOnly cookie**, so every browser request needs
`credentials: "include"` and the origin has to be in `CORS_ORIGINS`.

### `/auth` — rate limited

The credential endpoints allow 10 attempts per 15 minutes. These are the ones
worth brute forcing.

```
POST   /auth/register
POST   /auth/login
POST   /auth/logout
GET    /auth/session
POST   /auth/verify              confirm the email with a code
POST   /auth/verify/resend
POST   /auth/password/forgot
POST   /auth/password/reset
```

Usernames are unique **ignoring case**, enforced by a functional index on
`LOWER(username)` and checked at both places a name is set. `Ana` and `ana` are
the same person to every reader, and on a marketplace where the name sits beside
a listing, allowing both is an impersonation waiting to happen.

### `/public` — no session

```
GET    /public/meta              categories, countries, cities, shipping,
                                 conditions, delivery options
GET    /public/products          q, category, cityId, shopId, limit, offset
GET    /public/products/:id
GET    /public/products/:id/questions
GET    /public/shops
GET    /public/shops/:slug
```

`meta` is the vocabulary every form and filter is built from, served rather than
duplicated in the client: adding a category is one row, and the two sides cannot
drift into disagreeing about what a valid value is.

A listing is **listed** when it is active and its shop, if it has one, is open.
It is **addressable** when it is active or paused. A paused listing keeps its own
URL on purpose: whoever bookmarked it should be told the seller paused it, not
told it never existed. Draft, out of stock and archived are not the public's
business at all.

### `/user` — behind the session

```
GET    /user/account             PATCH to change name and phone
POST   /user/account/email       and /email/confirm
PATCH  /user/account/password
POST   /user/account/avatar      DELETE to remove it

GET    /user/products            POST to create, PATCH to edit
POST   /user/products/:id/publish
POST   /user/products/:id/archive
DELETE /user/products/:id
POST   /user/products/:id/images   PATCH to reorder, DELETE one by id

GET    /user/cart                DELETE to empty
GET    /user/cart/count
POST   /user/cart/:productId     PATCH the amount, DELETE the line

GET    /user/favourites          and /ids
POST   /user/favourites/:productId    DELETE to unsave

GET    /user/orders              POST to place one
GET    /user/orders/:id
POST   /user/orders/:id/parts/:subOrderId/cancel

GET    /user/sales
POST   /user/sales/:id/confirm
POST   /user/sales/:id/deliver
POST   /user/sales/:id/cancel

GET    /user/questions           what buyers asked, unanswered first
POST   /user/questions           ask one, productId in the body
POST   /user/questions/:id/answer

GET    /user/shops               POST to request one, PATCH to edit
POST   /user/shops/:id/logo      DELETE to remove it
POST   /user/shops/:id/submit    withdraw · close · reopen
```

Status is never settable from a request body. Every transition is its own
endpoint with its own rule, because a single writable `status` field is exactly
what lets a seller approve themselves.

### `/admin`

```
GET    /admin/shops
POST   /admin/shops/:id/approve   reject · suspend · restore
```

Going live is not one of a seller's transitions. A shop is a brand other people
are asked to trust, so it does not open because its owner said so.

---

## Decisions worth knowing before you change something

**A suborder belongs to a seller, not to a shop.** An order is split into one
part per seller *and* storefront: the same person selling one thing under their
own name and another under their shop is two counters, and a buyer deals with
each separately. Each part is confirmed, handed over and cancelled on its own.

**Cancelling is not symmetric.** The buyer may call a part off while the seller
has not answered. Once the seller accepts, they have set stock aside and may
have turned someone else down for it, so only they can release the buyer. Both
sides may leave a reason, and the row records which of them cancelled —
"cancelled" alone does not tell the other person whether to wait or look
elsewhere.

**Placing an order takes the stock down.** No money moves online, so an order is
a promise rather than a receipt, but a promise that does not hold the item back
lets three people be promised the same one. Cancelling puts it back, added to
whatever is on the shelf now rather than to what was there then.

**Contact details are revealed once and only once there is a reason.** The email
always, the phone if the person added one, to both sides, when a part is
confirmed and never before. They are nulled server-side rather than hidden by
the interface: if they travelled on every response and only the page declined to
draw them, placing an order and reading the response would be a way of
harvesting people.

**A question's answer is a column, not another question.** `product_questions`
holds the seller's reply in `answer` and `answeredAt` rather than in a second
row pointing back with a `replyTo`. A self-referencing table would model a
thread, and the controller would then have to forbid, one rule at a time,
everything the schema still allowed: two answers to one question, an answer to
an answer, a stranger answering in the seller's place. There is exactly one
answer and it always comes from the same person, so "answered once, by the
seller" is a fact of the table instead of a rule someone has to remember.

**Questions are anonymous, and that is enforced by what is selected.**
`accountId` is on every row — it is how an answer reaches whoever asked, and how
a seller is stopped from asking on their own listing — and it is in no response,
the seller's inbox included. The attribute lists name the columns to send rather
than deleting one afterwards, because a field that is never selected cannot be
forgotten about later.

**Mail escapes everything a person typed.** Clients render HTML, so a question
containing a link would arrive as a link in the seller's inbox, in a message
from Plaza's own address and carrying Plaza's name — a phishing mail we posted
ourselves. Titles, usernames and free text all go through `escape` in
`mail/templates.js`; only the markup that file writes gets to be markup.

**Nothing about money comes off the request.** A basket says what and how many;
prices are read from the same table the listing page reads, and copied into
`order_items` so that what someone agreed to pay keeps reading the same after
the seller edits the price or deletes the listing.

**A listing that leaves the square leaves every basket holding it.** That is why
the cart is a table and not something in the browser: pausing, archiving or
selling out deletes the rows, and no server can reach into someone else's
localStorage.

**Uploads are filed one folder per record** — `plaza/accounts/{id}`,
`plaza/shops/{id}`, `plaza/products/{id}` — so removing the record can take the
whole folder, including whatever the database lost track of. The record is
always cleared first: storage that will not answer must not keep a photo
attached to someone who asked to remove it.

---

## Known gaps

- **Payments.** `Order.status` and `paidAt` exist and are unused; the webhook
  router is mounted and empty. `app.js` already preserves the raw body, which
  payment providers need to check their signatures.
- **Phone numbers are not verified.** Anyone can enter ten invented digits and
  they are revealed as theirs. The email verification flow is the pattern to
  copy when this matters.
- **Shops have one owner.** `suborders.accountId` and `products.accountId` mean
  a seller, and there is no membership table, so a shop cannot be run by several
  people yet.
