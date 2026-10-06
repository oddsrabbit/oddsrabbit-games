"""Clover economy model for docs/rabbit-pets-economy.md (§2.6).

A rough daily model of eight kinds of player, not the game's simulation. Run
it after changing a number in the proposal and update the tables there:

    python3 rabbit-pets/dev/economy-model.py

Each day prints as total(active/garden/yard): active clover is boosted by the
clover rate; garden sprouts and the yard are flat.

The game's tests port the same players (proposal §5), so the two should move
together.
"""

START = 200
# Getting started (§2.1), by the day each step lands: steps 1–2 on day one,
# 3–4 on day two, 5 with the third gift, 6 with bond level 3. All solo.
STARTER_WEEK = {1: 340, 2: 480, 3: 400, 10: 500}
# The goals after it (goals.ts) are left out: about 1,900 over months, well
# under 1% of year one.
STREAK_LUMP = {7: 100, 30: 400, 100: 1500, 365: 5000}
BOND_LUMP = {2: 100, 3: 150, 4: 200, 5: 300, 6: 400, 7: 600}

GIFT_BASE, GIFT_STEP, GIFT_MAX = 30, 4, 80  # daily gift: 30, +4 a streak day, max 80
CARE_CLOVER, CARE_CAP = 4, 10
# Finds: ~0.65 a day (awake ~3/4 of 144 steps x 0.6%), 4 clover each, 30 for
# the 12% that are rare: about 4.6 a day, boosted.
FIND_PER_DAY = 4.6
# Wild visitors (wildlife.ts): ~1.3 a day, 7.8 clover each on average, boosted.
CRITTER_PER_DAY = 1.3 * 7.76
# Foraging (forage.ts): an 8-hour trip brings ~40 clover (boosted) plus
# berries and a find, which aren't counted. Players' `trips` a day below.
FORAGE_TRIP = 40
SUPPORTER = 1.25

# Friends: clover for the first FRIEND_PAID of each kind a day (§2.2).
FRIEND_PAID = 5
# A visit pays the visitor and the host VISIT each, flat (never boosted), plus
# WELCOME_STEP for each welcome piece that player has bought (their own level).
# Gifts are things; a golden carrot (30) is left out of the model.
VISIT, HOSTED = 10, 10
# The welcome line no longer adds to visits (2026-10-06): its pieces are meadow decor.
WELCOME_PRICES = []
WELCOME_STEP = 0

# Bond thresholds: today's up to level 7, then each gap grows by 20.
BOND_TH = [0, 12, 35, 70, 120, 190, 280]
_gap = 90
while len(BOND_TH) < 200:
    _gap += 20
    BOND_TH.append(BOND_TH[-1] + _gap)

# One-off upgrades (§2.4). Soil repeats: 600, then x1.8 a level.
ONE_OFF = {'plot2': 300, 'plot3': 600, 'can': 1000}

# The yard: flat producers, never boosted by the clover rate (Supporter aside).
# name: (first price, clover an hour, price growth per copy, max copies, reveal)
YARD = {
    'patch': (84, 0.25, 1.52, 6, lambda y, soil: True),
    'hive': (720, 1, 1.93, 3, lambda y, soil: y['patch'] >= 3),
    'log': (2880, 2, 1.99, 2, lambda y, soil: y['hive'] >= 3),
}

# The meadow (docs/rabbit-pets-garden.md §6): a gate, then outdoor decor. Until
# 2026-10-06 six of its pieces each added BOOST of a building's output; now
# none do, so MEADOW (piece: (price, building it helps)) is empty and the
# pieces are counted with the other decor in SINKS.
MEADOW_GATE = 300
BOOST = 0.10
MEADOW = {}  # its pieces stopped helping the yard on 2026-10-06: decor only

# The launch ladder's price milestones (§3.1): cumulative clover earned.
# The launch ladder (§3.1): (price, first day it can be bought). Everything is
# in the shop from day one; only the moon window waits for the fireplace
# (day 0 here). Pacing comes from prices against income.
TIER1 = [(c, 1) for c in (25, 30, 30, 35, 40, 45, 50, 60, 25, 30, 30, 45)]
TOYS = [(c, 1) for c in (50, 80, 150, 250)]
TIER2 = [(c, 1) for c in (150, 180, 200, 220, 250, 250, 280, 300, 350, 400, 450, 500, 550, 600, 700)]  # the corkboard is the second 250
FIREPLACE, MOON_WINDOW = 2000, 3000
LADDER = TIER1 + TOYS + TIER2 + [(FIREPLACE, 1), (MOON_WINDOW, 0)]

_t1, _t2 = sum(c for c, _ in TIER1), sum(c for c, _ in TOYS + TIER2) + sum(ONE_OFF.values())
MARKS = {'tier 1': _t1, 'through tier 2': _t1 + _t2, '+ fireplace': _t1 + _t2 + FIREPLACE,
         '+ moon window': _t1 + _t2 + FIREPLACE + MOON_WINDOW}


# Everything clover buys, once (from the game's catalogs, September 2026;
# the showpieces, rooms and welcome line trimmed about 40% after the review).
# The welcome line only counts for players with friends. Seasonal decor comes
# round once a year; the raffle is its expected cost to win all six prizes.
SINKS = {
    'everyday decor': 13_670, 'guest book covers': 4_600, 'seasonal decor': 8_100, 'showpieces': 52_000, 'walls, floors, windows': 8_980,
    'outfits': 13_540, 'toys': 2_630, 'meadow pieces': 12_700, 'rooms': 45_000,
    'garden upgrades and soil': 22_922, 'yard and sheds': 19_231, 'raffle': 3_907,
}
WELCOME_TOTAL = sum(WELCOME_PRICES)


def everything_day(p, days=1500):
    """The day a player has earned enough to own everything there is (or None)."""
    need = sum(SINKS.values()) + (WELCOME_TOTAL if p['friends'] >= 3 else 0)
    o = run(p, days=days)
    return next((d for d in o if o[d]['total'] >= need), None), need


def bond_pct(level):
    return 0.10 * min(level - 1, 6) + 0.02 * max(0, level - 7)


def run(p, days=365, supporter=False, meadow=True):
    bal = total = START
    bond = 0
    level = 1
    plots, soil, can = 1, 0, False
    welcome = 0
    owned = set()
    yard = {k: 0 for k in YARD}
    yard['patch'] = 1  # starter week day 1: a free clover patch
    gate, pieces, gate_day = False, set(), None
    boosts = []  # (day, piece, clover a day it added when bought)
    sup = SUPPORTER if supporter else 1
    out = {}
    for d in range(1, days + 1):
        streak = d  # opens the daily gift every day
        lump = STARTER_WEEK.get(d, 0) + STREAK_LUMP.get(streak, 0)
        bond += p['care']
        while bond >= BOND_TH[level]:
            level += 1
            lump += BOND_LUMP.get(level, 0)

        sets = 0.05 * sum(d >= x for x in p['sets'])
        n = p['friends']
        best = 0.03 * min(FRIEND_PAID, n, d // p['best_by']) if n else 0
        rate = 1 + bond_pct(level) + sets + best

        paid = min(n, FRIEND_PAID)
        friends = paid * (VISIT + HOSTED + 2 * welcome * WELCOME_STEP)
        base = (min(GIFT_MAX, GIFT_BASE + GIFT_STEP * (streak - 1)) + min(p['care'], CARE_CAP) * CARE_CLOVER + FIND_PER_DAY
                + CRITTER_PER_DAY + p.get('trips', 0) * FORAGE_TRIP)
        active = (base * rate + friends) * sup
        cycles = p['cycles'] * (1.25 if can else 1)
        garden = plots * cycles * (10 + 4 * soil) * sup  # sprouts: free seeds, 10 clover +4 a soil level
        boost = {k: BOOST * sum(1 for m in pieces if MEADOW[m][1] == k) for k in YARD}
        yard_out = sum(YARD[k][1] * c * (1 + boost[k]) for k, c in yard.items()) * 24 * sup
        income = active + garden + yard_out
        bal += income + lump
        total += income + lump

        # Buy the cheapest upgrade or yard building once there's 1.5x its price.
        opts = [('soil', round(600 * 1.8 ** soil))] if soil < 5 else []  # soil stops at level 5
        # the welcome line, only for a player with a few friends: with one it barely pays back
        if p['friends'] >= 3 and welcome < len(WELCOME_PRICES): opts.append(('welcome', WELCOME_PRICES[welcome]))
        opts += [(k, c) for k, c in ONE_OFF.items() if k not in owned
                 and (k != 'plot3' or 'plot2' in owned)]
        for k, (price, _, growth, most, reveal) in YARD.items():
            if yard[k] < most and reveal(yard, soil):
                opts.append((k, round(price * growth ** yard[k])))
        if meadow and not gate:
            opts.append(('gate', MEADOW_GATE))
        # a piece only once there's something for it to help
        if meadow and gate:
            opts += [(m, c) for m, (c, k) in MEADOW.items() if m not in pieces and yard[k] > 0]
        if p.get('shop') is not None:
            fire_owned = FIREPLACE not in [c for c, _ in p['shop']]
            here = [c for c, day in p['shop'] if (day and day <= d) or (c == MOON_WINDOW and fire_owned)]
            if here:
                opts.append(('decor', min(here)))
        if not opts:  # everything bought: nothing left to spend on
            out[d] = dict(income=round(income), active=round(active), garden=round(garden),
                          yard=round(yard_out), total=round(total), bond=level, soil=soil,
                          rate=round(rate, 2), buildings=dict(yard), boosts=list(boosts), gate=gate_day)
            continue
        kind, cost = min(opts, key=lambda o: o[1])
        # A shopper (cadence()) buys whatever is cheapest as soon as they can;
        # the plain model keeps a margin and only buys what pays back.
        if kind == 'decor':
            if bal >= cost:
                i = next(i for i, (c, _) in enumerate(p['shop']) if c == cost)
                bal -= p['shop'].pop(i)[0]
                p['bought'].append((d, 'decor'))
        elif (p.get('shop') is not None and bal >= cost) or (d > 7 and bal >= cost * 1.5):
            if p.get('shop') is not None:
                p['bought'].append((d, kind))
            bal -= cost
            if kind == 'welcome':
                welcome += 1
            elif kind == 'soil':
                soil += 1
            elif kind == 'gate':
                gate, gate_day = True, d
            elif kind in MEADOW:
                pieces.add(kind)
                k = MEADOW[kind][1]
                boosts.append((d, kind, round(YARD[k][1] * yard[k] * BOOST * 24, 1)))
            elif kind in yard:
                yard[kind] += 1
            else:
                owned.add(kind)
                plots += kind.startswith('plot')
                can = can or kind == 'can'
        out[d] = dict(income=round(income), active=round(active), garden=round(garden),
                      yard=round(yard_out), total=round(total), bond=level, soil=soil,
                      rate=round(rate, 2), buildings=dict(yard), boosts=list(boosts), gate=gate_day)
    return out


# sets: the days permanent sets finish (commons, rares, then Woodland keepsakes)
CASUAL = dict(care=5, cycles=1, sets=(60, 200, 300), best_by=14, gift_share=0.5, trips=3 / 7)
ENGAGED = dict(care=10, cycles=3, sets=(40, 120, 200, 290, 300), best_by=10, gift_share=0.6, trips=1)
# Both play every day. Casual opens the game once; engaged comes back and hits
# every daily cap. Friends are best case: each visits and gifts daily.
PLAYERS = {}
for _style, _base in (('Casual', CASUAL), ('Engaged', ENGAGED)):
    for _n in (0, 1, 5, 10):
        PLAYERS[f"{_style}, {_n or 'no'} friend{'' if _n == 1 else 's'}"] = dict(_base, friends=_n)

def cadence(p, days=120):
    """(day, what) for a player who buys the cheapest thing as soon as they can,
    one thing a day at most."""
    q = dict(p, shop=list(LADDER), bought=[])
    run(q, days=days)
    return q['bought']


if __name__ == '__main__':
    print('Everything there is to buy:', ', '.join(f'{k} {v:,}' for k, v in SINKS.items()),
          f'| welcome line {WELCOME_TOTAL:,} | total {sum(SINKS.values()):,} ({sum(SINKS.values()) + WELCOME_TOTAL:,} with friends)')
    for name in ('Casual, no friends', 'Casual, 5 friends', 'Engaged, no friends', 'Engaged, 5 friends'):
        day, need = everything_day(PLAYERS[name])
        print(f'  {name:22} earns enough to own it all ({need:,}) by day {day}')
    print('Week one, clover earned by the end of each day:')
    for name, p in PLAYERS.items():
        o = run(p, days=7)
        print(f"  {name:22} " + ' '.join(f"d{d}:{o[d]['total']}" for d in range(1, 8)))
    print('Days to earn each launch ladder milestone:', ', '.join(MARKS))
    for name, p in PLAYERS.items():
        o = run(p, days=400)
        print(f"  {name:22} " + ' '.join(str(next(d for d in o if o[d]['total'] >= t)) for t in MARKS.values()))
    print('Something new (decor, toy, upgrade or building), buying the cheapest thing when affordable:')
    for name in ('Casual, no friends', 'Engaged, no friends'):
        b = cadence(PLAYERS[name])
        decor = [d for d, k in b if k == 'decor']
        gaps = []
        for i in range(4):
            n = sum(30 * i < d <= 30 * (i + 1) for d, _ in b)
            gaps.append(f"m{i + 1}:{n} (every {30 / n:.1f}d)" if n else f"m{i + 1}:0")
        print(f"  {name:22} " + ' '.join(gaps)
              + f" | ladder done day {decor[-1] if len(decor) == len(LADDER) else 'not yet'}")
    print('The meadow: when each piece is bought, what it adds then and a year in, and its payback')
    for name in ('Casual, no friends', 'Engaged, no friends', 'Engaged, 10 friends'):
        o = run(PLAYERS[name])
        y = o[365]['buildings']
        rows = []
        for d, m, per_day in o[365]['boosts']:
            price, k = MEADOW[m]
            full = round(YARD[k][1] * y[k] * BOOST * 24, 1)
            rows.append(f"{m} d{d} +{per_day}/d→+{full}/d pays back {price / per_day:.0f}d→{price / full:.0f}d")
        print(f"  {name:22} gate d{o[365]['gate']}; " + '; '.join(rows))
        base = run(PLAYERS[name], meadow=False)
        print(f"  {'':22} year: {base[365]['total']:,} without the meadow, {o[365]['total']:,} with; "
              f"yard d365 {base[365]['yard']} → {o[365]['yard']}")
    print('Buildings pay back (first copy / last copy):', ', '.join(
        f"{k} {pr / (ph * 24):.0f}d/{pr * g ** (m - 1) / (ph * 24):.0f}d" for k, (pr, ph, g, m, _) in YARD.items()))
    for supporter in (False, True):
        print('Supporter' if supporter else 'Free', '(per day: total(active/garden/yard))')
        for name, p in PLAYERS.items():
            o = run(p, supporter=supporter)
            days = ' '.join(f"d{d}:{o[d]['income']}({o[d]['active']}/{o[d]['garden']}/{o[d]['yard']})"
                            for d in (7, 30, 90, 180, 365))
            print(f"  {name:22} {days} | year {o[365]['total']:,} "
                  f"| bond {o[365]['bond']} soil {o[365]['soil']} rate x{o[365]['rate']} yard {o[365]['buildings']}")
