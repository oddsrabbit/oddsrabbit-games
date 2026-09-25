"""Clover economy model for docs/rabbit-pets-economy.md (§2.6).

A rough daily model of eight kinds of player, not the game's simulation. Run
it after changing a number in the proposal and update the tables there:

    python3 rabbit-pets/dev/economy-model.py

Each day prints as total(active/garden/yard): active clover is boosted by the
clover rate; garden sprouts and the yard are flat.

The game's tests port the same players (proposal §5), so the two should move
together.
"""

START = 100
# Starter week: goals unlock one day at a time; all reachable solo (§2.1).
STARTER_WEEK = {1: 100, 2: 70, 3: 70, 4: 50, 5: 30, 6: 30, 7: 100}
STREAK_LUMP = {7: 50, 30: 200, 100: 750, 365: 2500}
BOND_LUMP = {2: 50, 3: 75, 4: 100, 5: 150, 6: 200, 7: 300}

GIFT_BASE, GIFT_STEP, GIFT_MAX = 15, 2, 40  # daily gift: 15, +2 a streak day, max 40
CARE_CLOVER, CARE_CAP = 2, 10
FIND_PER_DAY = 1.2  # about 0.5 finds a day, mostly commons
SUPPORTER = 1.25

# Friends: clover for the first FRIEND_PAID of each kind a day (§2.2).
FRIEND_PAID = 5
VISIT, SEND, HOSTED, CLOVER_GIFT = 3, 1, 4, 10

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
    'patch': (250, 0.25, 1.3, 10, lambda y, soil: True),
    'hive': (2000, 1, 1.35, 5, lambda y, soil: y['patch'] >= 3),
    'log': (8000, 2, 1.4, 5, lambda y, soil: y['hive'] >= 5),
}

# The launch ladder's price milestones (§3.1): cumulative clover earned.
# The launch ladder (§3.1): (price, first day it can be bought). Everything is
# in the shop from day one; only the moon window waits for the fireplace
# (day 0 here). Pacing comes from prices against income.
TIER1 = [(c, 1) for c in (25, 30, 30, 35, 40, 50, 60, 25, 30, 30, 45)]
TOYS = [(c, 1) for c in (50, 80, 150, 250)]
TIER2 = [(c, 1) for c in (150, 180, 200, 220, 250, 280, 300, 350, 400, 450, 500, 550, 600, 700)]
FIREPLACE, MOON_WINDOW = 2000, 3000
LADDER = TIER1 + TOYS + TIER2 + [(FIREPLACE, 1), (MOON_WINDOW, 0)]

_t1, _t2 = sum(c for c, _ in TIER1), sum(c for c, _ in TOYS + TIER2) + sum(ONE_OFF.values())
MARKS = {'tier 1': _t1, 'through tier 2': _t1 + _t2, '+ fireplace': _t1 + _t2 + FIREPLACE,
         '+ moon window': _t1 + _t2 + FIREPLACE + MOON_WINDOW}


def bond_pct(level):
    return 0.10 * min(level - 1, 6) + 0.02 * max(0, level - 7)


def run(p, days=365, supporter=False):
    bal = total = START
    bond = 0
    level = 1
    plots, soil, can = 1, 0, False
    owned = set()
    yard = {k: 0 for k in YARD}
    yard['patch'] = 1  # starter week day 1: a free clover patch
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
        friends = paid * (VISIT + SEND + HOSTED) + min(n, FRIEND_PAID, round(n * p['gift_share'])) * CLOVER_GIFT
        base = min(GIFT_MAX, GIFT_BASE + GIFT_STEP * (streak - 1)) + min(p['care'], CARE_CAP) * CARE_CLOVER + FIND_PER_DAY
        active = (base + friends) * rate * sup
        cycles = p['cycles'] * (1.25 if can else 1)
        garden = plots * cycles * (4 + 2 * soil) * sup
        yard_out = sum(YARD[k][1] * c for k, c in yard.items()) * 24 * sup
        income = active + garden + yard_out
        bal += income + lump
        total += income + lump

        # Buy the cheapest upgrade or yard building once there's 1.5x its price.
        opts = [('soil', round(600 * 1.8 ** soil))]
        opts += [(k, c) for k, c in ONE_OFF.items() if k not in owned
                 and (k != 'plot3' or 'plot2' in owned)]
        for k, (price, _, growth, most, reveal) in YARD.items():
            if yard[k] < most and reveal(yard, soil):
                opts.append((k, round(price * growth ** yard[k])))
        if p.get('shop') is not None:
            fire_owned = FIREPLACE not in [c for c, _ in p['shop']]
            here = [c for c, day in p['shop'] if (day and day <= d) or (c == MOON_WINDOW and fire_owned)]
            if here:
                opts.append(('decor', min(here)))
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
            if kind == 'soil':
                soil += 1
            elif kind in yard:
                yard[kind] += 1
            else:
                owned.add(kind)
                plots += kind.startswith('plot')
                can = can or kind == 'can'
        out[d] = dict(income=round(income), active=round(active), garden=round(garden),
                      yard=round(yard_out), total=round(total), bond=level, soil=soil,
                      rate=round(rate, 2), buildings=dict(yard))
    return out


CASUAL = dict(care=5, cycles=1, sets=(60, 200), best_by=14, gift_share=0.5)
ENGAGED = dict(care=10, cycles=3, sets=(40, 120, 200, 290), best_by=10, gift_share=0.6)
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
    for supporter in (False, True):
        print('Supporter' if supporter else 'Free', '(per day: total(active/garden/yard))')
        for name, p in PLAYERS.items():
            o = run(p, supporter=supporter)
            days = ' '.join(f"d{d}:{o[d]['income']}({o[d]['active']}/{o[d]['garden']}/{o[d]['yard']})"
                            for d in (7, 30, 90, 180, 365))
            print(f"  {name:22} {days} | year {o[365]['total']:,} "
                  f"| bond {o[365]['bond']} soil {o[365]['soil']} rate x{o[365]['rate']} yard {o[365]['buildings']}")
