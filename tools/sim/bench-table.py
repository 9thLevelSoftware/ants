#!/usr/bin/env python3
"""Tables of the colony benches (tools/sim/bench-colony.ts, colony-life round 3).

  python3 tools/sim/bench-table.py DIR [BEFORE_DIR]

DIR holds bench-<mode>-<archetype>-<seed>.json files of one mode. With BEFORE_DIR the medians of both are printed
side by side (the acceptance rule: a fix is accepted when its mechanism counter moves in the median over the 15)."""
import glob, json, os, statistics, sys

ORDER = [(a, s) for s in (1, 2, 3) for a in ('woodland-edge', 'suburban-garden', 'playground-park', 'car-park-verge', 'kitchen-door')]
SHORT = {'woodland-edge': 'we', 'suburban-garden': 'sg', 'playground-park': 'pp', 'car-park-verge': 'cpv', 'kitchen-door': 'kd'}


def load(d):
    out = {}
    for f in glob.glob(os.path.join(d, 'bench-*.json')):
        r = json.load(open(f))
        o = r['options']
        out[(o['archetype'], o['seed'])] = r
    return out


def forage_row(r):
    f, p, gd = r['funnel'], r.get('prey') or {}, max(r['gd'], 1e-6)
    dl = f['delivered']
    c = sum(v['c'] for v in dl.values())
    pp = sum(v['p'] for v in dl.values())
    br = r['handover'].get('benchRates') or {'c': 1, 'p': 1}
    th = f['tripsHome']
    app = sum((p.get('appeared') or {}).values())
    return {
        'trips': th['n'], 'success%': round(100 * th['ok'] / th['n'], 1) if th['n'] else 0,
        'C/need': round(c / gd / br['c'], 3), 'P/need': round(pp / gd / br['p'], 3),
        'prey appeared': app, 'chased': p.get('chased', 0), 'subdued': p.get('subdued', 0),
        'catch% of chased': round(100 * p.get('subdued', 0) / p['chased'], 1) if p.get('chased') else 0,
        'prey loads home': p.get('loadsHome', 0), 'prey P home': p.get('pHome', 0),
        'discovered': sum(f['scouting']['discovered'].values()),
        'patch edge BU': f['preyPatches']['nearestBu'],
    }


def nest_row(r):
    f, b = r['funnel'], r['funnel']['brood']
    days = r['days']
    temps = [d.get('broodTempC') for d in days[1:4] if d.get('broodTempC') is not None]
    care = r.get('care') or []
    larva = sum(c['larvaGd'] for c in care)
    deaths = b['deaths']
    return {
        'workers': f"{r['handover']['workers']}->{days[-1]['workers']}", 'laid': b['eggsLaid'], 'hatched': b['hatched'],
        'pupated': b['pupated'], 'eclosed': b['eclosed'],
        'untended': sum(v for k, v in deaths.items() if k.endswith(':untended')),
        'starved': deaths.get('larva:starvation', 0), 'flood': sum(v for k, v in deaths.items() if k.endswith(':flooding')),
        'other losses': sum(v for k, v in deaths.items() if not (k.endswith(':untended') or k.endswith(':flooding') or k == 'larva:starvation')),
        'diapause@end': b['diapauseAtEnd'], 'alive@end': sum(b['aliveAtEnd'].values()),
        'lay open': f['queen']['potentialOpenShare'], 'lay permitted': f['queen']['permittedShare'],
        'brood C d1-3': round(statistics.mean(temps), 1) if temps else None,
        'hungry larva %': round(100 * sum(c['hungryLarvaGd'] for c in care) / larva) if larva > 0 else None,
        'nurse wgd': round(sum(c['nurseGd'] for c in care), 1), 'queen-care wgd': round(sum(c['queenCareGd'] for c in care), 1),
    }


def table(runs, rowf):
    rows = [(k, rowf(runs[k])) for k in ORDER if k in runs]
    if not rows:
        return [], {}
    cols = list(rows[0][1].keys())
    lines = ['| run | ' + ' | '.join(cols) + ' |', '|---' * (len(cols) + 1) + '|']
    for (a, s), r in rows:
        lines.append(f'| {SHORT[a]} #{s} | ' + ' | '.join(str(r[c]) for c in cols) + ' |')
    med = {}
    for c in cols:
        xs = [r[c] for _, r in rows if isinstance(r[c], (int, float))]
        med[c] = statistics.median(xs) if xs else '-'
    lines.append('| **median** | ' + ' | '.join(str(round(med[c], 3) if isinstance(med[c], float) else med[c]) for c in cols) + ' |')
    return lines, med


def main():
    d = sys.argv[1]
    runs = load(d)
    mode = next(iter(runs.values()))['options']['mode'] if runs else 'nest'
    rowf = forage_row if mode == 'forage' else nest_row
    lines, med = table(runs, rowf)
    print(f'### bench {mode}: {d} ({len(runs)} runs)\n')
    print('\n'.join(lines))
    if len(sys.argv) > 2:
        b = load(sys.argv[2])
        common = {k: v for k, v in runs.items() if k in b}
        _, ma = table(common, rowf)
        _, mb = table({k: b[k] for k in common}, rowf)
        print(f'\nMedians over the {len(common)} runs in both (before {sys.argv[2]} -> after):\n')
        for c in ma:
            print(f'- {c}: {mb.get(c)} -> {ma[c]}')


if __name__ == '__main__':
    main()
