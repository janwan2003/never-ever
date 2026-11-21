---
slug: never-ever
stage: idea
priority: 4
url:
repo:
updated: 2026-11-21
---

# never-ever

## Thesis

**Who:** Friend group chats, uni friends, cousins, colleagues and families: anyone who has played
"Never have I ever" at a party, a sleepover or a Christmas table. Teens and young adults first,
with family-safe packs for parents and work teams.

**What:** A no-login, asynchronous "Never have I ever" round for a group chat. One person starts a
round (a themed pack of 10 statements: "Christmas edition", "Travel", "Work", "School days") and can
add one or two of their own. Each member opens the link, types a nickname and taps *I have* /
*Never* / *Pass* on each statement. Answers stay sealed until everyone has answered (or a deadline).
Then the reveal plays statement by statement: the split ("5 of 7 have…"), who has (named for
normal packs; counts only for "anonymous" packs the creator can choose), and the surprises the app
spots: "Only Maya has ever…", "Nobody has ever…", "The group's most innocent: Tom (2/10)". A new pack
drops every week; members can suggest statements for next week's round.

**Needs others:** yes. The answers are the content; one person's answers reveal nothing.

**Viral moment:** the reveal's surprises, especially "Only [name] has…" lines, and the
end card: a grid of statements × members with the group's "most experienced" and "most innocent".
People post it in the chat and the "only you?!" replies start the conversation.

**How often:** weekly packs, plus event rounds (Christmas party, hen/stag do, first week of term).
The ritual is the Sunday pack and the deadline reveal.

**Why now:** the game is universal but every digital version is one phone passed around a room
(many App Store titles, one claiming 5M+ players since 2010) or a live room app. In a group chat,
people play it by hand, posting statements and emoji replies, which shows answers one by one and
lets everyone copy the herd. Nothing we found seals answers until all have answered.

### The six questions

1. **Why the group IS the input:** the reveal is built only from members' answers ("only you",
   "nobody", the split). With one player there is nothing to reveal.
2. **Reveal moment:** sealed answers open together once everyone has answered (or at the deadline),
   played as a one-statement-at-a-time slideshow so the surprises land one after another.
3. **Ritual or deadline:** weekly pack (default Sunday 6 pm, reveal next evening), seasonal packs
   in the next 4 weeks (Christmas, New Year's Eve), event packs (hen do, office party).
4. **30-second join:** open link → nickname → 10 taps. No typing beyond the nickname.
5. **Screenshot-worthy result:** the end card ("Christmas edition · 7 players · Only Maya has
   cried at a work party · Most innocent: Tom"), plus the full grid for the chat. The link preview
   shows live state ("Christmas edition · 4 of 7 have answered · reveal at 8 pm").
6. **Why a joiner creates their own:** the reveal ends with "Play this pack with another group"
   (one tap, new link), and seeing your friends' answers makes you curious about your family's or
   your team's. Members who suggested a statement get to see it played next week.

## Market evidence

Searches run 2026-11-21. Sources are search-result summaries, not opened pages, unless noted.

- **Existing apps are one-device pass-around or live rooms, mostly install-only with paywalls:**
  - [I Have Never Original (iOS)](https://apps.apple.com/app/id942757760): claims "over 5 million
    players since 2010" (developer claim); one phone, read aloud.
  - Many similar one-device titles: [Never Have I Ever • Party Game](https://apps.apple.com/app/id874926543),
    [Never Have I Ever](https://apps.apple.com/app/id917718075), [I Never Party](https://apps.apple.com/app/id486085869)
    (2,000+ questions), adult "dirty" variants (e.g. [Never Ever: Dirty & Evil](https://apps.apple.com/US/app/id1390646086)),
    most with in-app purchases or subscriptions.
  - [Never Have I Ever: Multiplayer (iOS)](https://apps.apple.com/us/app/-/id6761686582): private
    online rooms, real-time; install required, live only.
  - Windows Store versions ([1](https://apps.microsoft.com/detail/9p64082z0gfd), [2](https://apps.microsoft.com/detail/9mvzdv6c5dtb?hl=en-US)),
    an [itch.io browser version](https://loristergames.itch.io/never-have-i-ever) (single screen).
- **How people play it now in chats and calls:** texting guides describe posting a statement and
  replying with a "finger pointing up" emoji ([Daily Dot, texting games](https://www.dailydot.com/irl/texting-games/));
  icebreaker guides suggest it for Zoom and virtual office parties ([Livestorm](https://livestorm.co/ice-breaker-games/never-have-i-ever)).
  Weakness: replies are visible one by one, so people copy or hold back, and nothing is summarised.
- **Size of the habit:** large statement-list pages from Bustle, Jotform, Science of People,
  SignUpGenius and Yahoo ([Bustle](https://www.bustle.com/life/never-have-i-ever-questions),
  [Jotform](https://www.jotform.com/blog/never-have-i-ever-questions/),
  [SignUpGenius](https://www.signupgenius.com/resources/never-have-i-ever-questions)) show steady
  search interest; [Wikipedia](https://en.wikipedia.org/wiki/Never_have_I_ever) notes card and online versions.
  No search-volume figure was found; this is qualitative.

## Our edge

- **Loop: needs others.** The game is the group's answers.
- **K estimate ≈ 1.6** = 7 invited per round × 70% who answer (10 taps and curiosity about the
  reveal) × 32% of joiners who later run a round with another group. Reason: everyone has a family
  chat, a work chat and a friends chat, the packs are pre-written so starting costs one tap, and the
  reveal makes you want to know what *another* group would say. Weakest factor: joiner → creator;
  the end card must carry "Play this pack with another group".
- Beats one-phone apps on async play (works in a chat across cities) and sealed answers; beats
  chat-by-hand on honesty (no herd effect) and the summarised reveal; no install, no paywall.
- **Content rules (charter rule 3, no adult content):** PG-13 packs only, written in-house; no
  sex/drug packs; custom statements are word-filtered and visible to the creator, who can remove
  them. "Pass" is always allowed and shown as a pass, so nobody is forced to answer.
- **Risks:** "Never have I ever" is a generic game name, but a Netflix series shares the title;
  brand the product with its own name and use the phrase only descriptively.

## Status

Idea only. Nothing built. Evidence above from web search on 2026-11-21.

## Next steps

1. Write 12 original PG-13 packs of 10 statements (Christmas, New Year's Eve, travel, school days,
   work, family, food, phones, holidays...) and choose a product name.
2. Design the reveal slideshow, the end card and the live link preview first.
3. Build on Cloudflare Pages + Functions + D1 (`pb-never-ever`): round, statements, members,
   answers (have/never/pass), reveal rule, anonymous-pack flag; rate limit per IP; dynamic OG image.
4. Playwright end-to-end test: creator + 3 members answer → reveal → card renders at phone and
   desktop width.
5. Live by ~2026-12-12 with the Christmas pack.

## Monetization plan

None now (rule 4). Later: optional extra packs or a supporter tip once the operator can take money.

## Log

- 2026-11-21 scout: created from scouting session; evidence from 3 web searches (search-result
  summaries, pages not opened). Not built.
