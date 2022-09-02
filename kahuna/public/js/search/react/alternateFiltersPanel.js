// eslint-disable-next-line no-unused-vars
import React from "react";
import {renderQuery, structureQuery} from "../structured-query/syntax";

// FIXME change to typescript

const not = (predicate) => (_) => !predicate(_);

export const AlternateFiltersPanel = ({filter, updateFilter, filterPanelItems, filterPanelItemsNewCounts}) => {

  const structuredQuery = filter?.query && structureQuery(filter.query) || [];

  const checkboxClausesWithPredicates = Object.entries(filterPanelItems || {}).map(([label, instance]) => ({
    label,
    instance: {
      ...instance,
      newCount: filterPanelItemsNewCounts?.[label]?.count
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
      <div>
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
    </div>
  );
};
