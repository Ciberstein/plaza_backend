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
| `TRUST_PROXY` | defaults to `0`. Behind a proxy that is wrong, and every rate limit becomes one shared bucket — see below |

`TRUST_PROXY` is the number of proxies in front of this process: `0` locally,
`1` behind a single load balancer, which is what Render, Railway, Fly and
Heroku each give you. **It has to match the real topology, and being wrong in
either direction breaks something quietly.**

Too low, and every request looks like it came from the proxy: the whole
internet shares one bucket, and ten failed logins by anybody lock out
everybody. Too high — including setting it at all when nothing is in front —
and Express believes the `X-Forwarded-For` header, which is written by whoever
is calling. Both were measured rather than assumed: against a limit of 90 a
minute, a direct caller forging the header at `TRUST_PROXY=0` was refused after
90 requests, and at `TRUST_PROXY=1` with no proxy present the same caller got a
fresh 90 for every address it invented. That is rate limiting switched off
while still looking switched on, which is why the default is `0` and why the
server says so on boot when it is `0` in production.

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
GET    /public/meta              categories, countries, cities, regions,
                                 shipping, conditions, delivery options,
                                 rate units, and the property vocabulary
GET    /public/products          kind, q, category, cityId, shopId, limit, offset
                                 kind is good (default), service or property
                                 category and cityId take several, comma
                                 separated; a parent category brings its
                                 children with it
                                 kind=property also takes: operation, region,
                                 propertyCondition, minPrice, maxPrice,
                                 minArea, maxArea, bedrooms, bathrooms,
                                 parking (minimums), stratum, features
GET    /public/products/:id
GET    /public/products/:id/questions
GET    /public/products/:id/reviews
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
GET    /user/shops/:id/members   the roster; any member may read it
POST   /user/shops/:id/members   invite by username or email — owner only
DELETE /user/shops/:id/members/:accountId   remove somebody, or leave
GET    /user/invitations         shops asking after me
POST   /user/invitations/:id/accept   and /decline

GET    /user/visits              what I asked to see
GET    /user/visits/received     what I have been asked to show
POST   /user/visits              ask to see a property — mail limited
POST   /user/visits/:id/accept   opens both sides' contact details
POST   /user/visits/:id/decline

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
POST   /user/orders/:id/parts/:subOrderId/received

GET    /user/ratings/mine        what this person has already rated
POST   /user/ratings/seller      subOrderId, stars, comment
POST   /user/ratings/product     productId, stars, body

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

**What is limited is what costs someone something.** `middlewares/throttle.middlewares.js`
holds four ceilings, and they are not one number applied everywhere because the
things being protected are not alike. A baseline over the whole API catches the
blunt hammer. Browsing and searching are lower, because a search cannot use an
index and so one request costs whatever the catalogue happens to weigh.
Uploads and anything that sends mail are keyed **by account rather than by
address**: an address is shared by everyone behind a carrier's NAT and rotated
at will by anyone who cares, while an account costs a verified email — the
price of a fresh bucket should be higher than the price of waiting. On top of
that, one person may leave at most three unanswered questions on one listing,
because twenty questions an hour across twenty listings is a curious shopper
and twenty on one is a seller being shouted at, and a rate limit cannot tell
those apart.

**A service is a listing, not a second kind of row.** `products.kind` is
`good` or `service`, and one table carries both. Five things point at a
listing — a basket line, a favourite, a photograph, an order line, a question —
and a separate `services` table would have made every one of those
relationships polymorphic to spare four columns. What actually differs is
small: a service is priced by `rateUnit` (an hour, a day, the whole job) or
not priced at all, has no condition, and has no shelf. What it shares is
everything else.

**Nothing comes off a shelf a service does not have.** Stock is untouched when
one is ordered and untouched again when the order is cancelled — restocking it
would hand a provider free inventory on every cancellation until "3 available"
appeared on something that never had a shelf — and `stockStatus` returns early
for them, or every service would go `out_of_stock` the moment it was published.

**A quoted service keeps a null price all the way to the order line.** A
contractor cannot cost a renovation before seeing the room, so `price` and
`order_items.unitPrice` are both nullable. Zero was the alternative and it is a
worse record: it says somebody agreed to work for nothing. The order total sums
what was priced, and the rest is settled once the seller accepts — which is
what the pending → confirmed → contact-revealed flow was already for.

**A service is asked for on its own.** It is refused from the basket and
refused inside an order that holds anything else: a plumber and a pair of
headphones under one order that is confirmed, handed over and cancelled as a
single thing is not what either of them is.

**The two category trees never mix.** `categories.kind` splits them, the form
is only ever offered the tree matching what is being published, and the API
refuses a listing filed against the other one — a caregiver under Televisores
is a listing no shopper will ever find. Slugs stay unique across both, so a
category URL needs no aisle in it.

**Every category ends in "Otros".** A taxonomy is a guess about what people
will sell and it is always wrong at the edges; without a way out, whoever has
the thing nobody anticipated files it under whatever looks nearest and it goes
unfound. One per parent rather than one at the top, because a single global
catch-all is a drawer nobody opens while "Tecnología → Otros" still turns up
for anyone browsing technology. The seeder appends it rather than the data
files listing it, so a category added later cannot be left without one.

**Either side can close a purchase, and that is what makes ratings mean
anything.** Only the seller could mark one delivered, which put them in charge
of the door reputation opens behind — and the seller likeliest to leave it shut
is the one about to be rated badly. `POST /user/orders/:id/parts/:id/received`
is the buyer's own way, landing on the same `delivered` status: there is no
"delivered by them" and "received by me" to reconcile later.

**Nothing about a rating is taken on the rater's word.** A seller rating hangs
off the suborder, uniquely, and that one column does three jobs: it proves the
transaction happened, it names who is being rated, and being unique it is what
stops the same purchase being rated twice. A product review checks a delivered
order line for that listing on that account. An entry condition the reviewer
can assert is a review system with no information in it.

**Ratings cannot be edited, and that is a feature.** An editable rating is one
a seller can lean on a buyer to revise, and the person a reputation system has
to protect first is the one telling the truth about a bad experience. A second
attempt is refused rather than overwriting.

**Two tables, because they aggregate onto different things.** A seller rating
is about conduct and averages onto an account; a review is about whether an
object is any good and averages onto a listing. Unlike the products/services
case, nothing else points at either, so there is no shared machinery to be
gained by merging them — only a nullable column meaning "this one is about the
person". Reviews are unique per account and product rather than per purchase:
somebody who buys the same coffee four times has one opinion of it.

**Averages are one grouped query, never one per row.** A page of forty-eight
cards each asking for its own average is forty-eight round trips to answer
something the database totals in a single pass, and the result is rounded to
one decimal — nobody chooses between sellers on the second.

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

### Properties are a listing plus a second table

`market.properties` holds one row per property listing, keyed on `productId`
as both primary and foreign key. The listing keeps everything a property shares
with a shirt — seller, shop, city, title, photographs, price, status — and only
what a shirt has no answer to lives in the second table.

The alternative was a table of its own, and it was measured rather than argued.
Of `Product`'s fifteen columns a property uses ten unchanged, and of the six
tables that point at a listing it wants three: photographs, favourites and
questions. A separate table would have meant duplicating the whole upload
pipeline and the question thread to spare five null columns.

What it does **not** want is the other three. The basket and the order endpoints
refuse `kind === "property"` outright — and the refusal in
`middlewares/user/orders.middlewares.js` is the one that matters, because that
middleware builds its list from the **request body** rather than from the basket
table. Blocking it only in the basket would have left the order endpoint
reachable by anyone willing to send a product id by hand.

Reviews and seller ratings need a delivered suborder, so they are already
impossible here and need no guard.

### Visits are what a property has instead of an order

There is no suborder to confirm, so the rule that governs contact details
everywhere else in Plaza has nothing to hang on. `market.visit_requests`
replaces it: somebody asks, the owner accepts or declines, and **only on
acceptance** does either side get the other's email, phone and the full address.
Pending and declined requests answer with nulls, decided in
`controllers/user/visits.controllers.js` from the row itself rather than by a
caller who might get it wrong.

One request per person per listing, enforced by a unique index rather than by a
controller remembering. A declined request cannot be reopened by asking again:
an owner who said no has said no.

### The address has three levels, and the phone has two

Copied from idealista, which was checked rather than assumed: it *requires* the
exact address — a map cannot be drawn without one — and lets the advertiser
choose how much of it shows. `addressVisibility` is `exact`, `street` or
`hidden`; the column always holds the whole thing, and `publicAddress()` trims
it on the way out. The split is on `#`, which is where a Colombian address stops
naming the street and starts naming the door.

What is deliberately **not** copied is idealista charging €9.90 a month to hide
it and ranking the listing lower for it. That incentive belongs to idealista's
business, not to a seller's safety.

`phonePublic` is off by default and governs the phone alone. Email is never
published. The phone is fetched in a **second query** in the public detail
endpoint rather than added to the shared `SELLER` include, because a phone
column on that include would travel with every product page whether or not
anybody meant to publish it, and one `toJSON()` spread would put it in the
response.

### A shop can hold more than one person

`Shop.accountId` is the owner and always was. A collaborator is a row in
`market.shop_members` with `acceptedAt` set. That is the whole role system,
encoded structurally — an enum with two values would only be a second place for
them to disagree.

**The shop is the seller.** `Product.accountId` stopped meaning "the seller" and
now means "who created it", which needed no migration because for every row that
existed the two were the same person. A listing under a shop belongs to the
shop: any member may edit it, answer its questions, accept its visits and handle
its orders. An agency that loses an agent does not lose the flats or the stars.

Every check goes through `utils/shopAccess.util.js`. Nine call sites read it,
which is the point — nine copies of an authorisation rule is nine chances to
update eight of them.

**Two refusals are load-bearing.** A pending invitation grants nothing at all:
joining a shop makes you its public representative, so it cannot be something
done *to* you. And deleting a listing stays with whoever created it or with the
owner — it is the only irreversible action in the catalogue, and archiving,
which is usually what somebody means, is open to everyone.

`SubOrder.handledBy` records who confirmed, and that is who the buyer's contact
details point at from then on. It falls back to `accountId`, which is not a
compromise: for every shopless seller and every suborder written before this,
the two are the same account.

`SellerRating.shopId` is written alongside `sellerId`, always. A shop's average
groups on one and a person's on the other, so a rating survives a shop closing
rather than vanishing with it.

## Known gaps

- **Payments.** `Order.status` and `paidAt` exist and are unused; the webhook
  router is mounted and empty. `app.js` already preserves the raw body, which
  payment providers need to check their signatures.
- **Phone numbers are not verified.** Anyone can enter ten invented digits and
  they are revealed as theirs. The email verification flow is the pattern to
  copy when this matters.
- **Ownership cannot be transferred.** A shop's owner is its owner. Handing that
  over is its own flow with its own confirmations, and it is not built.
- **No map.** `properties.latitude` and `longitude` exist and are empty. They
  are in the schema from the start so that drawing a map later is a feature and
  not a migration across every row. Whatever draws it has to respect
  `addressVisibility`: a pin on the exact address publishes the address
  regardless of what the owner chose.
- **Almost no tests.** Two exceptions: `scripts/smoke-members.js`, 23 checks,
  most of them asserting what a collaborator *cannot* do — the half nobody
  notices is broken. And `scripts/smoke-properties.js` — 41
  checks against a real database, covering the two new tables, the address
  rules, the validators, the grid filters and the cascade. It creates what it
  needs and removes it. `scripts/seed-properties-demo.js` is separate and is
  demonstration data, not reference data.
