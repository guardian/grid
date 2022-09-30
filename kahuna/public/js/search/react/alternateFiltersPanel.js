// eslint-disable-next-line no-unused-vars
import React from "react";
import {renderQuery, structureQuery} from "../structured-query/syntax";
// eslint-disable-next-line no-unused-vars
import {LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip} from 'recharts';
import moment from "moment";

// FIXME change to typescript

const not = (predicate) => (_) => !predicate(_);

const ONE_DAY_IN_MILLIS = 24 * 60 * 60 * 1000;
const THREE_DAYS_IN_MILLIS = 3 * ONE_DAY_IN_MILLIS;

export const AlternateFiltersPanel = ({filter, updateFilter, filterPanelStuff, filterPanelStuffNew}) => {

  const dateHistogramData = filterPanelStuff?.dateHistogram && Object.entries(filterPanelStuff.dateHistogram).map(([key, value]) => ({
    epoch: new Date(key).getTime(),
    count: value
  })).sort((a, b) => a.epoch - b.epoch);

  const minEpoch = dateHistogramData?.[0]?.epoch;
  const maxEpoch = dateHistogramData?.[dateHistogramData.length - 1]?.epoch;

  const dateFormatStr = (maxEpoch - minEpoch) > THREE_DAYS_IN_MILLIS ? "D MMM 'YY" : "H:mm, D MMM 'YY";

  const structuredQuery = filter?.query && structureQuery(filter.query) || [];

  const checkboxClausesWithPredicates = Object.entries(filterPanelStuff?.items || {}).map(([label, instance]) => ({
    label,
    instance: {
      ...instance,
      newCount: filterPanelStuffNew?.items?.[label]?.count
    },
    predicate: (_) =>
      _.type === instance.type &&
      _.filterType === instance.filterType &&
      _.key === instance.key &&
      _.value === instance.value
  }));

  return checkboxClausesWithPredicates.length === 0 ? null : (
    <div style={{
      userSelect: "none",
      padding: "5px",
      borderBottom: "1px solid #565656",
      display: "flex"
    }}>
      ⚛️
      <div style={{
        flexShrink: 0
      }}>
        {checkboxClausesWithPredicates.map(clause => (
          <label key={clause.label} style={{display: "block"}}>
            <input type="checkbox"
                   checked={!!structuredQuery?.find(clause.predicate)}
                   onChange={e => {
                     const isChecked = e.target.checked;
                     const newStructuredQuery = isChecked
                       ? [...structuredQuery, clause.instance]
                       : structuredQuery.filter(not(clause.predicate));
                     updateFilter({...filter, query: renderQuery(newStructuredQuery)});
                   }}
            />
            {clause.label} ({clause.instance.count.toLocaleString()}{clause.instance.newCount ? ` +${clause.instance.newCount.toLocaleString()} NEW` : ""})
          </label>
        ))}
      </div>
      { dateHistogramData &&
        <ResponsiveContainer height={150} width="99%">
          <LineChart
            data={dateHistogramData}
            margin={{
              top: 5,
              right: 30,
              left: 20,
              bottom: 5
            }}
          >
            <XAxis
              dataKey="epoch"
              tickFormatter={(epoch) => moment(epoch).format(dateFormatStr)}
              domain={[minEpoch, maxEpoch]}
              type="number"
            />
            <YAxis dataKey="count" />
            <Line type="monotone" dataKey="count" stroke="#8884d8" activeDot={{ r: 8 }} />
            <Tooltip labelFormatter={(epoch) => moment(epoch).format(dateFormatStr)}/>
          </LineChart>
        </ResponsiveContainer>
      }
    </div>
  );
};
