// Journal > Graphs (GDD 08 7.2): a series picker (population by caste, brood by stage, stores, intake, deaths by cause, nest
// volume, nest and surface temperature) and a range (last 3 days, last year, all) over one chart.
import { useMemo, useState } from 'preact/hooks';
import { Select } from '../../components/Select';
import { SegmentedControl } from '../../components/SegmentedControl';
import type { UiJournal } from '../../api';
import { Chart } from './Chart';
import { buildChart, CHARTS, RANGES, type RangeId } from './charts';

export function GraphsTab({ j }: { j: UiJournal }) {
  const [chartId, setChartId] = useState<string>(CHARTS[0].id);
  const [range, setRange] = useState<RangeId>('3d');
  const def = CHARTS.find((c) => c.id === chartId) ?? CHARTS[0];
  const model = useMemo(() => buildChart(def, j, range), [def, j, range]);
  return (
    <div class="pn-graphs" data-testid="journal-graphs">
      <div class="pn-graph-controls">
        <div class="pn-field is-inline">
          <span>Graph</span>
          <Select aria-label="Graph" value={chartId} options={CHARTS.map((c) => ({ value: c.id, label: c.label }))} onChange={setChartId} />
        </div>
        <SegmentedControl aria-label="Range" fill={false} value={range} onChange={(v: RangeId) => setRange(v)} options={RANGES.map((r) => ({ value: r.id, label: r.label }))} />
      </div>
      <h2 class="pn-h2">{def.label}</h2>
      <Chart model={model} seasonLength={j.seasonLength} />
    </div>
  );
}
